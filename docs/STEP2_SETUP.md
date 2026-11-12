# Supabase setup (Windows, beginner friendly)

You do not need to install PostgreSQL locally. Supabase hosts the database in the cloud.

## 1. Prepare the project

1. Install Node.js 22 or later (required by the locked Supabase client).
2. Extract the FindBack ZIP and open the folder containing `package.json` in VS Code.
3. Copy `.env.example` to `.env.local` in the project root.
4. Keep `NEXT_PUBLIC_DEMO_MODE=true` until the Supabase setup is complete.
5. Open **Terminal > New Terminal** and run `npm install`.

## 2. Create a Supabase project

1. Open https://supabase.com/dashboard and sign in.
2. Choose **New project** and create a project such as `findback-campus`.
3. Use a strong database password and choose a suitable region.
4. Wait for the project to finish provisioning.

## 3. Run database migrations in order

Open **SQL Editor > New query**. Open each SQL file from the project and run its complete contents, in this order:

1. `supabase/migrations/202611050001_initial.sql`
2. `supabase/migrations/202611060001_report_management_privacy.sql`
3. `supabase/migrations/202611120001_two_party_handover.sql`

Run only migrations not yet applied. The first creates the schema/security and Storage bucket; the second blocks public ID-card photos. The third adds two-party handover, cancel/dispute states and audited Admin resolution, preserves existing data and disables the legacy completion endpoint. Review the third migration before running it: pre-existing overlapping approved claims must be resolved first; existing approved claims will need both parties' new confirmations. No live migration has been applied by this development task.

In **Database > Tables**, confirm these tables exist: `profiles`, `profile_emails`, `admin_members`, `reports`, `report_contacts`, `claims`, `messages`, `notifications`, and `moderation_actions`.

## 4. Enable email confirmation

1. Open **Authentication > Providers > Email** and ensure **Confirm email** is ON.
2. Open **Authentication > URL Configuration**.
3. For local development, set Site URL to `http://localhost:3000`.
4. Add these redirect URLs:
   - `http://localhost:3000/auth/confirm`
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3000/reset-password`
5. In **Authentication > Email Templates > Confirm signup**, use this confirmation link:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm your FindBack account</a>
```

6. In **Email Templates > Reset password**, use:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Reset your FindBack password</a>
```

Supabase's default email service has sending limits. Configure an approved SMTP provider before inviting many students.

## 5. Connect the Next.js app

1. In Supabase, open **Project Settings / API** or **Connect** (labels may vary).
2. Copy the Project URL and the **publishable key**.
3. Put them in the local `.env.local` file:

```env
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR-PUBLISHABLE-KEY
```

4. Save the file and restart the Next.js server:

```sh
npm run dev
```

5. Open `http://localhost:3000/register` and register with a real `@seu.edu.bd` email address.
6. Confirm the email, then sign in.

Never use a service-role/secret key in a `NEXT_PUBLIC_*` variable or frontend code. Never share `.env.local`.

## 6. Grant an administrator

The first registered student does not become an admin automatically. After confirming the trusted admin account, an authorized database owner can run this in SQL Editor (replace the email):

```sql
insert into public.admin_members(user_id)
select id from auth.users
where lower(email) = lower('TRUSTED-ADMIN@seu.edu.bd')
  and email_confirmed_at is not null
on conflict (user_id) do nothing;
```

Sign out and back in. Do not put this query or a service-role key in browser code.

## 7. Two-user verification

1. User A creates a Lost report.
2. User B opens Browse from a separate browser/device and confirms it is visible.
3. User B creates a Found report; User A checks Smart Matches.
4. User A submits a claim; User B reviews it from My Reports.
5. Approve the claim, exchange private messages, and verify an unrelated account cannot read them.
6. Confirm handover separately as User A and User B after the physical exchange. Verify that one confirmation leaves reports Open and that two complete the linked reports. Verify an unrelated user or Admin cannot confirm on behalf of a participant. Test cancel before confirmation, dispute after one confirmation, and Admin resume/cancel with a required audit reason.
7. Test admin access, suspended users, email confirmation and password recovery.

## Notes

- The `report-images` bucket is public because ordinary item photos are shared. ID Card photos are blocked by the app and database constraint. Do not upload student cards, national IDs, QR codes, passwords or private documents in any category.
- The app currently refreshes cloud data on actions, tab focus and a 30-second polling interval; it is not yet using Supabase Realtime subscriptions.
- Live SQL authorization, email delivery, production build and multi-device browser tests must be completed before deployment.
