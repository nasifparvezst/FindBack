# FindBack 2.0 -- Step 3

A Next.js 16 + React 19 + TypeScript campus lost-and-found application. Step 3 improves report creation and editing, duplicate warnings, browsing, My Reports management, image privacy and storage cleanup.

> **Release status:** Phases 1–5 are implemented, including server-side filtering and pagination without the former 500-record snapshot cap. Phase 5 passed 15 targeted logic/SQL tests, TypeScript, changed-file lint, Demo browser checks and Cloud-mode browser checks against a disposable local API/database fixture with 550+ records. Real Supabase Auth/Realtime, email and concurrent multi-device verification remain required. A full build/suite is deferred to the requested final audit.

## Requirements

- Node.js 22 or later and npm (required by the locked Supabase client)
- VS Code or another code editor
- A Supabase project only when enabling cloud mode

## Run the demo locally

1. Extract the ZIP.
2. Open the extracted folder that contains `package.json` in VS Code.
3. Copy `.env.example` to `.env.local`.
4. Keep `NEXT_PUBLIC_DEMO_MODE=true` for the local demo.
5. Open **Terminal > New Terminal** and run:

```sh
npm ci
npm run dev
```

6. Open http://localhost:3000. Stop the server with `Ctrl + C`.

On Windows PowerShell, use `npm.cmd` in place of `npm` if execution policy blocks `npm.ps1`. The committed `package-lock.json` pins the dependency versions used by `npm ci`.

## Enable the shared Supabase database

Read `docs/STEP2_SETUP.md`. In summary:

1. Create a new Supabase project and enable email confirmation.
2. Run migrations in filename order:
   - `supabase/migrations/202611050001_initial.sql`
   - `supabase/migrations/202611060001_report_management_privacy.sql`
   - `supabase/migrations/202611120001_two_party_handover.sql`
   - `supabase/migrations/202611130001_private_chat_realtime.sql`
   - `supabase/migrations/202611130002_admin_moderation.sql`
   - `supabase/migrations/202611130003_paged_data.sql`
3. Configure the email confirmation and password recovery templates/redirect URLs.
4. Copy the Supabase Project URL and publishable key into `.env.local`.
5. Set `NEXT_PUBLIC_DEMO_MODE=false` and restart the dev server.
6. Register and verify two separate `@seu.edu.bd` accounts and test the workflow described in `docs/SECURITY_TEST_CHECKLIST.md`.

Do not place a service-role key in any `NEXT_PUBLIC_*` variable or browser code. Do not share `.env.local`.

## Step 3 features

- Lost and found report create, edit and delete workflows
- Photo compression and cloud storage upload
- Soft duplicate-report warnings before submission
- ID Card photo upload blocked to protect personal information
- Browse filters, sorting and pagination
- My Reports search, status filters, claim tabs and pagination
- Old cloud photo cleanup after a report photo is replaced or removed
- Database constraint that prevents public ID Card photos

## Included project structure

```text
src/                 Next.js pages, components, providers and utilities
public/              Static assets such as the FindBack logo
supabase/migrations/ Database schema and security migrations
tests/               Automated logic tests
docs/                Setup, database and security documentation
```

The project ZIP intentionally excludes generated folders (`node_modules`, `.next`), local secrets (`.env.local`), the old V4 source backup and the obsolete static design preview. `npm install` creates `node_modules`; running Next.js creates `.next`.

## Useful commands

```sh
npm run dev
npm run typecheck
npm run lint
npm test
npm run test:claims
npm run test:chat
npm run test:admin
npm run test:paging
npm run build
```

`npm test` runs the existing logic and disposable database tests, including claims and chat. Passing local tests do not replace live Supabase RLS, Auth, Storage or browser end-to-end testing.

`npm run typecheck` generates Next.js route types before checking TypeScript, so it also works before the first dev server or production build. Lint excludes generated `.test-build` output and supports the Node test runner's CommonJS test files.

`npm run test:claims` runs only the claim state-machine and disposable PostgreSQL/RLS tests. PGlite is a development-only dependency; the tests simulate Supabase-managed Auth/Storage schemas locally and do not connect to your Supabase project. Its single connection does not reproduce concurrent transactions on a live server.

## Phase 2 handover

The claim page records owner and claimant confirmations separately; both are required before completing the claim and returning its linked reports. A Lost report owner confirms receiving; a Found report owner confirms handing over. Admins cannot confirm for another party. Cancel is available before either confirmation; afterward, participants can raise a dispute. Admin dispute resolution requires a reason and audit entry, and resuming clears prior confirmations so both parties must confirm again. Closed claims cannot send messages.

Cloud mode requires the third migration above. It preserves existing reports/claims/messages, adds confirmation/review/dispute timestamps and statuses, protects reserved reports, and disables the legacy one-party completion RPC. Previously completed claims remain historical records; existing approved claims require fresh confirmations. The migration stops without changing data if it finds overlapping approved reservations. Apply it once after review; rolling back later requires reconciling new claim states rather than rerunning old migrations.

