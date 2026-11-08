-- FindBack 2.0 Step 3: report workflow hardening.
-- Run AFTER 202611050001_initial.sql in the same Supabase project.

begin;

-- Public item photos must never expose student ID cards or other identity documents.
-- Remove any previously stored ID-card photos before enforcing the rule.
delete from storage.objects as objects
using public.reports as reports
where objects.bucket_id = 'report-images'
  and reports.category = 'ID Card'
  and reports.image_path is not null
  and objects.name = reports.image_path;

update public.reports
set image_path = null, updated_at = now()
where category = 'ID Card' and image_path is not null;

alter table public.reports
  drop constraint if exists reports_id_card_photo_private;

alter table public.reports
  add constraint reports_id_card_photo_private
  check (category <> 'ID Card' or image_path is null);

-- Supports the newest-first campus browse view and status/type filtering.
create index if not exists idx_reports_type_status_created
  on public.reports(type, status, created_at desc);

commit;
