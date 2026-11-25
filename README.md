# FindBack

FindBack is a campus lost-and-found platform for Southeast University. Students can publish lost or found item reports, discover possible matches, communicate privately, submit claims, and complete a two-party handover. Administrators can moderate reports, review activity, and manage administrator access.

## Live website

Open the public production URL from any phone, computer, or browser:

**https://findback-pi.vercel.app**

This is the public production alias. Do not use a generated deployment URL such as `https://findback-<deployment-id>-nasifparvezst.vercel.app`; those URLs are protected by Vercel authentication and may work only in the owner's browser.

The project is deployed in Vercel project `nasifparvezst/findback` and uses the real Supabase Cloud project. The current deployment is a pilot release for real-user testing. Record bugs from the live site and deploy focused fixes after review.

## What the application does

### Student accounts

- Students create accounts with a verified `@seu.edu.bd` email address.
- Students can sign in with email/password or Google. Google sign-in remains restricted to campus email accounts by the database rules.
- Password fields include visibility controls and browser password-manager support.
- “Remember me” controls whether the Supabase session survives browser restarts. Passwords are never stored in localStorage or returned by the application.
- Password recovery uses the Supabase email flow.

### Lost-and-found reports

- Create Lost or Found reports with title, category, location, date, description, contact phone, and an optional photograph.
- Browse public open reports with search, category/type filters, sorting, and pagination.
- Edit or remove your own reports when the workflow permits it.
- Photo processing compresses supported images before upload.
- ID-card photographs are blocked from public report storage to reduce identity exposure.
- Replacing or removing a photograph cleans up the old cloud object when possible.

### Smart Matching

Smart Matching compares compatible Lost and Found reports from different owners. It normalizes Bangla and Unicode text, compares category/title/description/location signals, uses the configured 30-day date window, and explains positive and negative signals. Scores are shown out of 100; they are ranking hints, not proof of ownership.

### Claims and handover

- A student submits a claim with a message and can optionally relate another report.
- The report owner reviews the claim and can approve or reject it.
- The claim conversation is private to the two participants and authorized Admins.
- Both parties must confirm the physical handover separately. Admins cannot confirm on behalf of either party.
- Participants can cancel before confirmation, raise a dispute after confirmation starts, and continue a resolved dispute only through the Admin workflow.
- Closed claims cannot receive new messages.

### Private chat and notifications

- Claim participants receive private chat messages and status notifications.
- Messages use cursor-based history pages and a delivery UUID for idempotent retries.
- Realtime events invalidate authorized queries; reconnect, tab focus, periodic refresh, and online recovery reconcile missed events.
- Unread notification and message counts remain private to the signed-in user.

### Admin moderation

- Students can flag another member's visible report with a reason.
- Admins can hide or restore reports, dismiss flags, suspend/restore members, and edit another member's report with an audited reason.
- Hidden reports disappear from public browsing and matching while existing participants, the owner, and Admins retain the permitted private context.
- Moderation actions, Admin changes, and reasons are recorded in an audit table.
- Dashboard data uses bounded server-side pages, exact counts, stable cursors, and cancellable CSV export.

### Admin account management

- Any active Admin can open `/admin/accounts` and create another Admin with any valid email domain. The `@seu.edu.bd` restriction applies to students, not Admins.
- There can be at most five Admins, including pending account-provisioning slots.
- All Admins have equal power. Any active Admin can remove another Admin's role.
- Removing a role keeps the Auth account, existing reports, claims, messages, and history. It only removes Admin access.
- The last Admin and the last active Admin are protected from accidental lockout.
- New Admin password accounts are created only by the server through the Supabase Admin API. The secret key is never sent to the browser.

## Technology

- Next.js 16 App Router
- React 19 and TypeScript
- Supabase Auth, PostgreSQL, Row Level Security, Storage, and Realtime
- Vercel Node/Next.js deployment
- PGlite and Node's test runner for focused SQL and logic tests
- `lucide-react` for interface icons

## How the data flow works

1. The browser uses the Supabase publishable key and the signed-in user's Auth session.
2. Supabase Auth creates or refreshes the session through the browser/SSR clients.
3. The Cloud provider loads only the requested server page and related RLS-visible records.
4. Mutations call guarded PostgreSQL RPCs. The database checks the authenticated user, active membership, report ownership, claim participants, and Admin membership.
5. Storage policies keep report photographs separate from private records. ID-card images are rejected by both application and database constraints.
6. Realtime events trigger a fresh authorized query; event payloads are not copied directly into shared state.
7. Server-only Admin routes use the Supabase secret key only after verifying the current session and database Admin membership.

## Run locally

### Requirements

- Node.js 22 or newer
- npm
- VS Code or another editor

### Demo mode

Demo mode is browser-local and does not create real accounts or shared cloud data.

```powershell
npm ci
npm run dev
```

Open `http://localhost:3000` on the same computer. `localhost` is intentionally local to that device; opening `http://localhost:3000` on a phone points to the phone itself and will not open the PC's server.

To test from another device on the same Wi-Fi, start Next with a LAN bind address and use the PC's LAN IP instead:

```powershell
npm run dev -- --hostname 0.0.0.0
```

Then open `http://<your-PC-LAN-IP>:3000`. Windows Firewall must allow the Node process on the private network. For public access, use the deployed URL above instead of exposing the development server.

### Cloud mode

Copy `.env.example` to `.env.local`, then configure:

