const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
let db;
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const [owner, claimant, stranger, admin] = [1, 2, 3, 4].map(uid);
const [found, lost] = [101, 102].map(uid);
const migration = (name) => fs.readFileSync(path.join(__dirname, '../supabase/migrations', name), 'utf8');
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
async function as(user, sql, params = []) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user || '']);
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}`);
  try { return await query(sql, params); } finally { await db.exec('reset role'); }
}
const submit = (user = claimant, related = lost) => as(user, 'select public.submit_claim($1,$2,$3) as id', [found, 'Distinctive case with a small blue sticker', related]).then((rows) => rows[0].id);
const review = (id, decision = 'approved', user = owner) => as(user, 'select public.review_claim($1,$2)', [id, decision]);
const confirm = (id, user) => as(user, 'select public.confirm_handover($1)', [id]);
const manage = (id, user, action, reason = 'Reviewed the physical handover details') => as(user, 'select public.manage_claim($1,$2,$3)', [id, action, reason]);

before(async () => {
  db = new PGlite();
  // Disposable stand-ins for Supabase-managed Auth/Storage; application migrations are unmodified.
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
    create function storage.extension(text) returns text language sql immutable as $$ select regexp_replace($1,'^.*[.]','') $$;
    grant usage on schema storage to anon,authenticated;
    grant select,insert,delete on storage.objects to authenticated;
  `);
  await db.exec(migration('202611050001_initial.sql'));
  await db.exec(migration('202611060001_report_management_privacy.sql'));
  await db.exec(migration('202611120001_two_party_handover.sql'));
  await db.exec(migration('202611130001_private_chat_realtime.sql'));
  await db.exec(migration('202611130002_admin_moderation.sql'));
  await db.exec(migration('202611130003_paged_data.sql'));
});
beforeEach(async () => {
  await db.exec('reset role; truncate auth.users cascade');
  for (const [index, id] of [owner, claimant, stranger, admin].entries()) {
    await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [id, `student${index}@seu.edu.bd`]);
  }
  await db.query('insert into public.admin_members(user_id) values($1)', [admin]);
  for (const [id, user, type] of [[found, owner, 'found'], [lost, claimant, 'lost']]) {
    await db.query("insert into public.reports(id,owner_id,type,title,category,location,occurred_on,description) values($1,$2,$3,'Phone','Phone','Campus Library',current_date,'Blue sticker on the clear phone case')", [id, user, type]);
  }
});
after(async () => { if (db) await db.close(); });

