const test = require('node:test');
const assert = require('node:assert/strict');
const { checkCloud } = require('../scripts/cloud-check.cjs');
const environment = { NEXT_PUBLIC_DEMO_MODE: 'false', NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example' };
const settings = { external: { email: true }, disable_signup: false, mailer_autoconfirm: false };
const page = () => ({ ids: [], page: 1, pageSize: 4, total: 0, bundle: { reports: [], profiles: [] } });
const response = value => new Response(JSON.stringify(value), { status: 200 });

test('cloud setup: probes use the public key and only settings/read-only bootstrap requests', async () => {
  const calls = [];
  const result = await checkCloud(environment, async (url, options) => { calls.push({ url, options }); return response(calls.length === 1 ? settings : page()); });
  assert.deepEqual(result, { publicReports: 0 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.method, 'GET');
  assert.ok(calls[0].url.endsWith('/auth/v1/settings'));
  assert.ok(calls[1].url.endsWith('/rest/v1/rpc/get_data_page'));
  assert.deepEqual(JSON.parse(calls[1].options.body), { p_query: { kind: 'bootstrap' } });
  for (const call of calls) { assert.equal(call.options.headers.apikey, environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY); assert.equal(call.options.redirect, 'error'); assert.equal(call.options.cache, 'no-store'); assert.ok(call.options.signal instanceof AbortSignal); }
});
test('cloud setup: missing settings and privileged keys fail before any network access', async () => {
  for (const env of [{}, { ...environment, NEXT_PUBLIC_DEMO_MODE: 'true' }, { ...environment, NEXT_PUBLIC_SUPABASE_URL: '' }, { ...environment, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_example' }]) {
    await assert.rejects(checkCloud(env, async () => { assert.fail('Must not contact the API'); }));
  }
});
test('cloud setup: sign-up and email confirmation must both be enabled', async () => {
  for (const config of [{ ...settings, external: { email: false } }, { ...settings, disable_signup: true }, { ...settings, mailer_autoconfirm: true }, {}]) await assert.rejects(checkCloud(environment, async () => response(config)), /email/);
});
test('cloud setup: unexpected counters, private bundles and public ID photos stop readiness checks', async () => {
  const variants = [
    { ...page(), pageSize: 500 },
    { ...page(), bundle: { ...page().bundle, contacts: [{ phone: 'private' }] } },
    { ...page(), bundle: { ...page().bundle, profiles: [{ id: 'user', email: 'private@seu.edu.bd' }] } },
    { ...page(), bundle: { ...page().bundle, reports: [{ category: 'ID Card', image_path: 'private.jpg' }] } },
  ];
  for (const value of variants) await assert.rejects(checkCloud(environment, async url => response(url.endsWith('/settings') ? settings : value)));
});
test('cloud setup: transport/API failures do not reflect credentials or server error payloads', async () => {
  const privateDetail = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  for (const request of [async () => { throw new Error(privateDetail); }, async () => new Response(privateDetail, { status: 401 }), async () => new Response(privateDetail)]) {
    await assert.rejects(checkCloud(environment, request), error => !error.message.includes(privateDetail));
  }
});
