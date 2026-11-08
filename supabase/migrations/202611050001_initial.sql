-- FindBack 2.0 Step 2: Supabase database, authorization and transitions.
-- Run in a NEW Supabase project. Never execute with an unreviewed service key.
-- All user-facing mutations require authenticated, active campus membership.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 100),
  created_at timestamptz not null default now(),
  suspended_at timestamptz
);

create table if not exists public.profile_emails (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email text not null unique
);

create table if not exists public.admin_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('lost', 'found')),
  title text not null check (char_length(btrim(title)) between 2 and 120),
  category text not null check (category in ('Phone','Wallet','ID Card','Bag','Keys','Electronics','Book','Other')),
  brand text not null default '' check (char_length(brand) <= 80),
  color text not null default '' check (char_length(color) <= 60),
  location text not null check (char_length(btrim(location)) between 2 and 150),
  occurred_on date not null,
  description text not null check (char_length(btrim(description)) between 10 and 2000),
  image_path text,
  status text not null default 'open' check (status in ('open','returned')),
  linked_report_id uuid references public.reports(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (linked_report_id is null or linked_report_id <> id)
);

create table if not exists public.report_contacts (
  report_id uuid primary key references public.reports(id) on delete cascade,
  phone text not null check (char_length(phone) <= 24)
);

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  related_report_id uuid references public.reports(id) on delete set null,
  claimant_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 12 and 2000),
  status text not null default 'pending' check (status in ('pending','approved','rejected','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_one_approved_claim_per_report
  on public.claims(report_id) where status = 'approved';
create unique index if not exists uq_active_claim_per_person
  on public.claims(report_id, claimant_id) where status in ('pending','approved');

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  href text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  subject text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_reports_owner on public.reports(owner_id);
create index if not exists idx_reports_category_status on public.reports(category,status);
create index if not exists idx_reports_created on public.reports(created_at desc);
create index if not exists idx_claims_report on public.claims(report_id);
create index if not exists idx_claims_claimant on public.claims(claimant_id);
create index if not exists idx_messages_claim_created on public.messages(claim_id,created_at);
create index if not exists idx_notices_recipient on public.notifications(user_id,created_at desc);
create index if not exists idx_actions_created on public.moderation_actions(created_at desc);

-- Never trust a role submitted by the browser or user-editable metadata.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(select 1 from public.admin_members a where a.user_id = (select auth.uid()));
$$;

create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(
    select 1 from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = (select auth.uid())
      and p.suspended_at is null
      and u.email_confirmed_at is not null
      and lower(u.email) ~ '^[a-z0-9._%+-]+@seu[.]edu[.]bd$'
  );
$$;

-- Domain is enforced both at sign-up and during an email change.
create or replace function public.enforce_campus_email()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is null or lower(new.email) !~ '^[a-z0-9._%+-]+@seu[.]edu[.]bd$' then
    raise exception 'Only a valid @seu.edu.bd email address is permitted';
  end if;
  return new;
end;
$$;

drop trigger if exists findback_campus_email on auth.users;
create trigger findback_campus_email
  before insert or update of email on auth.users
  for each row execute function public.enforce_campus_email();

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_name text;
begin
  v_name := left(btrim(coalesce(new.raw_user_meta_data->>'full_name','')),100);
  if char_length(v_name) < 2 then
    v_name := left(split_part(new.email,'@',1),100);
  end if;
  insert into public.profiles(id, display_name)
    values (new.id, v_name) on conflict (id) do nothing;
  insert into public.profile_emails(user_id,email)
    values (new.id,lower(new.email))
    on conflict (user_id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists findback_new_user on auth.users;
create trigger findback_new_user
  after insert or update of email on auth.users
  for each row execute function public.handle_new_auth_user();

-- Supabase Auth has its own email confirmation flow; enable confirmation
-- in Auth > Providers > Email. Do NOT turn it off.

-- Explicit grants, then row-level policies. No user table has direct write access
-- except messages, which has strict participant checks.
alter table public.profiles enable row level security;
alter table public.profile_emails enable row level security;
alter table public.admin_members enable row level security;
alter table public.reports enable row level security;
alter table public.report_contacts enable row level security;
alter table public.claims enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.moderation_actions enable row level security;

revoke all on public.profiles, public.profile_emails, public.admin_members,
  public.reports, public.report_contacts, public.claims, public.messages,
  public.notifications, public.moderation_actions from anon, authenticated;

grant select(id,display_name,created_at) on public.profiles to anon;
grant select on public.profiles to authenticated;
grant select on public.profile_emails, public.admin_members to authenticated;
grant select on public.reports to anon, authenticated;
grant select on public.report_contacts, public.claims, public.messages,
  public.notifications to authenticated;
grant insert on public.messages to authenticated;
grant select on public.moderation_actions to authenticated;

create policy profiles_public_view on public.profiles
  for select to anon, authenticated using (true);
create policy email_owner_or_admin on public.profile_emails
  for select to authenticated using ((select public.is_active_member()) and (user_id = (select auth.uid()) or (select public.is_admin())));
create policy admin_members_read on public.admin_members
  for select to authenticated using ((select public.is_active_member()) and (user_id = (select auth.uid()) or (select public.is_admin())));
create policy reports_public_read on public.reports
  for select to anon, authenticated using (true);
create policy contacts_owner_or_admin on public.report_contacts
  for select to authenticated using (
    (select public.is_active_member()) and ((select public.is_admin()) or exists (
      select 1 from public.reports r where r.id = report_id and r.owner_id = (select auth.uid())
    ))
  );
create policy claims_participants_read on public.claims
  for select to authenticated using (
    (select public.is_active_member()) and ((select public.is_admin()) or claimant_id = (select auth.uid()) or exists (
      select 1 from public.reports r where r.id = report_id and r.owner_id = (select auth.uid())
    ))
  );
create policy message_participants_read on public.messages
  for select to authenticated using (
    (select public.is_active_member()) and ((select public.is_admin()) or exists (
      select 1 from public.claims c
      join public.reports r on r.id = c.report_id
      where c.id = claim_id and (c.claimant_id = (select auth.uid()) or r.owner_id = (select auth.uid()))
    ))
  );
create policy message_participants_write on public.messages
  for insert to authenticated with check (
    sender_id = (select auth.uid()) and (select public.is_active_member()) and
    exists (
      select 1 from public.claims c
      join public.reports r on r.id = c.report_id
      where c.id = claim_id
        and c.status in ('pending','approved')
        and (c.claimant_id = (select auth.uid()) or r.owner_id = (select auth.uid()))
    )
  );
create policy notifications_owner_read on public.notifications
  for select to authenticated using ((select public.is_active_member()) and user_id = (select auth.uid()));
create policy moderation_admin_read on public.moderation_actions
  for select to authenticated using ((select public.is_active_member()) and (select public.is_admin()));

-- SECURITY DEFINER API: fixed fields prevent role/status/owner tampering.
create or replace function public.create_report(
 p_type text, p_title text, p_category text, p_brand text, p_color text,
 p_location text, p_occurred_on date, p_description text, p_contact_phone text,
 p_image_path text default null
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_phone text;
begin
  if not public.is_active_member() then raise exception 'Verified active account required'; end if;
  v_phone := regexp_replace(p_contact_phone,'[[:space:]-]','','g');
  if v_phone !~ '^((\+?8801)|01)[3-9][0-9]{8}$' then raise exception 'Invalid Bangladesh phone number'; end if;
  if p_occurred_on > (now() at time zone 'Asia/Dhaka')::date then raise exception 'Date cannot be in the future'; end if;
  if p_image_path is not null and split_part(p_image_path,'/',1) <> auth.uid()::text then
    raise exception 'Image must be uploaded to your own folder';
  end if;
  insert into public.reports(owner_id,type,title,category,brand,color,location,occurred_on,description,image_path)
    values (auth.uid(),p_type,btrim(p_title),p_category,coalesce(p_brand,''),coalesce(p_color,''),
      btrim(p_location),p_occurred_on,btrim(p_description),p_image_path) returning id into v_id;
  insert into public.report_contacts(report_id,phone) values(v_id,v_phone);
  return v_id;
end;
$$;

create or replace function public.edit_report(
 p_id uuid, p_type text, p_title text, p_category text, p_brand text,
 p_color text, p_location text, p_occurred_on date, p_description text,
 p_contact_phone text, p_image_path text default null
) returns void language plpgsql security definer set search_path = ''
as $$
declare v_report public.reports%rowtype; v_phone text;
begin
  if not public.is_active_member() then raise exception 'Verified active account required'; end if;
  select * into v_report from public.reports where id = p_id for update;
  if not found then raise exception 'Report not found'; end if;
  if v_report.owner_id <> auth.uid() and not public.is_admin() then raise exception 'Not authorized'; end if;
  if v_report.status <> 'open' then raise exception 'Returned report cannot be edited'; end if;
  v_phone := regexp_replace(p_contact_phone,'[[:space:]-]','','g');
  if v_phone !~ '^((\+?8801)|01)[3-9][0-9]{8}$' then raise exception 'Invalid Bangladesh phone number'; end if;
  if p_occurred_on > (now() at time zone 'Asia/Dhaka')::date then raise exception 'Date cannot be in the future'; end if;
  if p_image_path is not null and p_image_path <> coalesce(v_report.image_path,'')
    and split_part(p_image_path,'/',1) <> auth.uid()::text then
    raise exception 'New image must be uploaded to your own folder';
  end if;
  update public.reports set type=p_type,title=btrim(p_title),category=p_category,brand=coalesce(p_brand,''),
    color=coalesce(p_color,''),location=btrim(p_location),occurred_on=p_occurred_on,
    description=btrim(p_description),image_path=p_image_path,updated_at=now() where id=p_id;
  update public.report_contacts set phone=v_phone where report_id=p_id;
end;
$$;

create or replace function public.delete_report(p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_owner uuid; v_title text;
begin
  if not public.is_active_member() then raise exception 'Verified active account required'; end if;
  select owner_id,title into v_owner,v_title from public.reports where id=p_id for update;
  if not found then raise exception 'Report not found'; end if;
  if v_owner <> auth.uid() and not public.is_admin() then raise exception 'Not authorized'; end if;
  delete from public.reports where id=p_id;
  if public.is_admin() and v_owner <> auth.uid() then
    insert into public.moderation_actions(admin_id,action,subject) values(auth.uid(),'Report deleted',v_title);
  end if;
end;
$$;

create or replace function public.submit_claim(
  p_report_id uuid, p_message text, p_related_report_id uuid default null
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_report public.reports%rowtype; v_related public.reports%rowtype; v_id uuid;
begin
  if not public.is_active_member() then raise exception 'Verified active account required'; end if;
  select * into v_report from public.reports where id=p_report_id for update;
  if not found or v_report.status <> 'open' then raise exception 'Report unavailable'; end if;
  if v_report.owner_id = auth.uid() then raise exception 'Cannot claim your own report'; end if;
  if char_length(btrim(p_message)) not between 12 and 2000 then raise exception 'Claim explanation must be 12 to 2000 characters'; end if;
  if p_related_report_id is not null then
    select * into v_related from public.reports where id=p_related_report_id;
    if not found or v_related.owner_id <> auth.uid() or v_related.status <> 'open'
      or v_related.type = v_report.type then raise exception 'Invalid related report'; end if;
  end if;
  if exists(select 1 from public.claims where report_id=p_report_id and claimant_id=auth.uid()
      and status in ('pending','approved')) then raise exception 'You already have an active claim'; end if;
  insert into public.claims(report_id,related_report_id,claimant_id,message)
    values(p_report_id,p_related_report_id,auth.uid(),btrim(p_message)) returning id into v_id;
  insert into public.notifications(user_id,title,body,href)
    values(v_report.owner_id,'New claim request','Someone submitted a claim for ' || v_report.title, '/claims/' || v_id::text);
  return v_id;
end;
$$;

create or replace function public.review_claim(p_claim_id uuid,p_decision text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_claim public.claims%rowtype; v_report public.reports%rowtype;
begin
  if not public.is_active_member() then raise exception 'Verified active account required'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  select * into v_claim from public.claims where id=p_claim_id for update;
  if not found or v_claim.status <> 'pending' then raise exception 'Only pending claims can be reviewed'; end if;
  select * into v_report from public.reports where id=v_claim.report_id for update;
  if v_report.owner_id <> auth.uid() and not public.is_admin() then raise exception 'Not authorized'; end if;
  if p_decision='approved' and (v_report.status <> 'open' or exists(
    select 1 from public.claims where report_id=v_report.id and status='approved' and id<>p_claim_id))
    then raise exception 'Report already has a completed or approved claim'; end if;
  if p_decision='approved' and v_claim.related_report_id is not null and not exists(
    select 1 from public.reports where id=v_claim.related_report_id and owner_id=v_claim.claimant_id and status='open')
    then raise exception 'Related report is no longer available'; end if;
  update public.claims set status=p_decision,updated_at=now() where id=p_claim_id;
  insert into public.notifications(user_id,title,body,href)
    values(v_claim.claimant_id,'Claim ' || p_decision,'Your claim for ' || v_report.title || ' was ' || p_decision,
      '/claims/' || p_claim_id::text);
  if public.is_admin() and v_report.owner_id <> auth.uid() then
    insert into public.moderation_actions(admin_id,action,subject)
      values(auth.uid(),'Claim ' || p_decision, v_report.title);
  end if;
end;
$$;

create or replace function public.complete_handover(p_report_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_report public.reports%rowtype; v_claim public.claims%rowtype;
begin
  if not public.is_active_member() then raise exception 'Verified active account required'; end if;
  select * into v_report from public.reports where id=p_report_id for update;
  if not found or v_report.status <> 'open' then raise exception 'Report is not open'; end if;
  if v_report.owner_id <> auth.uid() and not public.is_admin() then raise exception 'Not authorized'; end if;
  select * into v_claim from public.claims where report_id=p_report_id and status='approved'
    order by created_at limit 1 for update;
  if not found then raise exception 'An approved claim is required to finish a return'; end if;
  if v_claim.related_report_id is not null then
    perform 1 from public.reports where id=v_claim.related_report_id and status='open'
      and owner_id=v_claim.claimant_id for update;
    if not found then raise exception 'Related report is unavailable'; end if;
  end if;
  update public.reports set status='returned',linked_report_id=v_claim.related_report_id,updated_at=now()
    where id=p_report_id;
  if v_claim.related_report_id is not null then
    update public.reports set status='returned',linked_report_id=p_report_id,updated_at=now()
      where id=v_claim.related_report_id;
  end if;
  update public.claims set status='completed',updated_at=now() where id=v_claim.id;
  insert into public.notifications(user_id,title,body,href)
    values(v_claim.claimant_id,'Item returned','The handover for ' || v_report.title || ' was completed',
      '/claims/' || v_claim.id::text);
end;
$$;

create or replace function public.on_new_message()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_owner uuid; v_claimant uuid; v_report text; v_other uuid;
begin
  select r.owner_id,c.claimant_id,r.title into v_owner,v_claimant,v_report
    from public.claims c join public.reports r on r.id=c.report_id where c.id=new.claim_id;
  v_other := case when new.sender_id=v_owner then v_claimant else v_owner end;
  insert into public.notifications(user_id,title,body,href)
    values(v_other,'New private message','You have a message about ' || v_report,'/claims/' || new.claim_id::text);
  return new;
end;
$$;

drop trigger if exists findback_new_message on public.messages;
create trigger findback_new_message after insert on public.messages
  for each row execute function public.on_new_message();

create or replace function public.mark_notification_read(p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_active_member() then raise exception 'Account unavailable'; end if;
  update public.notifications set read_at=now() where id=p_id and user_id=auth.uid() and read_at is null;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_active_member() then raise exception 'Account unavailable'; end if;
  update public.notifications set read_at=now() where user_id=auth.uid() and read_at is null;
end;
$$;

create or replace function public.set_member_suspended(p_user_id uuid,p_suspended boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_name text;
begin
  if not public.is_active_member() or not public.is_admin() then raise exception 'Admin required'; end if;
  if p_user_id=auth.uid() then raise exception 'Cannot suspend yourself'; end if;
  select display_name into v_name from public.profiles where id=p_user_id for update;
  if not found then raise exception 'User not found'; end if;
  update public.profiles set suspended_at=case when p_suspended then now() else null end where id=p_user_id;
  insert into public.moderation_actions(admin_id,action,subject)
    values(auth.uid(),case when p_suspended then 'User suspended' else 'User restored' end,v_name);
end;
$$;

-- Security-definer functions are callable only by explicitly granted roles.
revoke execute on function public.is_admin(), public.is_active_member(),
 public.enforce_campus_email(), public.handle_new_auth_user(),
 public.create_report(text,text,text,text,text,text,date,text,text,text),
 public.edit_report(uuid,text,text,text,text,text,text,date,text,text,text),
 public.delete_report(uuid), public.submit_claim(uuid,text,uuid),
 public.review_claim(uuid,text), public.complete_handover(uuid),
 public.on_new_message(), public.mark_notification_read(uuid),
 public.mark_all_notifications_read(), public.set_member_suspended(uuid,boolean)
 from public, anon, authenticated;

grant execute on function public.is_admin(), public.is_active_member(),
 public.create_report(text,text,text,text,text,text,date,text,text,text),
 public.edit_report(uuid,text,text,text,text,text,text,date,text,text,text),
 public.delete_report(uuid), public.submit_claim(uuid,text,uuid),
 public.review_claim(uuid,text), public.complete_handover(uuid),
 public.mark_notification_read(uuid), public.mark_all_notifications_read(),
 public.set_member_suspended(uuid,boolean) to authenticated;

-- Item photos are intentionally PUBLIC (not ID documents). Remove EXIF via canvas
-- before upload, and never upload identity documents or sensitive private images.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('report-images','report-images',true,2097152,array['image/jpeg','image/png','image/webp'])
  on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

create policy findback_photo_upload on storage.objects
  for insert to authenticated with check (
    bucket_id='report-images' and (storage.foldername(name))[1]=(select auth.uid())::text
    and (select public.is_active_member())
    and lower(storage.extension(name)) in ('jpg','jpeg','png','webp')
  );
create policy findback_photo_owner_read on storage.objects
  for select to authenticated using (
    bucket_id='report-images' and (select public.is_active_member()) and (
      (storage.foldername(name))[1]=(select auth.uid())::text or (select public.is_admin())
    )
  );
create policy findback_photo_owner_delete on storage.objects
  for delete to authenticated using (
    bucket_id='report-images' and (select public.is_active_member()) and (
      (storage.foldername(name))[1]=(select auth.uid())::text or (select public.is_admin())
    )
  );