test('SQL: one confirmation stays open; both complete once, in either order', async () => {
  for (const order of [[owner, claimant], [claimant, owner]]) {
    if (order[0] === claimant) {
      await db.exec('truncate public.claims cascade');
      await db.query("update public.reports set status='open',linked_report_id=null");
    }
    const id = await submit(); await review(id);
    await confirm(id, order[0]); await confirm(id, order[0]);
    let [claim] = await query('select * from public.claims where id=$1', [id]);
    assert.equal(claim.status, 'approved');
    assert.equal(Boolean(claim.owner_confirmed_at), order[0] === owner);
    assert.equal(Boolean(claim.claimant_confirmed_at), order[0] === claimant);
    assert.ok((await query('select status from public.reports')).every((row) => row.status === 'open'));
    await confirm(id, order[1]);
    [claim] = await query('select * from public.claims where id=$1', [id]);
    assert.equal(claim.status, 'completed'); assert.ok(claim.completed_at);
    const notices = (await query('select count(*)::int as n from public.notifications'))[0].n;
    await confirm(id, order[1]);
    assert.equal((await query('select count(*)::int as n from public.notifications'))[0].n, notices);
    assert.ok((await query('select status from public.reports')).every((row) => row.status === 'returned'));
    assert.deepEqual((await query('select linked_report_id from public.reports order by id')).map((row) => row.linked_report_id), [lost, found]);
  }
});
test('SQL: stranger, Admin and anon cannot confirm for the parties; direct status writes denied', async () => {
  const id = await submit(); await review(id);
  await assert.rejects(confirm(id, stranger), /Not authorized/);
  await assert.rejects(confirm(id, admin), /two participants/);
  await assert.rejects(confirm(id, null), /permission denied/);
  await assert.rejects(as(owner, "update public.claims set status='completed' where id=$1", [id]), /permission denied/);
  await assert.rejects(as(owner, 'select public.complete_handover($1)', [found]), /permission denied/);
  await assert.rejects(as(owner, "select public.transition_claim($1,'confirm',null)", [id]), /permission denied/);
});
test('SQL: unrelated users cannot read claim/messages and only participants or Admin can message', async () => {
  const id = await submit();
  await as(owner, 'insert into public.messages(claim_id,sender_id,body) values($1,$2,$3)', [id, owner, 'Please check the blue sticker']);
  assert.equal((await as(stranger, 'select id from public.claims')).length, 0);
  assert.equal((await as(stranger, 'select id from public.messages')).length, 0);
  await assert.rejects(as(stranger, 'insert into public.messages(claim_id,sender_id,body) values($1,$2,$3)', [id, stranger, 'Unauthorized']), /row-level security/);
  assert.equal((await as(claimant, 'select id from public.messages')).length, 1);
});
test('SQL: suspend/unverify blocks confirmation even with an existing identity', async () => {
  const id = await submit(); await review(id);
  await db.query('update public.profiles set suspended_at=now() where id=$1', [owner]);
  await assert.rejects(confirm(id, owner), /Verified active/);
  await db.query('update auth.users set email_confirmed_at=null where id=$1', [claimant]);
  await assert.rejects(confirm(id, claimant), /Verified active/);
});
test('SQL: duplicate active claim, self claim and incompatible linked report rejected', async () => {
  await submit();
  await assert.rejects(submit(), /already have an active/);
  await assert.rejects(submit(owner, null), /own report/);
  await db.query("update public.reports set category='Wallet' where id=$1", [lost]).then(() => assert.fail('Active claim category edit must fail'), (error) => assert.match(error.message, /active claims/));
  await assert.rejects(submit(stranger, lost), /Invalid related/);
});
test('SQL: shared target/related reservation blocks mirrored approval and report deletion', async () => {
  const id = await submit();
  const other = (await as(owner, 'select public.submit_claim($1,$2,$3) as id', [lost, 'The same identifying blue sticker', found]))[0].id;
  await review(id);
  await assert.rejects(review(other, 'approved', claimant), /reserved/);
  await assert.rejects(as(owner, 'select public.delete_report($1)', [found]), /Resolve approved/);
  await assert.rejects(as(claimant, 'select public.delete_report($1)', [lost]), /Resolve approved/);
});
test('SQL: cancellation, disputes, mandatory reasons and audited Admin resolution', async () => {
  const id = await submit(); await review(id); await confirm(id, owner);
  await assert.rejects(manage(id, claimant, 'cancel'), /dispute/);
  await manage(id, claimant, 'dispute', 'The physical item has not been handed over');
  await assert.rejects(confirm(id, claimant), /undisputed/);
  await assert.rejects(manage(id, owner, 'resume'), /Admin/);
  await assert.rejects(manage(id, admin, 'resume', 'short'), /Reason/);
  await manage(id, admin, 'resume');
  const [claim] = await query('select * from public.claims where id=$1', [id]);
  assert.equal(claim.status, 'approved'); assert.equal(claim.owner_confirmed_at, null); assert.equal(claim.claimant_confirmed_at, null);
  const [audit] = await as(admin, 'select * from public.moderation_actions');
  assert.equal(audit.admin_id, admin); assert.ok(audit.reason.length >= 10); assert.match(audit.subject, new RegExp(id));
  await confirm(id, claimant);
  assert.equal((await query('select status from public.claims where id=$1', [id]))[0].status, 'approved');
  await manage(id, owner, 'dispute'); await manage(id, admin, 'resolve_cancel');
  assert.equal((await query('select status from public.claims where id=$1', [id]))[0].status, 'cancelled');
  assert.ok((await query('select status from public.reports')).every((row) => row.status === 'open'));
});
test('SQL: completion cancels competing pending claims and terminal chat is closed', async () => {
  const id = await submit(); const other = await submit(stranger, null);
  await review(id); await confirm(id, owner); await confirm(id, claimant);
  assert.equal((await query('select status from public.claims where id=$1', [other]))[0].status, 'cancelled');
  await assert.rejects(as(claimant, 'insert into public.messages(claim_id,sender_id,body) values($1,$2,$3)', [id, claimant, 'Claim is closed']), /row-level security/);
  const recipients = await query("select distinct user_id from public.notifications where title='Handover completed' order by user_id");
  assert.deepEqual(recipients.map((row) => row.user_id), [owner, claimant]);
});
test('SQL: pending claimant can cancel and make a new claim', async () => {
  const id = await submit(); await manage(id, claimant, 'cancel');
  const replacement = await submit(); assert.notEqual(id, replacement);
  await assert.rejects(confirm(replacement, owner), /Approved/);
});

