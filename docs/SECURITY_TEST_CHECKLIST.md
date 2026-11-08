# Security and multi-user test checklist

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
- [ ] A report cannot be marked Returned until an approved claim exists.
- [ ] User C cannot read/send messages in another claim; messages are blocked for rejected/completed claims.
- [ ] Notification content is visible only to the recipient.
- [ ] A suspended account cannot read private data or perform writes with an existing JWT.
- [ ] Admin can suspend/restore another user but cannot suspend self.
- [ ] Uploads are restricted to the authenticated user's Storage folder and allowed image types.
- [ ] ID Card reports reject public photos in both the UI and database constraint.
- [ ] A new report from User A appears for User B on another device after refresh.
- [ ] Password recovery, email confirmation, expired token and sign-out behavior work.
- [ ] Browse pagination and My Reports filters work with more than one page of sample records.
- [ ] Similar reports show a non-blocking duplicate warning; unrelated reports do not.
- [ ] A production Next.js build and server-side Auth callback smoke test pass.
- [ ] Admin exports and public pages do not expose private contact data.
- [ ] RLS policies are tested using real anon and authenticated publishable-key requests, not the service role.

## Operational work still required

- SMTP setup, email abuse limits and monitoring
- CSP, audit retention, backups and incident response
- Server-side pagination and query-time search for datasets larger than 500 rows
- Supabase Realtime subscriptions instead of 30-second polling
- Automated PostgreSQL RLS integration tests and cross-browser end-to-end tests
- Verify old/replaced Storage object cleanup after failures
- Consider two-party handover acknowledgement before production launch