```env
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
APP_ORIGIN=http://localhost:3000

# Server-only values. Never use NEXT_PUBLIC_ for these.
SUPABASE_SECRET_KEY=your-server-only-secret-key
BOOTSTRAP_ADMIN_EMAIL=2023100000534@seu.edu.bd
BOOTSTRAP_ADMIN_PASSWORD=choose-a-12-character-or-longer-password
```

Restart the dev server after changing environment variables. Never commit or share `.env.local`.

The live project already has the migrations listed below. Do not rerun already-applied migrations in the live database.

## Database migrations

Apply new migrations in filename order in a fresh project:

1. `supabase/migrations/202611050001_initial.sql`
2. `supabase/migrations/202611060001_report_management_privacy.sql`
3. `supabase/migrations/202611120001_two_party_handover.sql`
4. `supabase/migrations/202611130001_private_chat_realtime.sql`
5. `supabase/migrations/202611130002_admin_moderation.sql`
6. `supabase/migrations/202611130003_paged_data.sql`
7. `supabase/migrations/202611150001_message_insert_integrity.sql`
8. `supabase/migrations/202611160001_admin_account_management.sql`
9. `supabase/migrations/202611160002_admin_auth_transaction.sql`

The remote migration versions and live setup notes are recorded in [`docs/CLOUD_SETUP_STATUS.md`](docs/CLOUD_SETUP_STATUS.md). Review each migration before applying it to a different Supabase project.

## Google sign-in setup

1. Create a Google Auth Platform Web OAuth client.
2. Add the application's production origin and local origin as authorized JavaScript origins.
3. Add this Supabase callback as an authorized redirect URI:

   `https://pxdzaapokjtocnplqmmd.supabase.co/auth/v1/callback`

4. Enable Google under Supabase **Authentication → Sign In / Providers → Google** and save the Google Client ID and Client Secret there.
5. Set the Supabase Site URL to `https://findback-pi.vercel.app` and allow the production/local callback patterns required by the app.

The application sends `hd=seu.edu.bd` to help users choose the campus account, but the database remains the final access-control check.

## Admin bootstrap

The initial Admin email is configured through the ignored server environment. After the migration is applied and the local server-only secret/password are set, run:

```powershell
npm run admin:bootstrap
```

This is an explicit command, not startup behavior. It can promote the verified initial account or set its configured password. It cannot restore a removed initial Admin after the one-time bootstrap has been consumed.

## Deploying to Vercel

The current public production alias is:

```text
https://findback-pi.vercel.app
```

Configure the Vercel project with:

- Framework: Next.js
- Node: 24.x (or a supported newer version)
- Install: `npm ci`
- Build: `npm run build`
- `NEXT_PUBLIC_DEMO_MODE=false`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` as a server-only Secret
- `APP_ORIGIN=https://findback-pi.vercel.app`

The Vercel project is currently deployed manually from `codex/baseline-audit`; automatic Git deployment is not connected. A focused change should be tested, committed, pushed, and then deployed again with the Vercel project. Use the production alias when checking the site from a phone. Generated deployment URLs can remain protected by Vercel authentication.

The `.vercelignore` file excludes local environment files, generated build/test folders, credentials, and project-link metadata from uploads.

## Useful commands

```powershell
npm run dev
npm run typecheck
npm run lint
npm test
npm run test:accounts
npm run test:claims
npm run test:chat
npm run test:admin
npm run test:paging
npm run test:ui
npm run test:security
npm run cloud:check
npm run release:check -- --mode cloud
npm run build
```

Use targeted tests for focused changes. Run a full project audit only when explicitly requested with `FINAL AUDIT`.

## Project structure

```text
src/app/                 Next.js routes, Auth callbacks, Admin API, and pages
src/components/          Reusable UI, authentication, chat, and Admin components
src/context/             Demo and Cloud providers/AppStore
src/lib/                 Matching, validation, workflows, Supabase, security utilities
public/                  Static assets and the FindBack logo
supabase/migrations/     PostgreSQL schema, RLS, RPC, trigger, and Realtime migrations
tests/                   Logic, SQL, security, usability, and browser checks
docs/                    Setup, deployment, security, matching, and live-status notes
scripts/                 Bootstrap and release helper scripts
```

## Security rules

- Never commit `.env.local`, Supabase secret/service-role keys, Google Client Secrets, or Vercel tokens.
- Never put a server-only key in a `NEXT_PUBLIC_*` variable.
- Treat the browser as untrusted; Admin status comes from the database, not client metadata.
- Keep RLS enabled on all application tables.
- Do not upload identity-document photographs.
- Use HTTPS in production and keep `APP_ORIGIN` set to the exact deployed origin.
- Do not reset or delete an existing Auth account through the Admin creation form; use a new email for a new Admin.

## Deliberate scope limits

The current scope does not include campus maps/location navigation, QR-code handover, AI image matching, or advanced student profile features. Smart Matching is text/date/category based and is a decision aid rather than an ownership decision.

## Documentation

- [`docs/CLOUD_SETUP_STATUS.md`](docs/CLOUD_SETUP_STATUS.md) — live Supabase and Vercel status
- [`docs/DEPLOYMENT_BN.md`](docs/DEPLOYMENT_BN.md) — Bengali deployment guide
- [`docs/STEP2_SETUP.md`](docs/STEP2_SETUP.md) — Supabase setup and Auth templates
- [`docs/SECURITY_TEST_CHECKLIST.md`](docs/SECURITY_TEST_CHECKLIST.md) — live security test checklist
- [`docs/SMART_MATCHING.md`](docs/SMART_MATCHING.md) — matching weights and behavior