test('chat SQL: cursor pages preserve tied timestamps, newest-first history and forward catch-up', async () => {
  const id = await submit();
  await db.query(`insert into public.messages(id,claim_id,sender_id,body,created_at)
    select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,$1,$2,'message '||n,'2026-11-13T10:00:00.123456Z' from generate_series(1001,1120) n`, [id, owner]);
  const latest = await as(claimant, 'select * from public.get_claim_messages($1)', [id]);
  assert.equal(latest.length, 51); assert.equal(latest[0].id, uid(1120)); assert.equal(latest[49].id, uid(1071));
  const before = await as(owner, 'select * from public.get_claim_messages($1,$2,$3)', [id, '2026-11-13T10:00:00.123456Z', uid(1071)]);
  assert.equal(before[0].id, uid(1070)); assert.equal(before[49].id, uid(1021));
  const after = await as(owner, 'select * from public.get_claim_messages($1,null,null,$2,$3)', [id, '2026-11-13T10:00:00.123456Z', uid(1001)]);
  assert.equal(after[0].id, uid(1002)); assert.equal(after.length, 51);
  await assert.rejects(as(owner, 'select * from public.get_claim_messages($1,now(),null)', [id]), /Invalid message cursor/);
  await assert.rejects(as(owner, 'select * from public.get_claim_messages($1,now(),$2,now(),$2)', [id, uid(1001)]), /Invalid message cursor/);
});

test('chat SQL: history RPC respects participant RLS, active membership, Admin and anon privileges', async () => {
  const id = await submit();
  await as(owner, 'insert into public.messages(claim_id,sender_id,body) values($1,$2,$3)', [id, owner, 'Private details']);
  assert.equal((await as(admin, 'select * from public.get_claim_messages($1)', [id])).length, 1);
  await assert.rejects(as(stranger, 'select * from public.get_claim_messages($1)', [id]), /Conversation unavailable/);
  await assert.rejects(as(null, 'select * from public.get_claim_messages($1)', [id]), /permission denied/);
  await db.query('update public.profiles set suspended_at=now() where id=$1', [claimant]);
  await assert.rejects(as(claimant, 'select * from public.get_claim_messages($1)', [id]), /Conversation unavailable/);
});

test('chat SQL: read cursor clears only visible message alerts of the caller and preserves later/claim alerts', async () => {
  const id = await submit();
  const timestamp = '2026-11-13T10:00:00.123456Z';
  for (const number of [1001,1002]) await db.query('insert into public.messages(id,claim_id,sender_id,body,created_at) values($1,$2,$3,$4,$5)', [uid(number), id, owner, `message ${number}`, timestamp]);
  await as(claimant, 'select public.mark_claim_messages_read($1,$2,$3)', [id, timestamp, uid(1001)]);
  const notices = await as(claimant, 'select title,message_id,read_at from public.notifications order by message_id');
  assert.ok(notices.find((n) => n.message_id === uid(1001)).read_at);
  assert.equal(notices.find((n) => n.message_id === uid(1002)).read_at, null);
  assert.equal(notices.find((n) => n.title === 'New claim request').read_at, null);
  await assert.rejects(as(stranger, 'select public.mark_claim_messages_read($1,$2,$3)', [id, timestamp, uid(1002)]), /Conversation unavailable/);
  await assert.rejects(as(claimant, 'select public.mark_claim_messages_read($1,$2,$3)', [id, timestamp, uid(9999)]), /Invalid message cursor/);
  await assert.rejects(as(null, 'select public.mark_claim_messages_read($1,$2,$3)', [id, timestamp, uid(1002)]), /permission denied/);
  const [summary] = await as(claimant, 'select public.get_notification_summary() as value');
  assert.equal(summary.value.unreadClaims[id], 1);
  assert.equal(summary.value.unreadNotifications, 2);
  assert.equal((await as(owner, 'select count(*)::int n from public.notifications where read_at is not null'))[0].n, 0);
});

test('chat SQL: exact unread totals exceed the snapshot limit and remain recipient-private', async () => {
  const id = await submit();
  await db.query("insert into public.notifications(user_id,title,body,href) select $1,'New message','test','/claims/'||$2::text from generate_series(1,505)", [claimant,id]);
  const [summary] = await as(claimant, 'select public.get_notification_summary() as value');
  assert.equal(summary.value.unreadNotifications, 506); assert.equal(summary.value.unreadClaims[id], 505);
  assert.equal((await as(stranger, 'select public.get_notification_summary() as value'))[0].value.unreadNotifications, 0);
  await assert.rejects(as(null, 'select public.get_notification_summary()'), /permission denied/);
});

