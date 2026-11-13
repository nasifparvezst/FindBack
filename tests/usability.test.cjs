const test=require('node:test');const assert=require('node:assert/strict');
const {DEMO_GUEST,restoreDemoUser}=require('../.test-build/demo-session.js');
const {dataPageScope}=require('../.test-build/data-pages.js');
const {reportIssues,validateReport}=require('../.test-build/validation.js');
const users=[{id:'default'},{id:'selected'},{id:'suspended',suspended:true}];
const valid={type:'found',title:'Blue phone',category:'Phone',brand:'',color:'',location:'Campus Library',occurredOn:'2026-01-01',description:'A clear case with a small sticker',contactPhone:'01712345678'};

test('usability: a fresh Demo session keeps its existing default account',()=>{assert.equal(restoreDemoUser(null,'default',users),'default');});
test('usability: an explicitly persisted guest remains a guest after repeated reloads',()=>{
  const first=restoreDemoUser(DEMO_GUEST,'default',users);assert.equal(first,null);assert.equal(restoreDemoUser(first??DEMO_GUEST,'default',users),null);
});
test('usability: selected users persist while suspended or removed users never become another account',()=>{
  assert.equal(restoreDemoUser('selected','default',users),'selected');
  for(const saved of ['missing','suspended',''])assert.equal(restoreDemoUser(saved,'default',users),null);
  assert.equal(restoreDemoUser(null,'suspended',users),null);
});
test('usability: pagination keeps its counter scope across page changes but separates identities and filters',()=>{
  const query={kind:'browse',page:1,pageSize:12,search:'phone'};
  const scope=dataPageScope(query,'one');assert.equal(dataPageScope({...query,page:2},'one'),scope);
  assert.notEqual(dataPageScope(query,'two'),scope);assert.notEqual(dataPageScope(query),scope);
  for(const change of [{search:'wallet'},{kind:'my_reports'},{pageSize:20},{from:'2026-01-01'},{sort:'oldest'}])assert.notEqual(dataPageScope({...query,...change},'one'),scope);
});
test('usability: structured field errors preserve the validation messages consumed by both providers',()=>{
  const draft={...valid,title:' ',location:'x',description:'short',occurredOn:'',contactPhone:'invalid'};
  const issues=reportIssues(draft);assert.deepEqual(issues.map(issue=>issue.field),['title','location','description','occurredOn','contactPhone']);assert.deepEqual(validateReport(draft),issues.map(issue=>issue.message));
});
test('usability: valid reports have no field errors and future dates target the date field',()=>{
  assert.deepEqual(reportIssues(valid),[]);const issues=reportIssues({...valid,occurredOn:'3026-01-01'});assert.equal(issues.length,1);assert.equal(issues[0].field,'occurredOn');
});
test('usability: both identity-photo and size errors remain attached to the photo control',()=>{
  const issues=reportIssues({...valid,category:'ID Card',image:'x'.repeat(1500001)});assert.equal(issues.length,2);assert.ok(issues.every(issue=>issue.field==='image'));assert.ok(issues[0].message.includes('ID Card'));assert.ok(issues[1].message.includes('smaller photo'));
});
