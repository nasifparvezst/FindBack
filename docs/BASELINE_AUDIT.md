# FindBack 2.0 Step 3 baseline audit

Reviewed on 9 November 2026 (Asia/Dhaka), on `codex/baseline-audit`.

## Current implementation

The working application is the Next.js Step 3 project. The previous static HTML version remains in Git history. The existing architecture and design are preserved: Next.js App Router, React, TypeScript, custom CSS, and separate Demo and Supabase Cloud providers.

Source includes campus email authentication and recovery, report create/edit/delete, compressed item photos, ID Card photo blocking, duplicate warnings, Browse and My Reports filters, heuristic match suggestions, claims, claim-scoped chat, notifications, and a basic Admin dashboard with CSV export and suspension controls.

The Cloud provider uses the tables and RPC names defined by the two migrations. RLS and database authorization checks exist in source; their behavior has not been verified against a live Supabase project in this audit. No migrations were applied and no live data was changed.

## Stabilization changes

- Added `package-lock.json` using the installed dependency versions. Ran `npm install`; it completed successfully and pruned extraneous installed packages without changing the declared dependencies.
- Fixed the initial 16 lint errors and 5 warnings. CommonJS imports are allowed only in the existing `.test.cjs` files; generated test output is excluded. React Hooks lint rules remain enabled.
- Browse and My Reports reset pagination in filter event handlers instead of a follow-up effect.
- Demo initialization defers the browser storage read until after mount and cancels it on unmount. Cloud initialization and auth refresh requests are coalesced and their pending timer is cleared on cleanup.
- Preserved direct rendering for compressed uploaded images and browser-local preview URLs; corrected the narrowly scoped image lint annotations.
- Updated typecheck to generate Next.js route declarations first. The production build regenerated `next-env.d.ts` with production route-type paths.
- Cloud mode with missing connection settings shows setup instructions before creating a Supabase client.

## Verified local results

Environment: Windows PowerShell, Node v26.13.0, npm 11.20.0. The lockfile records exact dependency versions, including Next.js 16.4.5, React 19.3.1, TypeScript 5.9.3 and ESLint 9.39.5.

| Check | Result |
| --- | --- |
| `npm install --no-audit --no-fund` | Passed |
| `npm ls --depth=0` after install | All declared dependencies present, no extraneous packages |
| `npm run typecheck` | Passed |
| `npm run lint -- --max-warnings=0` | Passed, no errors or warnings |
| `npm test` | 17 passed, 0 failed |
| `npm run build` in default Demo mode | Passed; static pages and dynamic routes generated |
| Production Demo browser smoke | Passed in an isolated headless Chrome profile |
| Cloud-mode build with missing Supabase settings | Passed; setup instructions render instead of a crash |
| Missing-config HTTP smoke | Six public/form/item routes returned 200 with the setup notice |
| Invalid/missing Auth callback input | Returned local login error redirects; external `next` URL not used |

The execution sandbox initially blocked test/build worker processes with `spawn EPERM`. The same commands passed when run with the necessary process permissions; those sandbox failures were not application test failures.

Browser checks covered hydration on Home, Browse, My Reports, login/register, lost/found forms, matches, notifications, the Admin access screen, about, account, password recovery/reset, item details and edit routes. With extra sample reports in the disposable browser profile, all seven Browse filters and My Reports search/status correctly returned pagination to page 1. No browser runtime exceptions occurred. This is a smoke check, not a complete registration/report/claim/handover end-to-end suite or a visual accessibility audit.

The missing-config Cloud checks used `NEXT_PUBLIC_DEMO_MODE=false` with empty URL/key values. They verify setup handling only; no connection to a real Supabase project was attempted. The final local production build uses Demo Mode.

## Remaining risks and development order

1. **Phase 1: matching.** Improve normalization, edge-case coverage and confidence calibration. Exclude same-owner candidate pairs. The scoring function already handles opposite types, categories and brand/color contradictions; extend it rather than rebuilding it. The Matches UI currently hides negative reasons and displays a heuristic score as a percentage.
2. **Phase 2: claims and handover.** Cloud completion currently requires an approved claim but permits the owner/Admin to complete it alone. Add separate party confirmations, cancellation/disputes, locking and auditable Admin overrides in a reviewed additive migration. Demo `markReturned` also needs an approved-claim guard for parity with Cloud mode.
3. **Phase 3: private Realtime.** Cloud refresh uses actions, tab focus and 30-second polling. Add authorized subscriptions, unread message state and conversation pagination. The current message query loads only the oldest 500 authorized messages.
4. **Phase 4: Admin moderation.** Extend the existing dashboard with report flags, hide/restore, reasons, filters, analytics and audit coverage. Current report deletion is permanent and cascades to claims/messages. CSV exports ignore filters and need spreadsheet-formula protection; current export fields exclude private contact data.
5. **Phase 5: data access and reliability.** Replace the 500-row snapshots and browser-side filtering with database-side queries/pagination. Fetch the signed-in user's own profile explicitly: deriving it from the first 500 public profiles can make a valid session appear signed out. Review linked-report consistency, concurrent claims and Storage cleanup after partial failures.
6. **Phase 6: usability.** Check mobile layouts, keyboard access, labels/focus, feedback and loading/error states. Demo guest selection currently falls back to the default account after reload; preserve this distinction when improving demo persistence.
7. **Phase 7: security and release.** Run live RLS/RPC, Auth, SMTP, Storage, negative-access and complete multi-user browser tests. Add release operations, backup/restore and deployment verification.

No live Supabase settings were configured for this audit. Cross-user privacy, suspended/unverified accounts, actual email delivery, upload cleanup and concurrent database transitions remain unproven. Passing local checks does not establish production readiness.

Campus maps, advanced student profiles, QR handover and AI image matching remain outside the agreed scope. The Advanced Admin Dashboard remains in scope.

## Manual verification before the next phase

1. From a checkout with Node and npm installed, run `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, then `npm start`. Open `http://localhost:3000`.
2. In Demo Mode, create enough reports for multiple pages. Go to page 2 and change search, category, type, status, sort or date range; verify page 1 is selected. Repeat search/status checks in My Reports.
3. Confirm the lost/found and edit forms still render and that ID Card reports do not offer photo uploads.
4. For real cloud verification, follow `STEP2_SETUP.md` and `SECURITY_TEST_CHECKLIST.md` using separate confirmed students and a trusted Admin in a disposable Supabase project. Review migration effects before applying them.
