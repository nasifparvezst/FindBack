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
  `);
  await db.exec(migration('202611050001_initial.sql'));
  await db.exec(migration('202611060001_report_management_privacy.sql'));
  await db.exec(migration('202611120001_two_party_handover.sql'));
  await db.exec(migration('202611130001_private_chat_realtime.sql'));
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