test('chat SQL: Admin messages notify both participants and required tables are published without weakening RLS', async () => {
  const id = await submit();
  await as(admin, 'insert into public.messages(claim_id,sender_id,body) values($1,$2,$3)', [id, admin, 'Please arrange a campus meeting']);
  const notices = await query("select user_id,message_id from public.notifications where title='New message' order by user_id");
  assert.deepEqual(notices.map((n) => n.user_id), [owner,claimant]); assert.ok(notices.every((n) => n.message_id));
  assert.deepEqual((await query("select tablename from pg_publication_tables where pubname='supabase_realtime' order by tablename")).map((r) => r.tablename), ['claims','messages','notifications']);
  assert.equal((await as(stranger, 'select * from public.messages')).length, 0);
  assert.equal((await as(stranger, 'select * from public.notifications')).length, 0);
});

test('chat SQL: retry delivery is idempotent and enforces sender, body, closed-claim and RLS checks', async () => {
  const id = await submit(); const messageId = uid(1001);
  const send = (user, delivery = messageId, body = 'Arrange a safe campus handover') => as(user, 'select public.send_claim_message($1,$2,$3)', [id,delivery,body]);
  await send(owner); await send(owner);
  assert.equal((await query('select count(*)::int n from public.messages'))[0].n,1);
  assert.equal((await query("select count(*)::int n from public.notifications where title='New message'"))[0].n,1);
  await assert.rejects(send(owner,messageId,'Changed body'), /delivery ID/);
  await assert.rejects(send(stranger,uid(1002)), /row-level security/);
  await assert.rejects(send(owner,uid(1002),'   '), /1 to 2000/);
  await assert.rejects(send(owner,uid(1002),'x'.repeat(2001)), /1 to 2000/);
  await assert.rejects(send(null), /permission denied/);
  await manage(id,claimant,'cancel');
  await send(owner); // The previously persisted response may still be safely retried.
  await assert.rejects(send(owner,uid(1002)), /row-level security/);
});

const moderate = (hidden=true,reason='Reviewed unsafe or misleading report details',user=admin) => as(user,'select public.moderate_report($1,$2,$3)',[found,hidden,reason]);
const flag = (user=stranger,reason='Misleading details need an administrator review') => as(user,'select public.flag_report($1,$2)',[found,reason]);

