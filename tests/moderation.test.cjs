const test=require('node:test');const assert=require('node:assert/strict');
const {addReportFlag,applyModeration,canReadReport,buildAdminAnalytics,reportsCsv,validateAdminDates}=require('../.test-build/moderation.js');
const {findMatches}=require('../.test-build/matching.js');const {applyClaimAction,canMessageClaim}=require('../.test-build/claim-workflow.js');
const timestamp='2026-11-13T10:00:00Z';const reason='Reviewed the unsafe or misleading report details';
const fixture=()=>({users:['owner','claimant','stranger','admin'].map(id=>({id,name:id,role:id==='admin'?'admin':'student',joinedAt:timestamp})),
  reports:[{id:'found',ownerId:'owner',type:'found',category:'Phone',status:'open',title:'Samsung Galaxy A54 blue',brand:'Samsung',color:'blue',location:'Campus Library',description:'Blue cover and sticker',occurredOn:'2026-11-13',createdAt:timestamp},{id:'lost',ownerId:'claimant',type:'lost',category:'Phone',status:'open',title:'Samsung Galaxy A54 blue',brand:'Samsung',color:'blue',location:'Campus Library',description:'Blue cover and sticker',occurredOn:'2026-11-13',createdAt:timestamp}],
  claims:[{id:'claim',reportId:'found',relatedReportId:'lost',claimantId:'claimant',status:'pending',createdAt:timestamp}],messages:[{id:'message',claimId:'claim'}],notifications:[],activity:[]});
const hide=(db,hidden=true)=>applyModeration(db,'admin',{type:'visibility',id:'found',hidden,reason},timestamp);
test('moderation: flags validate reason, identity, own report and duplicate open submissions',()=>{
  const db=fixture();const flagged=addReportFlag(db,'stranger','found',reason,'flag',timestamp);assert.equal(flagged.reportFlags.length,1);
  assert.throws(()=>addReportFlag(flagged,'stranger','found',reason,'other',timestamp),/open flag/);
  assert.throws(()=>addReportFlag(db,'owner','found',reason,'flag',timestamp),/own/);
  assert.throws(()=>addReportFlag(db,'missing','found',reason,'flag',timestamp),/Sign in/);
  assert.throws(()=>addReportFlag(db,'stranger','found','short','flag',timestamp),/reason/);
  assert.throws(()=>addReportFlag(hide(db),'stranger','found',reason,'flag',timestamp),/unavailable/);
});
test('moderation: hiding preserves report/claim/chat, resolves flags and audits a required reason',()=>{
  const db=addReportFlag(fixture(),'stranger','found',reason,'flag',timestamp);const next=hide(db);
  assert.equal(next.reports[0].hidden,true);assert.equal(next.claims,db.claims);assert.equal(next.messages,db.messages);
  assert.equal(next.reportFlags[0].status,'actioned');assert.equal(next.activity[0].reason,reason);assert.equal(next.notifications.at(-1).userId,'owner');
  assert.equal(hide(next),next);const restored=hide(next,false);assert.equal(restored.reports[0].hidden,false);assert.equal(restored.activity[0].action,'Report restored');
});
test('moderation: non-admin actions and self-suspension fail; suspension/restore and dismissal audit reasons',()=>{
  const db=fixture();assert.throws(()=>applyModeration(db,'stranger',{type:'visibility',id:'found',hidden:true,reason},timestamp),/Admin/);
  assert.throws(()=>applyModeration(db,'admin',{type:'suspend',id:'admin',suspended:true,reason},timestamp),/yourself/);
  assert.throws(()=>applyModeration(db,'admin',{type:'visibility',id:'found',hidden:true,reason:'short'},timestamp),/reason/);
  const suspended=applyModeration(db,'admin',{type:'suspend',id:'stranger',suspended:true,reason},timestamp);assert.equal(suspended.users.find(u=>u.id==='stranger').suspended,true);
  const flagged=addReportFlag(db,'stranger','found',reason,'flag',timestamp);const dismissed=applyModeration(flagged,'admin',{type:'dismiss',id:'flag',reason},timestamp);assert.equal(dismissed.reportFlags[0].status,'dismissed');
  assert.throws(()=>applyModeration(dismissed,'admin',{type:'dismiss',id:'flag',reason},timestamp),/no longer open/);
});
test('moderation: hidden reports remain readable only to owner, Admin and existing participants, including linked report owner',()=>{
  const db=hide(fixture());for(const id of ['owner','claimant','admin'])assert.equal(canReadReport(db,id,db.reports[0]),true);
  for(const id of [undefined,'stranger'])assert.equal(canReadReport(db,id,db.reports[0]),false);
  db.reports[1].hidden=true;assert.equal(canReadReport(db,'owner',db.reports[1]),true);
  db.users.find(u=>u.id==='claimant').suspended=true;assert.equal(canReadReport(db,'claimant',db.reports[0]),false);
});
test('moderation: hidden reports leave matching and pause approval/confirmation without closing private chat',()=>{
  const db=fixture();assert.equal(findMatches(db.reports).length,1);assert.equal(findMatches(hide(db).reports).length,0);
  assert.throws(()=>applyClaimAction(hide(db),'owner','claim',{type:'approved'},timestamp),/hidden/);
  const approved=applyClaimAction(db,'owner','claim',{type:'approved'},timestamp);assert.throws(()=>applyClaimAction(hide(approved),'owner','claim',{type:'confirm'},timestamp),/hidden/);
  assert.equal(canMessageClaim(hide(approved).claims[0]),true);
});
test('moderation: analytics deduplicate recoveries, include hidden reports and use inclusive UTC creation dates',()=>{
  const db=fixture();db.reports.forEach(r=>{r.status='returned';r.createdAt='2026-01-31T23:59:59Z';});db.reports[0].hidden=true;db.claims[0].status='completed';
  let result=buildAdminAnalytics(db,'2026-01-01','2026-01-31');assert.equal(result.recoveredItems,1);assert.equal(result.totalReports,2);assert.equal(result.hiddenReports,1);assert.equal(result.monthly.at(-1).month,'2026-01');
  result=buildAdminAnalytics(db,'2026-02-01','2026-02-28');assert.equal(result.totalReports,0);assert.equal(result.totalUsers,4);
  for(const range of [['2026-02-30',''],['2026-11-14','2026-11-13']])assert.throws(()=>validateAdminDates(...range));
});
test('moderation: CSV escapes formulas, quotes and newlines and excludes private contact/evidence',()=>{
  const db=fixture();const report={...db.reports[0],title:' =HYPERLINK("https://example.com")',location:'Room "A"\nLibrary',contactPhone:'01712345678'};
  const csv=reportsCsv([report]);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"\' =HYPERLINK(""https://example.com"")"'));assert.ok(csv.includes('"Room ""A""\nLibrary"'));assert.equal(csv.includes('01712345678'),false);
  for(const prefix of ['=','+','-','@','\t','\r','\n'])assert.ok(reportsCsv([{...report,title:prefix+'unsafe'}]).includes('"\''+prefix+'unsafe"'));
});
