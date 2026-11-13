# FindBack 2.0 database design

The current database is Supabase PostgreSQL. The schema is created by the initial migration and hardened by the Step 3 privacy migration.

## Tables

| Table | Purpose | Access model |
|---|---|---|
| `auth.users` | Supabase-managed login identity and email verification | Supabase Auth |
| `profiles` | Public member display name and account state | Public profile fields only |
| `profile_emails` | Private verified email address | Owner and admin |
| `admin_members` | Privileged admin membership | Admin membership checks; provisioned by trusted SQL operator |
| `reports` | Public lost/found item details | Public read; controlled RPC writes |
| `report_contacts` | Report owner's phone number | Owner/admin only; not shown publicly |
| `claims` | Ownership claim and review state | Claimant, report owner and admin |
| `messages` | Private claim conversation | Claim participants and admin |
| `notifications` | Per-user notification feed | Recipient only |
| `moderation_actions` | Admin moderation audit entries | Admin only |

## Main report fields

`reports` stores `owner_id`, `type`, `title`, `category`, `brand`, `color`, `location`, `occurred_on`, `description`, `image_path`, `status`, `linked_report_id` and timestamps. Current report status values are `open` and `returned`.

Phase 2 adds claim statuses `cancelled` and `disputed`, party confirmation/review/completion timestamps, issue/resolution reasons and Admin audit reasons. `confirm_handover(claim_id)` derives the caller from `auth.uid()` and completes only after both participants confirm. `manage_claim` handles cancel/dispute and reason-required Admin resolution. Report locks use UUID order before claim locks; approved/disputed claims reserve both target and related reports. `complete_handover(report_id)` is disabled. Existing RLS remains enabled; disputed conversations remain private and writable only by authorized participants/Admin.

`report_contacts` is intentionally separate from public report data. The application does not expose phone numbers on public report pages; communication is handled through private claims and messages.

## Security model

- Row Level Security is enabled on all application tables.
- Browser users cannot directly write report ownership, claim status, user roles or suspension state.
- PostgreSQL RPC functions validate report creation/edit/delete, claim submission/review and handover completion.
- `admin_members` is the authority for admin permissions. User-editable metadata cannot grant admin rights.
- `is_active_member()` requires a confirmed `@seu.edu.bd` account and a non-suspended profile.
- Private claims, messages, contact numbers and notifications are limited by participant/recipient policies.
- Report photos use a public bucket because normal item photos are shared. Do not upload identity documents or sensitive personal content.
- Step 3 adds a database constraint that blocks photos for the `ID Card` category and removes any pre-existing public ID-card photos from Storage.

## Migrations

Run in filename order in the same Supabase project:

1. `202611050001_initial.sql` -- tables, indexes, RLS, RPC functions, triggers and Storage bucket.
2. `202611060001_report_management_privacy.sql` -- ID-card photo privacy constraint and browse index.
3. `202611120001_two_party_handover.sql` -- two-party handover, cancel/dispute workflow, reservation guards and Admin resolution audit.
4. `202611130001_private_chat_realtime.sql` -- message cursor indexes, message-linked notifications, authorized chat history/send/read RPCs, exact unread totals and Realtime publication.

Do not rerun the initial migration on a populated project. Apply later migrations once, after reviewing their effects.

## Current application data flow

```text
Next.js App Router
  -> DemoProvider (browser-local demo only)
  -> CloudProvider (Supabase browser client)
      -> Supabase Auth
      -> PostgreSQL tables + RLS
      -> validated PostgreSQL RPC functions
      -> Storage: report-images
```

Cloud data refreshes after actions, tab focus, reconnect and a 30-second fallback interval. Realtime subscriptions invalidate authorized claim/notification reads, with claim-scoped message subscriptions only while the conversation is open. No DELETE subscriptions are used. Channels and queued callbacks are cleaned up on account/conversation changes and unmount.

Chat history is read separately through `get_claim_messages`, a SECURITY INVOKER RPC under existing participant/Admin RLS, using `(created_at,id)` cursors and a 51st lookahead row for 50-message pages. Reconnect catch-up reads forward until no page remains. `send_claim_message` preserves the same delivery UUID on retries. `notifications.message_id` is nullable for compatibility with old notices. `mark_claim_messages_read` only marks the caller's message alerts through an authorized displayed message cursor, and `get_notification_summary` counts only RLS-visible notifications.

The remaining report/claim/notification snapshots are capped at 500 rows; broader query filtering/pagination remains future scale work. Unread counts are aggregated across all notifications, independently of the snapshot cap. No live Realtime delivery or concurrent-connection test has been performed locally.
