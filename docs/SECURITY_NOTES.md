# FindBack 2.0 security notes

**Release status:** The application code and SQL have been prepared and statically reviewed. The SQL has not been live-tested against the user's Supabase project. Do not treat static checks as proof of production security.

- Demo mode uses browser-local sample data. It is for testing only and is not secure or multi-user.
- Cloud mode uses `.env.local`; the browser app needs only the Supabase Project URL and publishable key. Never use or share a service-role/secret key in frontend code or a `NEXT_PUBLIC_*` variable.
- The database enforces the `@seu.edu.bd` domain during Auth user creation and email updates. Keep email confirmation enabled.
- Admin roles come from `admin_members`, not browser state or editable profile metadata. Provision admins only through trusted database-owner access.
- Reports and ordinary item photos are public. Contact phone numbers, claims, messages and notifications are protected by RLS.
- Report and claim state changes use PostgreSQL functions that validate the authenticated user, ownership and allowed transition.
- Suspended accounts are blocked from private reads, storage operations and application writes by `is_active_member()` checks.
- The `report-images` bucket is public. The UI and Step 3 database constraint block photos for the `ID Card` category. Never upload student cards, national IDs, QR codes, passwords, financial information or private documents under any category.
- The report form compresses accepted JPG/PNG/WebP images in the browser before upload. Public image content remains public after compression.
- Replaced or cleared report images are removed from Storage after the database update. Storage cleanup is best-effort; verify Storage after testing.
- Data reads are currently capped at 500 rows and refreshed on actions, tab focus and a 30-second interval. This is not a Realtime subscription or scalable pagination system.
- University domain validation is specific to SEU. Update both SQL and TypeScript validation before adapting the project for another institution.

Before deployment, complete `docs/SECURITY_TEST_CHECKLIST.md`, real email delivery tests, two-user browser tests, production build and backup/restore checks.
