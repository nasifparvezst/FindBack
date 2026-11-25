# Live Cloud setup status

Updated 25 November 2026 (Asia/Omsk). Project: `pxdzaapokjtocnplqmmd`.

## Completed

- Connected the project-scoped `supabase-findback` MCP server through OAuth.
- Inspected an empty project, then applied all seven existing migrations to PostgreSQL 17.11.
- Verified all ten application tables have RLS, the public `report-images` bucket allows JPG/PNG/WebP up to 2 MB, and claims/messages/notifications are published for Realtime.
- Created the ignored local `.env.local` with Cloud mode, the project URL and publishable key. Local `APP_ORIGIN` is `http://localhost:3000`; production requires the actual HTTPS origin.
- Restarted the local dev server on port 3000 with Cloud configuration. Demo accounts are replaced by real email/password forms.
- Updated signup's redirect to `/auth/callback` for default PKCE confirmation links. Custom token-hash templates retain `/auth/confirm`.
- Enabled Google through the user-configured OAuth Web client and deployed the Cloud pilot to **https://findback-pi.vercel.app** in Vercel project `nasifparvezst/findback`. The user confirmed campus Google sign-in on both localhost and the deployed website.

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
| `202611160002_admin_auth_transaction.sql` | `20261116160323` |

## Security advisor review

