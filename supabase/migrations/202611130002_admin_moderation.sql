begin;
alter table public.reports add column hidden boolean not null default false;
alter table public.reports add column moderated_at timestamptz;
create table public.report_flags (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check(char_length(btrim(reason)) between 10 and 1000),
  status text not null default 'open' check(status in ('open','dismissed','actioned')),
  created_at timestamptz not null default now(), resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null, resolution_reason text,
  check(status='open' or (resolved_at is not null and char_length(btrim(resolution_reason)) between 10 and 1000))
);
create unique index uq_open_report_flag on public.report_flags(report_id,reporter_id) where status='open';
create index idx_flags_status_created on public.report_flags(status,created_at desc);
alter table public.report_flags enable row level security;
revoke all on public.report_flags from public,anon,authenticated;
grant select on public.report_flags to authenticated;
create policy flags_reporter_admin_read on public.report_flags for select to authenticated using (
  (select public.is_active_member()) and (reporter_id=(select auth.uid()) or (select public.is_admin()))
);

-- Avoid report/claim RLS recursion. Anonymous callers get false; only existing participants can see hidden reports.
create function public.can_read_hidden_report(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and public.is_active_member() and (
    public.is_admin() or exists(select 1 from public.reports where id=p_id and owner_id=auth.uid()) or exists(
      select 1 from public.claims c join public.reports r on r.id=c.report_id
      where p_id in (c.report_id,c.related_report_id) and auth.uid() in (c.claimant_id,r.owner_id)
    )
  );
$$;
revoke all on function public.can_read_hidden_report(uuid) from public;
grant execute on function public.can_read_hidden_report(uuid) to anon,authenticated;
drop policy reports_public_read on public.reports;
create policy reports_public_read on public.reports for select to anon,authenticated using (not hidden or public.can_read_hidden_report(id));

create function public.flag_report(p_report_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare r public.reports%rowtype;
begin
  if not public.is_active_member() then raise exception 'Verified active account required'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 10 and 1000 then raise exception 'Reason must be 10 to 1000 characters'; end if;
  select * into r from public.reports where id=p_report_id for update;
  if not found or r.hidden then raise exception 'Report unavailable'; end if;
  if r.owner_id=auth.uid() then raise exception 'Cannot flag your own report'; end if;
  if exists(select 1 from public.report_flags where report_id=p_report_id and reporter_id=auth.uid() and status='open') then raise exception 'You already have an open flag'; end if;
  insert into public.report_flags(report_id,reporter_id,reason) values(p_report_id,auth.uid(),btrim(p_reason));
  insert into public.notifications(user_id,title,body,href)
    select user_id,'Report flagged','A report needs moderation review.','/admin' from public.admin_members;
end;
$$;

create function public.moderate_report(p_report_id uuid,p_hidden boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare r public.reports%rowtype; label text;
begin
  if not public.is_active_member() or not public.is_admin() then raise exception 'Admin required'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 10 and 1000 or p_hidden is null then raise exception 'Reason must be 10 to 1000 characters'; end if;
  select * into r from public.reports where id=p_report_id for update;
  if not found then raise exception 'Report not found'; end if;
  if r.hidden=p_hidden then return; end if;
  label:=case when p_hidden then 'Report hidden' else 'Report restored' end;
  update public.reports set hidden=p_hidden,moderated_at=now(),updated_at=now() where id=p_report_id;
  if p_hidden then
    insert into public.notifications(user_id,title,body,href) select reporter_id,'Report flag reviewed','Admin reviewed your flag and hid the report.','/notifications' from public.report_flags where report_id=p_report_id and status='open';
    update public.report_flags set status='actioned',resolved_at=now(),resolved_by=auth.uid(),resolution_reason=btrim(p_reason) where report_id=p_report_id and status='open';
  end if;
  insert into public.moderation_actions(admin_id,action,subject,reason) values(auth.uid(),label,r.title||' ('||r.id::text||')',btrim(p_reason));
  insert into public.notifications(user_id,title,body,href) values(r.owner_id,label,btrim(p_reason),'/item/'||r.id::text);
end;
$$;

create function public.dismiss_report_flag(p_flag_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare f public.report_flags%rowtype; report uuid;
begin
  if not public.is_active_member() or not public.is_admin() then raise exception 'Admin required'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 10 and 1000 then raise exception 'Reason must be 10 to 1000 characters'; end if;
  select report_id into report from public.report_flags where id=p_flag_id;
  perform id from public.reports where id=report for update;
  select * into f from public.report_flags where id=p_flag_id for update;
  if not found or f.status<>'open' then raise exception 'Flag no longer open'; end if;
  update public.report_flags set status='dismissed',resolved_at=now(),resolved_by=auth.uid(),resolution_reason=btrim(p_reason) where id=p_flag_id;
  insert into public.notifications(user_id,title,body,href) values(f.reporter_id,'Report flag reviewed','Admin reviewed your flag and kept the report visible.','/notifications');
  insert into public.moderation_actions(admin_id,action,subject,reason) values(auth.uid(),'Report flag dismissed',f.report_id::text||' (flag '||f.id::text||')',btrim(p_reason));
end;
$$;

-- Cached clients must supply a reason too; the legacy overload cannot bypass audit requirements.
create or replace function public.set_member_suspended(p_user_id uuid,p_suspended boolean) returns void language plpgsql security definer set search_path='' as $$
begin raise exception 'A moderation reason is required. Refresh the app.'; end;
$$;
create function public.set_member_suspended(p_user_id uuid,p_suspended boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare p public.profiles%rowtype; label text;
begin
  if not public.is_active_member() or not public.is_admin() then raise exception 'Admin required'; end if;
  if p_user_id=auth.uid() then raise exception 'Cannot suspend yourself'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 10 and 1000 or p_suspended is null then raise exception 'Reason must be 10 to 1000 characters'; end if;
  select * into p from public.profiles where id=p_user_id for update;
  if not found then raise exception 'User not found'; end if;
  if (p.suspended_at is not null)=p_suspended then return; end if;
  label:=case when p_suspended then 'User suspended' else 'User restored' end;
  update public.profiles set suspended_at=case when p_suspended then now() else null end where id=p_user_id;
  insert into public.moderation_actions(admin_id,action,subject,reason) values(auth.uid(),label,p.display_name||' ('||p.id::text||')',btrim(p_reason));
end;
$$;

create function public.guard_moderated_report_claim() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' or (new.status in ('approved','completed') and (new.status is distinct from old.status or new.owner_confirmed_at is distinct from old.owner_confirmed_at or new.claimant_confirmed_at is distinct from old.claimant_confirmed_at)) then
    if exists(select 1 from public.reports where id in (new.report_id,new.related_report_id) and hidden) then raise exception 'A report is hidden. Admin must restore it before claims or handover continue'; end if;
  end if;
  return new;
end;
$$;
create trigger guard_moderated_report_claim before insert or update on public.claims for each row execute function public.guard_moderated_report_claim();
create function public.guard_moderated_report_delete() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.hidden or exists(select 1 from public.report_flags where report_id=old.id and status='open') then raise exception 'A moderated or flagged report cannot be deleted. Contact Admin'; end if;
  if auth.uid() is not null and public.is_admin() and auth.uid()<>old.owner_id then raise exception 'Use hide/restore to moderate another member report'; end if;
  return old;
end;
$$;
create trigger guard_moderated_report_delete before delete on public.reports for each row execute function public.guard_moderated_report_delete();

-- Keep the existing validated editor; only the audited wrappers remain callable by clients.
alter function public.edit_report(uuid,text,text,text,text,text,text,date,text,text,text) rename to edit_report_before_moderation;
revoke all on function public.edit_report_before_moderation(uuid,text,text,text,text,text,text,date,text,text,text) from public,anon,authenticated;
create function public.edit_report(p_id uuid,p_type text,p_title text,p_category text,p_brand text,p_color text,p_location text,p_occurred_on date,p_description text,p_contact_phone text,p_image_path text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.reports%rowtype;
begin
  if not public.is_active_member() then raise exception 'Verified active account required'; end if;
  select * into r from public.reports where id=p_id for update;
  if not found then raise exception 'Report not found'; end if;
  if r.owner_id<>auth.uid() then
    if not public.is_admin() then raise exception 'Not authorized'; end if;
    if p_reason is null or char_length(btrim(p_reason)) not between 10 and 1000 then raise exception 'Admin edit reason must be 10 to 1000 characters'; end if;
  end if;
  perform public.edit_report_before_moderation(p_id,p_type,p_title,p_category,p_brand,p_color,p_location,p_occurred_on,p_description,p_contact_phone,p_image_path);
  if r.owner_id<>auth.uid() then insert into public.moderation_actions(admin_id,action,subject,reason) values(auth.uid(),'Report updated',r.title||' ('||r.id::text||')',btrim(p_reason)); end if;
end;
$$;
create function public.edit_report(p_id uuid,p_type text,p_title text,p_category text,p_brand text,p_color text,p_location text,p_occurred_on date,p_description text,p_contact_phone text,p_image_path text default null)
returns void language sql security definer set search_path='' as $$
  select public.edit_report(p_id,p_type,p_title,p_category,p_brand,p_color,p_location,p_occurred_on,p_description,p_contact_phone,p_image_path,null);
$$;
revoke all on function public.edit_report(uuid,text,text,text,text,text,text,date,text,text,text),public.edit_report(uuid,text,text,text,text,text,text,date,text,text,text,text) from public,anon,authenticated;
grant execute on function public.edit_report(uuid,text,text,text,text,text,text,date,text,text,text),public.edit_report(uuid,text,text,text,text,text,text,date,text,text,text,text) to authenticated;

create function public.get_admin_analytics(p_from date default null,p_to date default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.is_active_member() or not public.is_admin() then raise exception 'Admin required'; end if;
  if p_from>p_to then raise exception 'From date must be before or equal to To date'; end if;
  with selected as (
    select * from public.reports where (p_from is null or created_at>=p_from::timestamp at time zone 'UTC') and (p_to is null or created_at<(p_to+1)::timestamp at time zone 'UTC')
  ), selected_claims as (
    select * from public.claims where (p_from is null or created_at>=p_from::timestamp at time zone 'UTC') and (p_to is null or created_at<(p_to+1)::timestamp at time zone 'UTC')
  ), pairs as (
    select distinct least(c.report_id,c.related_report_id),greatest(c.report_id,c.related_report_id) from public.claims c
    join selected a on a.id=c.report_id and a.status='returned' join selected b on b.id=c.related_report_id and b.status='returned' where c.status='completed'
  )
  select jsonb_build_object(
    'totalReports',(select count(*) from selected),'hiddenReports',(select count(*) from selected where hidden),
    'returnedReports',(select count(*) from selected where status='returned'),
    'recoveredItems',greatest(0,(select count(*) from selected where status='returned')-(select count(*) from pairs)),
    'totalUsers',(select count(*) from public.profiles),'suspendedUsers',(select count(*) from public.profiles where suspended_at is not null),
    'pendingClaims',(select count(*) from selected_claims where status='pending'),'disputedClaims',(select count(*) from selected_claims where status='disputed'),
    'openFlags',(select count(*) from public.report_flags where status='open'),
    'categories',(select jsonb_agg(jsonb_build_object('category',category,'count',(select count(*) from selected r where r.category=categories.category)) order by ord) from unnest(array['Phone','Wallet','ID Card','Bag','Keys','Electronics','Book','Other']) with ordinality categories(category,ord)),
    'monthly',(select jsonb_agg(jsonb_build_object('month',to_char(month,'YYYY-MM'),'count',(select count(*) from selected where to_char(created_at at time zone 'UTC','YYYY-MM')=to_char(month,'YYYY-MM'))) order by month) from generate_series(date_trunc('month',coalesce(p_to,(now() at time zone 'UTC')::date)::timestamp)-interval '5 months',date_trunc('month',coalesce(p_to,(now() at time zone 'UTC')::date)::timestamp),interval '1 month') month)
  ) into result;
  return result;
end;
$$;

revoke all on function public.guard_moderated_report_claim(),public.guard_moderated_report_delete(),public.flag_report(uuid,text),public.moderate_report(uuid,boolean,text),public.dismiss_report_flag(uuid,text),public.set_member_suspended(uuid,boolean,text),public.get_admin_analytics(date,date) from public,anon,authenticated;
grant execute on function public.flag_report(uuid,text),public.moderate_report(uuid,boolean,text),public.dismiss_report_flag(uuid,text),public.set_member_suspended(uuid,boolean,text),public.get_admin_analytics(date,date) to authenticated;
commit;
