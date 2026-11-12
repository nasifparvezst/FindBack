# FindBack 2.0 -- Step 3

A Next.js 16 + React 19 + TypeScript campus lost-and-found application. Step 3 improves report creation and editing, duplicate warnings, browsing, My Reports management, image privacy and storage cleanup.

> **Release status:** The Step 3 baseline includes Phase 1 Smart Matching and Phase 2 two-party handover. Phase 2 passed 24 targeted Demo/SQL tests, TypeScript checking, changed-file lint and browser workflow checks. Earlier baseline production-build results are in `docs/BASELINE_AUDIT.md`; a new full build/suite is deferred to the final audit. Live Supabase, email and real concurrent multi-user testing remain required before deployment.

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
npm run build
```

`npm test` runs the matching, validation, statistics and duplicate-warning unit tests. A passing unit test suite does not replace live Supabase RLS, Auth, Storage or browser end-to-end testing.

`npm run typecheck` generates Next.js route types before checking TypeScript, so it also works before the first dev server or production build. Lint excludes generated `.test-build` output and supports the Node test runner's CommonJS test files.

`npm run test:claims` runs only the claim state-machine and disposable PostgreSQL/RLS tests. PGlite is a development-only dependency; the tests simulate Supabase-managed Auth/Storage schemas locally and do not connect to your Supabase project. Its single connection does not reproduce concurrent transactions on a live server.

## Phase 2 handover

The claim page records owner and claimant confirmations separately; both are required before completing the claim and returning its linked reports. A Lost report owner confirms receiving; a Found report owner confirms handing over. Admins cannot confirm for another party. Cancel is available before either confirmation; afterward, participants can raise a dispute. Admin dispute resolution requires a reason and audit entry, and resuming clears prior confirmations so both parties must confirm again. Closed claims cannot send messages.

Cloud mode requires the third migration above. It preserves existing reports/claims/messages, adds confirmation/review/dispute timestamps and statuses, protects reserved reports, and disables the legacy one-party completion RPC. Previously completed claims remain historical records; existing approved claims require fresh confirmations. The migration stops without changing data if it finds overlapping approved reservations. Apply it once after review; rolling back later requires reconciling new claim states rather than rerunning old migrations.

## Scope decisions

Campus maps/location finder, advanced student profile features, QR handover and AI image matching are not included in the agreed scope. The Advanced Admin Dashboard remains part of the project.

## Smart Matching and deployment

Smart Matching compares open reports from different owners, normalizes Bangla/Unicode text, explains positive and negative signals, and uses a configurable 30-day date window. Scores are shown out of 100. Read `docs/SMART_MATCHING.md` for weights, confidence limits and tests.

Pushing to GitHub stores code; a hosting deployment is a separate step. This app uses dynamic routes, Auth callbacks and a session proxy, so deploy it with a Next.js-compatible Node host. The current app cannot be published by uploading its source to static GitHub Pages. The Bangla guide in `docs/DEPLOYMENT_BN.md` explains a Demo deployment and later Cloud setup, including how to preview `codex/baseline-audit` before merging it into `main`.
