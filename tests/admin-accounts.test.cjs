const { test } = require('node:test');
const assert = require('node:assert/strict');
const { adminDraft, adminSecret, boundedJson, provisionAdmin, requireActiveAdmin, requireSameOrigin, adminRpc, adminAuthFailure } = require('../.test-build/admin-accounts.js');
const { remembersSession, sessionCookieOptions } = require('../.test-build/session-preference.js');
const id = '00000000-0000-0000-0000-000000000099';
const draft = { name: 'New Admin', email: 'admin@example.com', password: 'unique-admin-password' };
const rpc = (handler) => ({ rpc: async (name, args) => ({ data: await handler(name, args), error: null }) });

test('accounts: normalize Admin details, permit general email and reject weak or malformed input', () => {
  assert.deepEqual(adminDraft({ ...draft, email: ' Admin@Example.com ', name: ' New Admin ' }), draft);
  for (const input of [{ ...draft, email: 'bad' }, { ...draft, password: 'short' }, { ...draft, name: 'A' }, { ...draft, password: 'a'.repeat(129) }]) assert.throws(() => adminDraft(input));
});
test('accounts: reject public keys and accept only server secret/service-role formats', () => {
  assert.equal(adminSecret({ SUPABASE_SECRET_KEY: 'sb_secret_local-test-key' }), 'sb_secret_local-test-key');
  const token = role => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
  assert.equal(adminSecret({ SUPABASE_SERVICE_ROLE_KEY: token('service_role') }), token('service_role'));
  for (const key of ['', 'sb_publishable_example', token('anon')]) assert.throws(() => adminSecret({ SUPABASE_SECRET_KEY: key }), /server-only/);
});
test('accounts: privileged requests require the canonical Origin', () => {
  for (const origin of [undefined, 'https://attacker.example', 'null']) assert.throws(() => requireSameOrigin(new Request('https://internal.example/api', { headers: origin ? { Origin: origin } : {} }), 'https://findback.example'), /FindBack website/);
  requireSameOrigin(new Request('https://internal.example/api', { headers: { Origin: 'https://findback.example' } }), 'https://findback.example');
});
test('accounts: JSON body limits apply even when Content-Length is omitted', async () => {
  const request = body => new Request('https://findback.example/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  assert.deepEqual(await boundedJson(request(JSON.stringify(draft))), draft);
  await assert.rejects(boundedJson(request('x'.repeat(4100))), error => error.status === 413);
  await assert.rejects(boundedJson(request('{broken')), error => error.status === 400);
  await assert.rejects(boundedJson(new Request('https://findback.example/api', { method: 'POST', body: 'plain' })), error => error.status === 415);
});
test('accounts: both authoritative role and active membership are required', async () => {
  for (const inactive of ['is_admin', 'is_active_member']) await assert.rejects(requireActiveAdmin(rpc(name => name !== inactive)), error => error.status === 403);
  await requireActiveAdmin(rpc(() => true));
});
test('accounts: Auth rejection codes produce actionable safe errors, without imposing a campus domain on Admins', () => {
  assert.equal(adminAuthFailure('weak_password').status,400);
  assert.match(adminAuthFailure('email_address_invalid').message,/any valid email domain/);
  assert.equal(adminAuthFailure('email_exists').status,409);
  assert.equal(adminAuthFailure('user_already_exists').status,409);
  assert.match(adminAuthFailure('bad_jwt',401).message,/server-only secret/);
  assert.equal(adminAuthFailure('unexpected_failure',500).status,503);
});
test('accounts: reservation binds creation to its server-generated ID and verifies membership', async () => {
  const calls = [];
  const client = rpc((name, args) => { calls.push([name, args]); return name === 'reserve_admin_account' ? { user_id: id } : null; });
  const result = await provisionAdmin(client, rpc((name, args) => { assert.equal(name, 'admin_account_provisioned'); assert.equal(args.p_user_id, id); return true; }), draft, async (reserved, input) => {
    assert.equal(reserved, id); assert.equal(input, draft); return { id, error: false };
  });
  assert.deepEqual(result, { id }); assert.deepEqual(calls.map(c => c[0]), ['reserve_admin_account', 'cancel_admin_reservation']);
});
test('accounts: cap/duplicate rejection never calls the privileged Auth API', async () => {
  for (const message of ['At most five Admins are allowed', 'This email already has an account']) {
    let called = false;
    await assert.rejects(provisionAdmin({ rpc: async () => ({ data: null, error: { message } }) }, rpc(() => true), draft, async () => { called = true; return { id, error: false }; }), error => error.status === 409);
    assert.equal(called, false);
  }
});
test('accounts: Auth failure and ambiguous network failure release only their reservation', async () => {
  for (const create of [async () => ({ error: true }), async () => { throw new Error('private network details'); }]) {
    const calls = [];
    const client = rpc(name => { calls.push(name); return name === 'reserve_admin_account' ? { user_id: id } : null; });
    await assert.rejects(provisionAdmin(client, rpc(() => true), draft, create));
    assert.deepEqual(calls, ['reserve_admin_account', 'cancel_admin_reservation']);
  }
});
test('accounts: membership changes are reported without deleting an account or echoing passwords', async () => {
  const client = rpc(name => name === 'reserve_admin_account' ? { user_id: id } : null);
  await assert.rejects(provisionAdmin(client, rpc(() => false), draft, async () => ({ id, error: false })), error => error.status === 409 && !error.message.includes(draft.password));
  await assert.rejects(adminRpc({ rpc: async () => ({ data: null, error: { message: `Database details ${draft.password}`, code: 'internal' } }) }, 'list'), error => error.status === 503 && !error.message.includes(draft.password));
});
test('accounts: Remember me uses session cookies when unchecked and preserves logout deletion', () => {
  const options = { maxAge: 12345, expires: new Date('2030-01-01'), path: '/', sameSite: 'lax', secure: true };
  assert.equal(remembersSession(undefined), true); assert.equal(remembersSession('1'), true); assert.equal(remembersSession('0'), false);
  assert.equal(sessionCookieOptions(options, true), options);
  assert.deepEqual(sessionCookieOptions(options, false), { path: '/', sameSite: 'lax', secure: true });
  assert.equal(options.maxAge, 12345);
  for (const maxAge of [0, -1]) { const cleared = { ...options, maxAge }; assert.equal(sessionCookieOptions(cleared, false), cleared); }
});
