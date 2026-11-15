-- FindBack 2.0 Step 3: report workflow hardening.
-- Run AFTER 202611050001_initial.sql in the same Supabase project.

begin;

-- Public item photos must never expose student ID cards or other identity documents.
-- Remove existing files through Storage API/Dashboard first. SQL metadata deletion
-- does not delete the stored bytes and can leave orphaned private documents.
do $$ begin
  if exists (
    select 1 from storage.objects objects join public.reports reports on objects.name=reports.image_path
    where objects.bucket_id='report-images' and reports.category='ID Card'
  ) then raise exception 'Remove ID Card photos through Storage API or Dashboard before applying this migration'; end if;
end $$;

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