test('moderation SQL: hidden reports are private to existing participants, owner and Admin without RLS recursion', async () => {
  const id=await submit();await as(owner,'select public.send_claim_message($1,$2,$3)',[id,uid(1001),'Please verify the sticker']);
  await moderate();
  for(const user of [null,stranger]) assert.equal((await as(user,'select id from public.reports where id=$1',[found])).length,0);
  for(const user of [owner,claimant,admin]) assert.equal((await as(user,'select id from public.reports where id=$1',[found])).length,1);
  assert.equal((await as(null,'select public.can_read_hidden_report($1) as allowed',[found]))[0].allowed,false);
  assert.equal((await as(claimant,'select * from public.get_claim_messages($1)',[id])).length,1);
  assert.equal((await as(stranger,'select * from public.messages')).length,0);
  assert.equal((await query('select count(*)::int n from public.claims'))[0].n,1);
});
test('moderation SQL: flags validate identity/reason, prevent duplicates, and restrict reporter details', async () => {
  await assert.rejects(flag(owner),/own report/);await assert.rejects(flag(stranger,'short'),/Reason/);await assert.rejects(flag(null),/permission denied/);
  await flag();await assert.rejects(flag(),/open flag/);
  assert.equal((await as(owner,'select * from public.report_flags')).length,0);
  assert.equal((await as(stranger,'select * from public.report_flags')).length,1);
  assert.equal((await as(admin,'select * from public.report_flags')).length,1);
  await assert.rejects(as(stranger,"insert into public.report_flags(report_id,reporter_id,reason) values($1,$2,'Bypass moderation RPC')",[found,stranger]),/permission denied/);
  await assert.rejects(moderate(true,undefined,stranger),/Admin/);
  await assert.rejects(moderate(true,'short'),/Reason/);
});
test('moderation SQL: hide resolves flags, preserves data, notifies owner and audits both hide and restore', async () => {
  await submit();await flag();await moderate();
  const [f]=await query('select * from public.report_flags');assert.equal(f.status,'actioned');assert.equal(f.resolved_by,admin);assert.ok(f.resolution_reason);
  assert.equal((await query('select count(*)::int n from public.claims'))[0].n,1);
  assert.equal((await as(owner,"select * from public.notifications where title='Report hidden'")).length,1);
  assert.equal((await as(stranger,"select * from public.notifications where title='Report flag reviewed'")).length,1);
  await moderate();assert.equal((await query('select * from public.moderation_actions')).length,1);
  await moderate(false,'Report corrected and safe to display publicly');
  assert.equal((await as(null,'select id from public.reports where id=$1',[found])).length,1);
  assert.deepEqual((await query('select action from public.moderation_actions order by created_at')).map(r=>r.action),['Report hidden','Report restored']);
  assert.ok((await query('select reason from public.moderation_actions')).every(r=>r.reason.length>=10));
});
test('moderation SQL: dismissal and suspension require reasons, block legacy bypass and self-suspension', async () => {
  await flag();const [{id}]=await query('select id from public.report_flags');
  await assert.rejects(as(stranger,'select public.dismiss_report_flag($1,$2)',[id,'This flag was reviewed in detail']),/Admin/);
  await assert.rejects(as(admin,'select public.dismiss_report_flag($1,$2)',[id,'short']),/Reason/);
  await as(admin,'select public.dismiss_report_flag($1,$2)',[id,'The original report is accurate and safe']);
  assert.equal((await query('select status from public.report_flags'))[0].status,'dismissed');
  await assert.rejects(as(admin,'select public.set_member_suspended($1,true)',[stranger]),/reason/);
  await assert.rejects(as(admin,'select public.set_member_suspended($1,true,$2)',[admin,'Attempt to suspend own account']),/yourself/);
  await as(admin,'select public.set_member_suspended($1,true,$2)',[stranger,'Repeatedly submitted misleading ownership claims']);
  await assert.rejects(flag(),/active/);
  await as(admin,'select public.set_member_suspended($1,false,$2)',[stranger,'Reviewed the appeal and restored access']);
  assert.equal((await query('select suspended_at from public.profiles where id=$1',[stranger]))[0].suspended_at,null);
  assert.equal((await query('select count(*)::int n from public.moderation_actions where reason is not null'))[0].n,3);
});
test('moderation SQL: hidden target/linked reports block new claims and confirmations while private chat remains usable', async () => {
  const id=await submit();await moderate();
  await assert.rejects(submit(stranger,null),/hidden/);
  await assert.rejects(review(id),/hidden/);
  await moderate(false,'Report corrected and verified by administrator');
  await review(id);await moderate();
  await assert.rejects(confirm(id,owner),/hidden/);
  await as(owner,'select public.send_claim_message($1,$2,$3)',[id,uid(1001),'Admin is reviewing this report']);
  await moderate(false,'Report corrected and verified by administrator');
  await confirm(id,owner);
  await as(admin,'select public.moderate_report($1,true,$2)',[lost,'The linked report also needs review']);
  await assert.rejects(confirm(id,claimant),/hidden/);
  await as(admin,'select public.moderate_report($1,false,$2)',[lost,'Linked report verified and restored']);
  await confirm(id,claimant);assert.equal((await query('select status from public.claims where id=$1',[id]))[0].status,'completed');
});
test('moderation SQL: delete and direct-write guards prevent destructive admin moderation and review bypass', async () => {
  await assert.rejects(as(admin,'select public.delete_report($1)',[found]),/hide\/restore/);
  await flag();await assert.rejects(as(owner,'select public.delete_report($1)',[found]),/flagged/);
  await moderate();await assert.rejects(as(owner,'select public.delete_report($1)',[found]),/moderated/);
  await assert.rejects(as(owner,'update public.reports set hidden=false where id=$1',[found]),/permission denied/);
  await assert.rejects(as(owner,'select public.guard_moderated_report_claim()'),/permission denied/);
});
test('moderation SQL: full-database analytics include 500+ rows and enforce Admin and UTC date boundaries', async () => {
  await db.query("update public.reports set created_at='2026-01-31T23:59:59.999999Z'");
  await db.query("insert into public.reports(owner_id,type,title,category,location,occurred_on,description,created_at) select $1,'found','Phone','Phone','Campus Library',current_date,'An ordinary transparent phone case','2026-02-01T00:00:00Z' from generate_series(1,505)",[owner]);
  let [r]=await as(admin,'select public.get_admin_analytics(null,$1) as value',['2026-02-28']);
  assert.equal(r.value.totalReports,507);assert.equal(r.value.categories.find(c=>c.category==='Phone').count,507);
  assert.deepEqual(r.value.monthly.slice(-2),[{month:'2026-01',count:2},{month:'2026-02',count:505}]);
  [r]=await as(admin,'select public.get_admin_analytics($1,$2) as value',['2026-02-01','2026-02-28']);assert.equal(r.value.totalReports,505);
  await assert.rejects(as(stranger,'select public.get_admin_analytics()'),/Admin/);await assert.rejects(as(null,'select public.get_admin_analytics()'),/permission denied/);
  await assert.rejects(as(admin,'select public.get_admin_analytics($1,$2)',['2026-02-28','2026-01-01']),/From date/);
});

