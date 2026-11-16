# Live Cloud setup status

Updated 16 November 2026 (Asia/Omsk). Project: `pxdzaapokjtocnplqmmd`.

## Completed

- Connected the project-scoped `supabase-findback` MCP server through OAuth.
- Inspected an empty project, then applied all seven existing migrations to PostgreSQL 17.11.
- Verified all ten application tables have RLS, the public `report-images` bucket allows JPG/PNG/WebP up to 2 MB, and claims/messages/notifications are published for Realtime.
- Created the ignored local `.env.local` with Cloud mode, the project URL and publishable key. Local `APP_ORIGIN` is `http://localhost:3000`; production requires the actual HTTPS origin.
- Restarted the local dev server on port 3000 with Cloud configuration. Demo accounts are replaced by real email/password forms.
- Updated signup's redirect to `/auth/callback` for default PKCE confirmation links. Custom token-hash templates retain `/auth/confirm`.

## Verification

- `npm run cloud:check` passed against the real project: email signup/confirmation enabled, public bootstrap page valid and empty.
- Actual anonymous HTTP requests: reports returned 200; contacts, claims, messages, profile emails and Admin membership returned 401.
- A live database transaction verified report creation, linked claims, private contact/claim boundaries, chat, owner approval, two-party completion, Admin confirmation denial and closed-chat denial. Generated fixture users/data were rolled back; none were retained.
- An isolated Chrome profile rendered the real Cloud Home/Browse/login/register pages and guest boundaries without captured runtime/CSP errors. The signup probe intercepted its request locally, so no account or email was created by that browser test.
- Changed-file lint passed. No full suite/build was repeated.

The SQL transaction uses role/JWT-context simulation on the actual database; it does not prove end-user JWT issuance, inbox delivery or cross-device WebSocket behavior.

## Migration ledger

MCP assigned these remote versions; source SQL files retain their original names. Do not apply them again. Before introducing CLI `db push`, reconcile/import the remote history with the local filenames using the CLI migration-history workflow.

| Source file | Remote version |
| --- | --- |
| `202611050001_initial.sql` | `20261115135638` |
| `202611060001_report_management_privacy.sql` | `20261115135719` |
| `202611120001_two_party_handover.sql` | `20261115135725` |
| `202611130001_private_chat_realtime.sql` | `20261115135730` |
| `202611130002_admin_moderation.sql` | `20261115135735` |
| `202611130003_paged_data.sql` | `20261115135741` |
| `202611150001_message_insert_integrity.sql` | `20261115135746` |
| `202611160001_admin_account_management.sql` | `20261116154450` |

## Security advisor review

Two warning categories remain for intentional API functions: anonymous callers can execute the guarded hidden-report predicate/public aggregates, and authenticated callers can execute guarded SECURITY DEFINER RPCs. These functions use fixed search paths and explicit caller checks; the tested private boundaries remain denied. No RLS-disabled application table was found. Review context before changing these grants, since the app and policies depend on them. [Anonymous function advisory](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated function advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Admin and sign-in update (applied 16 November)

- Applied `202611160001_admin_account_management.sql` through the project-scoped Supabase connection after renewing OAuth. Remote migration name is `admin_account_management`, version `20261116154450`. The seven older migrations were retained. Supabase's API now exposes the new functions (HTTP 200); the reported `PGRST202` missing-migration failure is resolved.
- `/admin/accounts` lets active Admins create confirmed password accounts with a new email (campus or external), list up to five equal Admins and remove their roles. Existing email accounts/passwords cannot be replaced through this form. Role removal keeps the account, reports and messages; non-campus accounts lose member access when their Admin role is removed. The last active Admin is protected.
- The database allocates private, expiring UUID-bound slots before Auth creation and serializes membership changes. User-editable metadata cannot grant Admin access. Both existing members and pending slots count toward the limit of five.
- The requested initial account already exists, has verified email and has Admin membership. Exactly one permanent Admin was present before and after verification. The user's server key is configured in the ignored `.env.local`. The configured bootstrap password is shorter than 12 characters and did not authenticate the existing account, so no password reset/bootstrap was performed. Existing Admin login remains unchanged. To explicitly set the configured password later, choose a 12+ character `BOOTSTRAP_ADMIN_PASSWORD`, then run `npm run admin:bootstrap`. This command creates the initial account or promotes a verified existing account; re-running it sets that existing Admin's configured password. It does not run at startup and cannot restore a removed initial Admin. Never use a `NEXT_PUBLIC_*` secret key. [Supabase key settings](https://supabase.com/docs/guides/getting-started/api-keys).
- Password fields support visibility toggles and browser password managers. Remember me controls persistent versus browser-session Auth/PKCE cookies, including server refreshes. The application never saves plaintext passwords in browser storage.
- Continue with Google uses PKCE and the existing `/auth/callback`; student email restriction remains enforced in the database. The Google `hd` hint improves account selection and is not the access-control check. If the provider is disabled, the form offers email/password rather than navigating to a provider error.
- Google activation still requires a Google OAuth Web client ID/secret configured in Supabase Authentication → Sign In / Providers → Google. Set Google's authorized redirect URI to `https://pxdzaapokjtocnplqmmd.supabase.co/auth/v1/callback` and include the application `/auth/callback` in Supabase's allowed redirects. Configure the credentials in the provider dashboard, never in frontend source. [Google provider setup](https://supabase.com/docs/guides/auth/social-login/auth-google).
- Local validation: 57 focused unit/SQL tests, TypeScript and changed-file lint passed. An isolated Chrome check intercepted Auth/Admin responses and verified password controls, cookie durations, campus Google request, mobile create/five-slot/remove UI. This does not verify real Google OAuth, real Admin creation or simultaneous live-database transactions.
- Live verification after applying the migration: an authenticated-role SQL transaction provisioned four temporary Admins through UUID reservations and Auth-table triggers, rejected a sixth Admin, verified equal powers to remove the initial Admin, revoked member access for a removed non-campus Admin, preserved accounts and protected the last Admin. All fixtures and changes were rolled back; the original one-Admin state was verified afterward. Both private provisioning tables have RLS enabled. This exercises the real database, but not Auth's account-creation HTTP endpoint or parallel sessions. The authenticated application-API check could not run because the configured bootstrap password differs from the existing account's login password; it was not reset.

## Still pending

- The user reports successful campus Student signup/sign-in, and the initial verified Admin membership is confirmed. No new permanent Admin account was created by this update. The optional configured-password bootstrap and authenticated browser/API verification remain as described above.
- Confirm Auth Site URL/allowed redirects and email templates in the Dashboard using [STEP2_SETUP.md](STEP2_SETUP.md). Default PKCE email links must open in the signup browser; the custom token-hash template supports confirmation from another browser.
- Configure/verify SMTP if the built-in mail service cannot send to the intended campus accounts; inbox delivery/password recovery are not verified. [Supabase SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp).
- Check real signed-in Storage uploads, two-user Realtime, unread/reconnect and concurrent transactions after those accounts are available.
- Set the real production HTTPS origin, deploy and verify the live domain/CDN. No website deployment has been performed.
