# Live Cloud setup status

Updated 15 November 2026 (Asia/Omsk). Project: `pxdzaapokjtocnplqmmd`.

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

## Security advisor review

Two warning categories remain for intentional API functions: anonymous callers can execute the guarded hidden-report predicate/public aggregates, and authenticated callers can execute guarded SECURITY DEFINER RPCs. These functions use fixed search paths and explicit caller checks; the tested private boundaries remain denied. No RLS-disabled application table was found. Review context before changing these grants, since the app and policies depend on them. [Anonymous function advisory](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated function advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Still pending

- The two requested real accounts must sign up with their own passwords and verify their inbox links. The trusted Admin membership will be granted only after email verification; signup metadata cannot grant it. No permanent test/Admin account has been created.
- Confirm Auth Site URL/allowed redirects and email templates in the Dashboard using [STEP2_SETUP.md](STEP2_SETUP.md). Default PKCE email links must open in the signup browser; the custom token-hash template supports confirmation from another browser.
- Configure/verify SMTP if the built-in mail service cannot send to the intended campus accounts; inbox delivery/password recovery are not verified. [Supabase SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp).
- Check real signed-in Storage uploads, two-user Realtime, unread/reconnect and concurrent transactions after those accounts are available.
- Set the real production HTTPS origin, deploy and verify the live domain/CDN. No website deployment has been performed.
