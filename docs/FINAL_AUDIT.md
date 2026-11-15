# Final audit and fixes

Reviewed on 15 November 2026 (Asia/Omsk), on `codex/baseline-audit`. This is the local code audit; no live Supabase project, email provider or hosting account was changed.

## Prioritized findings

| Priority | Finding | Resolution and evidence |
| --- | --- | --- |
| High | Cloud photo conversion used `fetch(data:...)`, which the new `connect-src` policy blocks. | Decode compressed JPG/PNG/WebP into a Blob locally without loosening CSP. Exact-byte/size/type tests pass; the actual Cloud components uploaded, displayed and removed a photo against a disposable HTTP/SQL fixture. |
| Medium | Full/blocked browser storage could throw from Demo persistence and crash the interface. | Catch persistence failures, retain the in-memory session and show a save warning. Production Chrome checks cover quota failure and recovery. |
| Medium | Direct message INSERT allowed a caller-supplied timestamp; insertion did not explicitly serialize with claim closure. | New seventh migration locks the claim row, rejects closed states and assigns authenticated messages a server timestamp. Existing sender/participant RLS remains authoritative. SQL regression tests pass; true concurrent PostgreSQL sessions still need live testing. |
| Medium | The second migration deleted Storage metadata directly when removing ID Card photos, which does not delete the stored file bytes. | Refuse migration while those objects remain; remove files through Storage API/Dashboard first, then clear report references. A SQL test verifies rejection preserves references and retry succeeds after cleanup. [Supabase deletion guidance](https://supabase.com/docs/guides/storage/management/delete-objects). |
| Moderate, development tooling | npm flagged seven transitive lint packages through one minimatch advisory. | Refresh compatible TypeScript ESLint tooling and scope a `minimatch ^11.0.1` override to `@typescript-eslint/typescript-estree`. The final npm audit reports zero advisories. [Maintainer advisory](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249). |

All confirmed local defects listed above have code fixes. Apply only pending migrations; the seventh migration has not been applied to a live project. Do not rerun an already-applied second migration.

## Review and verification

Reviewed the App Router/provider architecture, mode selection, Auth routes/recovery, report and Storage flows, paging/decoding/cancellation, matching, claims and handover, chat, notifications, Admin moderation/exports, SQL grants/RLS/functions, configuration and release workflow. Database authorization remains in SQL; browser state does not grant Cloud permissions. Reads are bounded server pages; exact counts/search and aggregate performance still require production load measurements.

| Check | Result |
| --- | --- |
| Existing complete `npm test` suite | 132 passed before fixes, no failures or skips. |
| Affected SQL/photo modules after fixes | 39 passed, including four new regression tests. Unaffected tests were not repeated. |
| Type checking | `npm run typecheck` passed; both final Demo and isolated Cloud production builds also passed TypeScript. |
| Lint | Full lint passed initially; the tooling update and changed source/tests were checked again after fixes. |
| Demo production build | Passed; static pages and dynamic item/claim/Auth routes generated. |
| Isolated Cloud production build | Passed with synthetic HTTPS/public configuration; no real credentials or project access used. |
| Production Chrome Demo workflow | Passed: photo/report, matching, private claim/chat, guest denial, two-party handover, Admin boundary, closed chat, registration, 320px layouts, keyboard focus and storage failure/recovery. No captured runtime errors or CSP violations. |
| Actual Cloud components with local HTTP/PGlite stand-ins | Verified registration feedback, password sign-in, JPEG upload/render/removal, private contact edit, linked claims/chat, approval, two confirmations, closed chat, sign-out and private-room denial. |
| Cloud production HTTP checks | Seven pages/Auth responses passed private/no-store checks; Auth failure redirects used the configured canonical HTTPS origin and rejected an external destination. |
| Dependency advisories | Final `npm audit`: zero known advisories at check time, including development dependencies. |

Raw local logs/results are ignored under `.test-build/`. The repeatable Demo checks are committed in `tests/e2e/demo-flow.cjs`; the Cloud HTTP harness was temporary. Auth/Storage stand-ins validate integration contracts, not Supabase's managed services. The single PGlite connection cannot prove transaction races. The production browser run used 1440px and 320px Chromium emulation, not physical devices or a screen reader.

## Remaining release work

1. **High — Cloud setup and live verification:** configure Supabase, apply all seven migrations in order, provision a trusted Admin, set production `APP_ORIGIN`/URL/public key/mode, and verify real signup/confirmation/recovery, RLS, uploads and separate-user Realtime behavior.
2. **High — Deployment verification:** deploy the intended branch/commit and repeat the live checks through the real domain/CDN. No public deployment exists yet.
3. **Medium — Operations and broader coverage:** configure SMTP and abuse/rate limits, monitoring, backups/restore and audit retention; verify actual Storage HTTP/MIME enforcement, concurrent transitions, physical iOS/Android and NVDA/VoiceOver. The manual GitHub Actions workflow has not been run on GitHub.

Track those checks in [SECURITY_TEST_CHECKLIST.md](SECURITY_TEST_CHECKLIST.md). Local audit completion does not establish production readiness.