test('moderation SQL: Admin edits require an audited reason through both RPC signatures; owners retain normal editing',async()=>{
  const legacy="select public.edit_report($1,'found','Verified phone','Phone','','','Campus Library',current_date,'Verified blue sticker on phone case','01712345678',null)";
  const audited="select public.edit_report($1,'found','Verified phone','Phone','','','Campus Library',current_date,'Verified blue sticker on phone case','01712345678',null,$2)";
  await assert.rejects(as(admin,legacy,[found]),/Admin edit reason/);
  await assert.rejects(as(stranger,audited,[found,'Corrected an unsafe public description']),/Not authorized/);
  await as(admin,audited,[found,'Corrected an unsafe public description']);
  assert.equal((await query('select reason from public.moderation_actions'))[0].reason,'Corrected an unsafe public description');
  await as(owner,legacy,[found]);
  await assert.rejects(as(admin,legacy.replace('edit_report(','edit_report_before_moderation('),[found]),/permission denied/);
});
test('moderation SQL: recovery analytics deduplicate linked reports and retain hidden historical records',async()=>{
  const id=await submit();await review(id);await confirm(id,owner);await confirm(id,claimant);await moderate();
  await db.query("update public.reports set created_at=case when id=$1 then '2026-01-01T00:00:00Z'::timestamptz else '2026-02-01T00:00:00Z'::timestamptz end",[found]);
  let [r]=await as(admin,'select public.get_admin_analytics(null,$1) as value',['2026-02-28']);
  assert.equal(r.value.recoveredItems,1);assert.equal(r.value.returnedReports,2);assert.equal(r.value.hiddenReports,1);
  [r]=await as(admin,'select public.get_admin_analytics($1,$2) as value',['2026-02-01','2026-02-28']);assert.equal(r.value.recoveredItems,1);assert.equal(r.value.totalReports,1);
});