## Phase 3 private chat and notifications

Cloud mode subscribes to authorized claim changes, the signed-in recipient's notifications, and messages for the open conversation. Subscriptions are removed on account/conversation changes and unmount. Events trigger authorized database reads; periodic refresh, returning to the tab and reconnect reconcile missed updates. Chat history loads the latest 50 messages, with cursor-based older pages and multi-page reconnect catch-up. Message retries reuse a delivery UUID to prevent duplicate messages and alerts.

The header and claim list show unread counts. Opening a visible conversation at its newest messages reads message alerts through the displayed cursor; claim-status alerts and later arrivals remain unread. Admin messages notify both participants. Notifications now use 20-entry server pages without a snapshot cap; unread totals include all records.

Apply the fourth migration after the earlier three before enabling Cloud mode. It adds message-linked alerts and RPCs and includes `messages`, `claims` and `notifications` in the Supabase Realtime publication without weakening RLS. `npm run test:chat` runs the targeted chat logic and PostgreSQL tests; mock subscriptions verify reconnect/cleanup behavior, while local PostgreSQL verifies pagination, read cursors, idempotency and access control. Actual Supabase WebSocket delivery still requires a configured project and two devices. See `docs/STEP2_SETUP.md`.

## Phase 4 Admin moderation and analytics

Students can privately flag another member's visible report, with one open flag per reporter/report. Admins can dismiss a flag or hide/restore a report with a required reason and audit entry. Hiding resolves its open flags, notifies the owner and reporters, and preserves reports, claims and messages. Hidden reports leave public Browse/Home/Smart Matches; existing claim participants, the owner and Admin retain access. New claims and handover pause until all linked reports are restored; private chat and cancellation/disputes remain available.

Admin suspension/restoration and editing another member's report require audit reasons. Admins moderate other members' reports through hide/restore instead of permanent deletion. Owners cannot delete hidden reports or reports with open flags. Existing owner editing remains available, and editing never automatically restores a hidden report. Hiding does not revoke previously shared public Storage image URLs.

Dashboard tables support server filters, search and pagination; CSV exports all filtered reports without contact data and neutralizes spreadsheet formulas. Date-filtered metrics and six-month/category charts use a full-database Admin-only aggregate RPC. Dates use UTC; users and open flags are counted across all dates. Apply the fifth migration after the first four before enabling Cloud mode. `npm run test:admin` runs the targeted moderation tests without the complete suite.

## Phase 5 paged data and reliability

Cloud startup loads four recent public reports and exact public/personal counts. Browse, My Reports, incoming/outgoing claims, notifications and every Admin table query only the selected server page, with filters applied before counting/pagination. Pages use stable ID tie-breakers, exact totals and bounds of 1–100 rows; unavailable last pages clamp after deletions. Page bundles hydrate only their related reports/profiles and RLS-visible fields. Direct item/edit/claim routes fetch their IDs instead of depending on a recent-record snapshot. The browser discards pages on filter/account changes and aborts obsolete requests; failed requests offer Retry.

Cloud Smart Matching selects an open source report, then ranks each 25-candidate page with the existing Phase 1 score. Candidates are filtered by category, opposite type, owner, visibility and the 30-day window. Source reports are searchable and paged, so older reports remain reachable. Scores rank the current candidate page, not all campus pairs globally. Duplicate warnings examine 100 compatible reports per page within the existing 14-day window; the form can browse further candidate pages. Optional related reports in a claim are also paged. Demo mode retains its browser-local data flow.

Admin CSV walks every filtered report page using `(created_at,id)` cursors and a server timestamp, supports cancellation, and downloads only after all pages succeed. Newer inserts are excluded; updates/deletions during export reflect the state when fetched, not a transaction-wide snapshot. Normal browsing never automatically downloads an entire table.

Apply the sixth migration once after the earlier five. `npm run test:paging` verifies paging beyond 500, literal search/filter/sort, RLS, direct contexts, complete exports, cancellation and decoding. Browser verification used an isolated local PGlite API with stand-in Auth responses; it does not establish live Supabase authentication or WebSocket delivery.

## Scope decisions

Campus maps/location finder, advanced student profile features, QR handover and AI image matching are not included in the agreed scope. The Advanced Admin Dashboard remains part of the project.

## Smart Matching and deployment

Smart Matching compares open reports from different owners, normalizes Bangla/Unicode text, explains positive and negative signals, and uses a configurable 30-day date window. Scores are shown out of 100. Read `docs/SMART_MATCHING.md` for weights, confidence limits and tests.

Pushing to GitHub stores code; a hosting deployment is a separate step. This app uses dynamic routes, Auth callbacks and a session proxy, so deploy it with a Next.js-compatible Node host. The current app cannot be published by uploading its source to static GitHub Pages. The Bangla guide in `docs/DEPLOYMENT_BN.md` explains a Demo deployment and later Cloud setup, including how to preview `codex/baseline-audit` before merging it into `main`.