Two warning categories remain for intentional API functions: anonymous callers can execute the guarded hidden-report predicate/public aggregates, and authenticated callers can execute guarded SECURITY DEFINER RPCs. These functions use fixed search paths and explicit caller checks; the tested private boundaries remain denied. No RLS-disabled application table was found. Review context before changing these grants, since the app and policies depend on them. [Anonymous function advisory](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated function advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Admin and sign-in update (applied 16 November)

- Applied `202611160001_admin_account_management.sql` through the project-scoped Supabase connection after renewing OAuth. Remote migration name is `admin_account_management`, version `20261116154450`. The seven older migrations were retained. Supabase's API now exposes the new functions (HTTP 200); the reported `PGRST202` missing-migration failure is resolved.
- Applied the follow-up `202611160002_admin_auth_transaction.sql` as `admin_auth_transaction`, version `20261116160323`. Admin provisioning is an initially deferred constraint trigger that reads the final Auth row at commit. This matches Auth's insert-then-confirm transaction, permits general-email Admin creation and keeps role creation atomic with confirmed account creation. Student campus-email restrictions remain enforced. [Auth Admin create implementation](https://github.com/supabase/auth/blob/master/internal/api/admin.go).
- `/admin/accounts` lets active Admins create confirmed password accounts with a new email (campus or external), list up to five equal Admins and remove their roles. Existing email accounts/passwords cannot be replaced through this form. Role removal keeps the account, reports and messages; non-campus accounts lose member access when their Admin role is removed. The last active Admin is protected.
- The database allocates private, expiring UUID-bound slots before Auth creation and serializes membership changes. User-editable metadata cannot grant Admin access. Both existing members and pending slots count toward the limit of five.
- The requested initial account already exists, has verified email and has Admin membership. The earlier activation checks preserved one Admin; the later production API check preserved the two existing Admins present at that time. The user's server key is configured in the ignored `.env.local` and as a server-only production Secret in Vercel. No existing Admin password was reset. To explicitly set the configured password later, choose a 12+ character `BOOTSTRAP_ADMIN_PASSWORD`, then run `npm run admin:bootstrap`. This command creates the initial account or promotes a verified existing account; re-running it sets that existing Admin's configured password. It does not run at startup and cannot restore a removed initial Admin. Never use a `NEXT_PUBLIC_*` secret key. [Supabase key settings](https://supabase.com/docs/guides/getting-started/api-keys).
- Password fields support visibility toggles and browser password managers. Remember me controls persistent versus browser-session Auth/PKCE cookies, including server refreshes. The application never saves plaintext passwords in browser storage.
- Continue with Google uses PKCE and the existing `/auth/callback`; student email restriction remains enforced in the database. The Google `hd` hint improves account selection and is not the access-control check. If the provider is disabled, the form offers email/password rather than navigating to a provider error.
- Google provider is enabled. The authorization probe returns HTTP 302 to Google with the correct Supabase callback and `seu.edu.bd` account-selection hint. The user confirmed successful campus Google sign-in locally and on the production website after updating Supabase's Site URL/redirect allowlist. Production Site URL is `https://findback-pi.vercel.app`; configured redirect patterns include `https://findback-pi.vercel.app/**` and `http://localhost:3000/**`. Google's authorized redirect URI remains `https://pxdzaapokjtocnplqmmd.supabase.co/auth/v1/callback`. [Google provider setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).
- Local validation: 60 focused unit/SQL tests, TypeScript and changed-file lint passed. Regression coverage includes Auth's initially unconfirmed insert followed by metadata/confirmation updates, commit-time role creation, full rollback for unconfirmed/expired final rows and safe Auth error mapping. The earlier isolated Chrome check verified password controls, cookie durations, campus Google request and mobile Admin UI with intercepted responses. Real Google sign-in was subsequently confirmed by the user locally and in production; parallel live-database sessions remain unverified.
- Live verification: created and confirmed a temporary general-email Admin through the real Supabase Auth HTTP API, signed in, called the website's Admin list endpoint (200), created another general-email Admin through the website endpoint (201), signed in as the new Admin and verified its active Admin role, then removed its role through the website endpoint (200). Temporary Auth accounts, reservations and application audit fixtures were removed; the original one-Admin count was restored and confirmed. The initial Admin account/password was not changed. Earlier live SQL checks verified the five-Admin cap, equal removal powers, retained accounts, revoked non-campus member access and last-Admin protection.

## Vercel pilot deployment

- Production URL: **https://findback-pi.vercel.app**. Project `nasifparvezst/findback`, deployment `dpl_2XZr7YxdwZpTbpBEoh6fpZEGxLSY`, source commit `1dc2d4f` on `codex/baseline-audit`. Deployed with the CLI; automatic Git deployment is not connected and `main` was not merged.
- Next.js preset, Node 24.x, `npm ci`, `npm run build`, default Next output. Production build and its TypeScript check passed. No additional full audit/test suite was run.
- Production variables: Cloud mode, Supabase URL/publishable key, server-only `SUPABASE_SECRET_KEY`, and `APP_ORIGIN=https://findback-pi.vercel.app`. The server key was sent through stdin and stored as a Vercel Secret; no credential values were committed or printed.
- Upload manifest verification confirmed 114 regular source files, excluding local environment files and generated/private artifact contents. The CLI retained one harmless empty test-directory entry. `.vercel` project-link metadata remains ignored by Git.
- Public HTTP verification: Home/login/register 200; unauthenticated Admin API 401; missing-code callback redirects to production login; correct-origin unauthenticated create 401 and foreign-origin create 403. An isolated production Chrome check verified Cloud forms, Google button, password controls and mobile layout without captured runtime/CSP errors.
- Real production Admin integration passed: general-email Auth account creation, HTTPS-cookie sign-in, Admin GET 200/create 201/remove 200 and sign-in/role verification of the newly created Admin. Both temporary accounts, reservations and application audit fixtures were removed; the pre-test count of two existing Admins was restored.
- The user confirmed successful Google sign-in on the live website. Real-user pilot usage and bug notes can now proceed.

## Cross-device access diagnosis (25 November)

- The public production alias `https://findback-pi.vercel.app` returns HTTP 200 without a Vercel session and is the URL that must be shared with phones and other computers.
- The generated deployment URL `https://findback-6zzc3qhn6-nasifparvezst.vercel.app` redirects to Vercel SSO. It can work in the owner's Chrome because that browser has a Vercel session, but it is not a public pilot URL.
- `http://localhost:3000` is local to the device where Next.js is running. Opening that address on a phone points to the phone itself. The README now documents the LAN-development alternative and the public production URL.
- Vercel SSO was not disabled because the automatic safety review rejected a persistent access-control weakening. No production data or application code was changed for this diagnosis.

## Still pending

- Verify email-template/password-reset inbox delivery on the production domain using [STEP2_SETUP.md](STEP2_SETUP.md). Default PKCE email links must open in the signup browser; the custom token-hash template supports confirmation from another browser.
- Configure/verify SMTP if the built-in mail service cannot send to the intended campus accounts; inbox delivery/password recovery are not verified. [Supabase SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp).
- Check real signed-in Storage uploads, two-user Realtime, unread/reconnect and concurrent transactions after those accounts are available.
- Collect pilot bug notes from real usage. Run another comprehensive audit only when the user explicitly requests `FINAL AUDIT`.
