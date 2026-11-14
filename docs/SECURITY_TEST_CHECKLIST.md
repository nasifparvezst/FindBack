# Release security and integration checklist

## Local milestone evidence — Phase 7

- [x] Eight targeted configuration/Auth/cache tests: safe modes/keys/origins, fixed redirects, rejected/expired exchanges, recovery destination, fixed feedback, cookie/cache header handling and production/dev CSP differences.
- [x] Four targeted disposable PostgreSQL/RLS tests: campus email and forged Admin metadata; own-folder Storage policies and suspension; public bucket/ID Card/unverified-upload constraints; literal search and direct-write/sender forgery boundaries.
- [x] Chrome Demo E2E: actual HTTP security headers and Auth failure feedback; photo/report creation and inert report text; matching, private claim/chat and guest denial; owner approval, two-party completion, Admin confirmation boundary and closed chat. No captured runtime errors or CSP violations.
- [x] TypeScript and changed-file ESLint checks passed. Explicit Demo environment preflight passed.
- [ ] Manual GitHub Actions workflow executed on the repository.

These checks use local sample data and stand-in Auth/Storage schemas. They do not establish real Supabase, SMTP, Storage HTTP/MIME enforcement, cross-device Realtime or CDN behavior. The user's production environment is not configured; its release preflight remains pending. Full suite/build/lint and comprehensive review are deferred until the explicit FINAL AUDIT request.

## Live Supabase and deployed-domain checks

Run this in a disposable Supabase project with separate confirmed campus accounts (A, B, C) and a separately granted Admin. Mark tests passed only after actual execution.

- [ ] Anonymous visitor can read public report fields but cannot read `report_contacts`, `claims`, `messages` or `profile_emails`.
- [ ] User A cannot directly INSERT/UPDATE/DELETE `reports` through REST; can submit a valid report through the `create_report` RPC.
- [ ] User A cannot edit or delete B's report by calling RPC functions with B's report ID.
- [ ] User A cannot directly modify `admin_members`, `profiles.suspended_at` or `claims.status`.
- [ ] User-editable metadata cannot grant admin access.
- [ ] An unconfirmed campus account cannot create reports or claims.
- [ ] Non-SEU email domains are rejected by Auth database trigger, including email-change requests.
- [ ] User A cannot read User B's private phone number.
- [ ] Claimant A, report owner B and authorized Admin can read a relevant claim; unrelated User C cannot.
- [ ] Only the report owner or Admin can approve/reject a pending claim.
- [ ] Only one active approved claim can exist for a report.
- [ ] An approved claim stays open after the first confirmation; only the other participant can supply the second confirmation and complete both linked reports. Admin cannot impersonate either confirmation.
- [ ] Confirm/cancel/dispute races cannot produce duplicate approved reservations or complete a hidden/disputed report; Admin resolution requires a reason and audit record.
- [ ] User C cannot read/send messages in another claim; messages are blocked for rejected/completed claims.
- [ ] Notification content is visible only to the recipient.
- [ ] A suspended account cannot read private data or perform writes with an existing JWT.
- [ ] Admin can suspend/restore another user but cannot suspend self.
- [ ] Uploads are restricted to the authenticated user's Storage folder and allowed image types.
- [ ] ID Card reports reject public photos in both the UI and database constraint.
- [ ] A new report from User A appears for User B on another device after refresh; authorized chat/claim/notification Realtime delivery, reconnect and unread cursors work on separate devices.
- [ ] Email confirmation, password recovery, expired/reused tokens, failed callbacks and sign-out work on the deployed origin. Fixed redirects use `APP_ORIGIN`; no token appears in app feedback.
- [ ] Browse/My Reports/Admin filters and pagination work beyond 500 records; direct item/claim routes, complete CSV and cancellation work in Cloud mode.
- [ ] Similar reports show a non-blocking duplicate warning; unrelated reports do not.
- [ ] Deployed HTTP headers include CSP/frame protections; Cloud session and Auth responses remain private/no-store through the host/CDN, including Set-Cookie refreshes and two-account requests. Images, Auth and WebSockets work under CSP.
- [ ] Admin exports and public pages do not expose private contact data.
- [ ] RLS policies are tested using real anon and authenticated publishable-key requests, not the service role.

## FINAL AUDIT — run only when explicitly requested

- [ ] Review complete architecture and frontend/backend/API/database/auth integrations; prioritize confirmed security, performance and functional issues.
- [ ] Run the existing full test suite, production build, lint and type checks; fix confirmed issues and retest affected modules.
- [ ] Check responsive layouts and major workflows, then physical iOS/Android and NVDA/VoiceOver where available. Record unavailable coverage honestly.

## Release operations still pending

- [ ] Configure a real Supabase project, apply the six migrations in order, configure Auth templates/redirects and provision Admin through trusted database access.
- [ ] Configure production HTTPS `APP_ORIGIN`, public Supabase URL/key and explicit mode; run `npm run release:check -- --mode cloud` without printing secrets.
- [ ] Configure SMTP, email abuse limits/rate limits and monitoring; test delivery to confirmed campus accounts.
- [ ] Verify Storage MIME/size limits through actual HTTP requests, old/replaced object cleanup and cleanup after failed uploads.
- [ ] Establish backups and test restore, audit retention, incident response and dependency/security maintenance.
- [ ] Deploy the intended branch/commit to a Next.js-compatible host and complete the live checks above. Demo deployment remains browser-local and does not provide shared data.