const dataPage=(user,query)=>as(user,'select public.get_data_page($1) as value',[JSON.stringify(query)]).then(rows=>rows[0].value);
test('paging SQL: browse reaches 500+ records with stable tied timestamps, exact totals and clamped pages',async()=>{
  await db.query("insert into public.reports(id,owner_id,type,title,category,location,occurred_on,description,created_at) select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,$1,'found','Boundary phone','Phone','Campus Library',current_date,'Transparent blue case on phone','2026-11-01T00:00:00.123456Z' from generate_series(1001,1550) n",[owner]);
  const one=await dataPage(null,{kind:'browse',search:'Boundary phone',pageSize:100});const last=await dataPage(null,{kind:'browse',search:'Boundary phone',pageSize:100,page:999});
  assert.equal(one.total,550);assert.equal(one.ids.length,100);assert.equal(last.page,6);assert.equal(last.ids.length,50);assert.equal(last.ids.at(-1),uid(1001));
  assert.equal(one.bundle.reports.length,100);assert.equal(one.bundle.profiles.length,1);assert.equal(one.bundle.contacts,undefined);
  assert.equal(new Set([...one.ids,...last.ids]).size,150);
  const bootstrap=await dataPage(null,{kind:'bootstrap'});assert.equal(bootstrap.ids.length,4);assert.equal(bootstrap.stats.totalReports,552);
});
test('paging SQL: filters and sorts run before pagination and treat search text literally',async()=>{
  await db.query("update public.reports set title='Blue 100% phone',location='Room _ A' where id=$1",[found]);
  let result=await dataPage(null,{kind:'browse',search:'100% _',type:'found',category:'Phone',status:'open',sort:'alphabetical',pageSize:1});assert.deepEqual(result.ids,[found]);assert.equal(result.total,1);
  result=await dataPage(null,{kind:'browse',search:'%wildcard%'});assert.equal(result.total,0);
  await assert.rejects(dataPage(null,{kind:'browse',pageSize:101}),/Invalid page/);await assert.rejects(dataPage(null,{kind:'browse',page:0}),/Invalid page/);
  await assert.rejects(dataPage(null,{kind:'browse',sort:'title; drop table reports'}),/Invalid sort/);
  await assert.rejects(dataPage(null,{kind:'browse',from:'2026-12-01',to:'2026-01-01'}),/From date/);
});
test('paging SQL: private scopes and direct bundles preserve claim, flag, email and hidden-report RLS',async()=>{
  const id=await submit();await flag();await moderate();
  await assert.rejects(dataPage(stranger,{kind:'admin_reports'}),/Admin/);await assert.rejects(dataPage(null,{kind:'notifications'}),/active/);
  const other=await dataPage(stranger,{kind:'claim',id});assert.equal(other.ids.length,0);assert.equal(other.bundle.claims.length,0);
  const mine=await dataPage(claimant,{kind:'claim',id});assert.equal(mine.bundle.claims.length,1);assert.equal(mine.bundle.reports.length,2);
  assert.ok(mine.bundle.emails.every(e=>e.user_id===claimant));assert.equal(mine.bundle.contacts.length,0);
  const hidden=await dataPage(stranger,{kind:'report',id:found});assert.equal(hidden.ids.length,0);
  const visible=await dataPage(owner,{kind:'report',id:found});assert.deepEqual(visible.ids,[found]);assert.equal(visible.stats.claimCount,1);
  const [bundle]=await as(stranger,'select public.get_page_bundle($1,$2,$3,$4,$5,$6) as value',[[found],[id],[owner],[],[],[]]);assert.equal(bundle.value.reports.length,0);assert.equal(bundle.value.claims.length,0);assert.ok(bundle.value.emails.every(e=>e.user_id===stranger));
});
test('paging SQL: my reports, claims and notifications can read old rows beyond unrelated newer data',async()=>{
  const id=await submit();await flag();
  assert.deepEqual((await dataPage(owner,{kind:'incoming'})).ids,[id]);assert.equal((await dataPage(stranger,{kind:'incoming'})).total,0);
  assert.deepEqual((await dataPage(claimant,{kind:'outgoing'})).ids,[id]);assert.deepEqual((await dataPage(claimant,{kind:'my_reports'})).ids,[lost]);
  const page=await dataPage(claimant,{kind:'notifications',pageSize:1,page:999});assert.equal(page.ids.length,1);assert.ok(page.bundle.notifications.every(n=>n.user_id===claimant));
  const bootstrap=await dataPage(owner,{kind:'bootstrap'});assert.equal(bootstrap.stats.myReports,1);assert.equal(bootstrap.stats.pendingIncoming,1);
  const adminPage=await dataPage(admin,{kind:'admin_users',search:'student2@'});assert.deepEqual(adminPage.ids,[stranger]);
});
test('paging SQL: compatible related, matching and duplicate candidates are filtered before their pages',async()=>{
  assert.deepEqual((await dataPage(claimant,{kind:'related',id:found})).ids,[lost]);
  assert.deepEqual((await dataPage(null,{kind:'match_candidates',id:lost})).ids,[found]);
  assert.deepEqual((await dataPage(claimant,{kind:'match_sources'})).ids,[lost]);
  const today=(await query('select current_date::text value'))[0].value;
  assert.deepEqual((await dataPage(owner,{kind:'duplicates',type:'found',category:'Phone',occurredOn:today})).ids,[found]);
  await moderate();assert.equal((await dataPage(null,{kind:'match_candidates',id:lost})).total,0);
});
test('paging SQL: CSV cursor excludes later inserts and advances through tied report timestamps',async()=>{
  await db.query("update public.reports set created_at='2026-01-01T00:00:00.123456Z'");
  const first=await dataPage(admin,{kind:'admin_reports',forExport:true,pageSize:1});assert.equal(first.ids[0],lost);
  await db.query("insert into public.reports(owner_id,type,title,category,location,occurred_on,description) values($1,'found','New phone','Phone','Campus Library',current_date,'A newly posted transparent case')",[owner]);
  const second=await dataPage(admin,{kind:'admin_reports',forExport:true,pageSize:1,snapshot:first.snapshot,cursorAt:'2026-01-01T00:00:00.123456Z',cursorId:lost});assert.deepEqual(second.ids,[found]);
  await assert.rejects(dataPage(null,{kind:'browse',forExport:true}),/export scope/);
});

