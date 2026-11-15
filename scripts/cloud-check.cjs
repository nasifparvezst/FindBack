const { inspectDeployment } = require('../.test-build/deployment.js');

/** Anonymous, read-only probes. Never sign in, create users or return credential values. */
async function checkCloud(env, request = fetch) {
  const configuration = inspectDeployment(env);
  if (configuration.mode !== 'cloud' || !configuration.supabaseOrigin || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()) {
    throw new Error('Configure Cloud mode, the Supabase URL and a public key in .env.local first.');
  }
  async function json(path, label, body) {
    let response;
    try {
      response = await request(configuration.supabaseOrigin + path, {
        method: body ? 'POST' : 'GET', redirect: 'error', cache: 'no-store',
        headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.trim(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10_000),
      });
    } catch { throw new Error(`Could not reach Supabase ${label}. Check the connection and project URL.`); }
    if (!response.ok) throw new Error(`Supabase ${label} failed (HTTP ${response.status}). Check the public key, API access and pending migrations.`);
    try { return await response.json(); } catch { throw new Error(`Supabase ${label} returned an unreadable response.`); }
  }
  const settings = await json('/auth/v1/settings', 'Auth settings');
  if (settings?.external?.email !== true || settings.disable_signup !== false) throw new Error('Enable email sign-up in Supabase Auth.');
  if (settings.mailer_autoconfirm !== false) throw new Error('Enable email confirmation in Supabase Auth before inviting students.');
  const page = await json('/rest/v1/rpc/get_data_page', 'public report page', { p_query: { kind: 'bootstrap' } });
  if (!page || !Array.isArray(page.ids) || page.ids.length > 4 || page.page !== 1 || page.pageSize !== 4 || !Number.isSafeInteger(page.total) || page.total < page.ids.length || !page.bundle || typeof page.bundle !== 'object') {
    throw new Error('Unexpected public report page. Check the paging migration.');
  }
  const bundle = page.bundle;
  for (const field of ['contacts', 'emails', 'admins', 'claims', 'messages', 'notifications', 'activity', 'flags']) {
    if (field in bundle && (!Array.isArray(bundle[field]) || bundle[field].length)) throw new Error('Anonymous page returned private data. Stop Cloud launch and review database grants/RLS.');
  }
  if (!Array.isArray(bundle.reports) || !Array.isArray(bundle.profiles) || bundle.reports.length > 4) throw new Error('Unexpected public page bundle. Check the paging migration.');
  const profileFields = new Set(['id', 'display_name', 'created_at']);
  const reportFields = new Set(['id', 'owner_id', 'type', 'title', 'category', 'brand', 'color', 'location', 'occurred_on', 'description', 'image_path', 'status', 'linked_report_id', 'created_at', 'updated_at', 'hidden', 'moderated_at']);
  if (bundle.profiles.some(profile => !profile || Object.keys(profile).some(key => !profileFields.has(key))) ||
      bundle.reports.some(report => !report || Object.keys(report).some(key => !reportFields.has(key)) || report.hidden || (report.category === 'ID Card' && report.image_path))) {
    throw new Error('Public page contains unexpected or private fields. Review database grants/RLS and image privacy.');
  }
  return { publicReports: page.total };
}

if (require.main === module) {
  require('@next/env').loadEnvConfig(process.cwd(), true, { info() {}, warn() {}, error() {} });
  checkCloud(process.env).then(({ publicReports }) => {
    console.log(`Cloud read checks passed: email sign-up/confirmation settings and anonymous page (${publicReports} public reports).`);
    console.log('No users or records were created. SMTP delivery, all migrations/RLS, Storage and multi-user Realtime still need separate verification.');
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { checkCloud };
