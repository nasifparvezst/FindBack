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