test('paging SQL: item context retains the reserved claim despite many newer related pending claims and scopes contacts',async()=>{
  const id=await submit();
  for(let n=201;n<=206;n++){
    await db.query("insert into public.reports(id,owner_id,type,title,category,location,occurred_on,description) values($1,$2,'lost','Other phone','Phone','Campus Library',current_date,'Another clear phone case with blue sticker')",[uid(n),stranger]);
    await as(owner,'select public.submit_claim($1,$2,$3)',[uid(n),'The distinctive blue phone sticker',found]);
  }
  await review(id);
  await db.query('insert into public.report_contacts(report_id,phone) values($1,$2),($3,$4)',[found,'01712345678',lost,'01812345678']);
  const context=await dataPage(owner,{kind:'report',id:found});assert.deepEqual(context.bundle.claims.map(c=>c.id),[id]);assert.equal(context.stats.claimCount,1);
  assert.deepEqual(context.bundle.contacts.map(c=>c.report_id),[found]);
  const other=await dataPage(claimant,{kind:'claim',id});assert.deepEqual(other.bundle.contacts.map(c=>c.report_id),[lost]);
});

test('security SQL: campus domain is enforced on signup and email change, including metadata role forgery',async()=>{
  await assert.rejects(db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'outsider@example.com',now())",[uid(999)]),/seu.edu.bd/);
  await assert.rejects(db.query("update auth.users set email='outsider@example.com' where id=$1",[owner]),/seu.edu.bd/);
  await db.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,'UPPER@SEU.EDU.BD',now(),'{\"role\":\"admin\",\"is_admin\":true}')",[uid(999)]);
  assert.equal((await as(uid(999),'select public.is_admin() as allowed'))[0].allowed,false);
  await assert.rejects(as(uid(999),'select public.get_admin_analytics()'),/Admin/);
  await assert.rejects(as(uid(999),'insert into public.admin_members(user_id) values($1)',[uid(999)]),/permission denied/);
  assert.equal((await query('select email from public.profile_emails where user_id=$1',[uid(999)]))[0].email,'upper@seu.edu.bd');
});
test('security SQL: Storage upload/delete policies enforce folder ownership and active membership',async()=>{
  await as(owner,"insert into storage.objects(bucket_id,name) values('report-images',$1)",[owner+'/photo.png']);
  await assert.rejects(as(stranger,"insert into storage.objects(bucket_id,name) values('report-images',$1)",[owner+'/other.png']),/row-level security/);
  await assert.rejects(as(owner,"insert into storage.objects(bucket_id,name) values('report-images',$1)",[owner+'/unsafe.svg']),/row-level security/);
  await assert.rejects(as(owner,"insert into storage.objects(bucket_id,name) values('private-bucket',$1)",[owner+'/photo.png']),/row-level security/);
  await as(stranger,'delete from storage.objects where name=$1',[owner+'/photo.png']);assert.equal((await query('select * from storage.objects')).length,1);
  await db.query('update public.profiles set suspended_at=now() where id=$1',[owner]);
  assert.equal((await as(owner,'select * from storage.objects')).length,0);
  await assert.rejects(as(owner,"insert into storage.objects(bucket_id,name) values('report-images',$1)",[owner+'/new.png']),/row-level security/);
  await as(admin,'delete from storage.objects where name=$1',[owner+'/photo.png']);assert.equal((await query('select * from storage.objects')).length,0);
});
test('security SQL: Storage constraints remain public-photo only and reject ID-card image reports',async()=>{
  const [bucket]=await query("select public,file_size_limit,allowed_mime_types from storage.buckets where id='report-images'");
  assert.equal(bucket.public,true);assert.equal(bucket.file_size_limit,2097152);assert.deepEqual(bucket.allowed_mime_types,['image/jpeg','image/png','image/webp']);
  await assert.rejects(as(owner,"select public.create_report('found','Student card','ID Card','','','Campus Library',current_date,'A student card found on campus','01712345678',$1)",[owner+'/card.png']),/reports_id_card_photo_private/);
  await db.query('update auth.users set email_confirmed_at=null where id=$1',[owner]);
  await assert.rejects(as(owner,"insert into storage.objects(bucket_id,name) values('report-images',$1)",[owner+'/unverified.png']),/row-level security/);
});
test('security SQL: bound page queries do not execute injected search text or expose message sender forgery',async()=>{
  const malicious="'; drop table public.reports; --";
  const result=await dataPage(null,{kind:'browse',search:malicious});assert.equal(result.total,0);assert.equal((await query('select count(*)::int n from public.reports'))[0].n,2);
  const id=await submit();
  await assert.rejects(as(owner,'insert into public.messages(claim_id,sender_id,body) values($1,$2,$3)',[id,claimant,'Trying to impersonate the claimant']),/row-level security/);
  await assert.rejects(as(owner,'update public.profiles set suspended_at=null where id=$1',[owner]),/permission denied/);
});
