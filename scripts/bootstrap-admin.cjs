// Explicit, trusted server-side bootstrap. Never import this from the application UI.
const { loadEnvConfig } = require('@next/env');
const { createClient } = require('@supabase/supabase-js');
const { adminDraft, adminSecret, AdminAccountError } = require('../.test-build/admin-accounts.js');

async function main() {
  loadEnvConfig(process.cwd());
  const draft = adminDraft({ name: 'FindBack Admin', email: process.env.BOOTSTRAP_ADMIN_EMAIL, password: process.env.BOOTSTRAP_ADMIN_PASSWORD });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new AdminAccountError(503, 'Set the Supabase project URL in .env.local.');
  const client = createClient(url, adminSecret(process.env), { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data: reservation, error } = await client.rpc('prepare_bootstrap_admin', { p_email: draft.email });
  if (error || !reservation?.user_id) throw new Error('Bootstrap is unavailable. Apply the Admin account migration, verify any existing account, and check whether bootstrap has already been used.');
  const id = reservation.user_id;
  try {
    // Running this explicit command also sets the configured password for an existing
    // initial Admin. It never runs on server startup or elevates a removed Admin again.
    const result = reservation.existing
      ? await client.auth.admin.updateUserById(id, { password: draft.password })
      : await client.auth.admin.createUser({ id, email: draft.email, password: draft.password, email_confirm: true,
        user_metadata: { full_name: draft.name }, app_metadata: { findback_admin_provision: true } });
    if (result.error || result.data.user?.id !== id) throw new Error('The initial Admin password could not be configured. Check the Admin list before retrying.');
    const check = await client.rpc('admin_account_provisioned', { p_user_id: id });
    if (check.error || check.data !== true) throw new Error('Admin access could not be confirmed. Check the Admin list before retrying.');
    console.log('Initial Admin is ready. Sign in using BOOTSTRAP_ADMIN_EMAIL and the password in your local server settings.');
  } finally {
    try { await client.rpc('cancel_bootstrap_admin', { p_user_id: id }); } catch { /* Reservation expires automatically. */ }
  }
}
main().catch(error => {
  console.error(error instanceof AdminAccountError ? error.message : 'Admin bootstrap could not finish. Check the server key, migration, existing-account verification and Admin list.');
  process.exitCode = 1;
});
