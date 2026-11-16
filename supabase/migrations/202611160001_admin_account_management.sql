-- Five equal Admins, reserved provisioning slots and a one-time trusted bootstrap.
begin;
create schema if not exists findback_private;
revoke all on schema findback_private from public,anon,authenticated;
create table findback_private.admin_bootstrap (
  singleton boolean primary key default true check(singleton), initialized boolean not null default false
);
insert into findback_private.admin_bootstrap(singleton,initialized) select true,exists(select 1 from public.admin_members);
create table findback_private.admin_provisions (
  user_id uuid primary key default gen_random_uuid(), email text not null unique,
  creator_id uuid references public.profiles(id) on delete cascade,
  bootstrap boolean not null default false, expires_at timestamptz not null default clock_timestamp()+interval '5 minutes',
  check(email=lower(btrim(email)) and char_length(email) between 3 and 254)
);
alter table findback_private.admin_bootstrap enable row level security;
alter table findback_private.admin_provisions enable row level security;
revoke all on all tables in schema findback_private from public,anon,authenticated;

do $$ begin if (select count(*) from public.admin_members)>5 then raise exception 'Resolve existing Admin count above five before applying this migration'; end if; end $$;

create function public.guard_admin_membership() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(72346116001);
  if tg_op='INSERT' then
    if exists(select 1 from public.admin_members where user_id=new.user_id) then return new; end if;
    if (select count(*) from public.admin_members)+(select count(*) from findback_private.admin_provisions where expires_at>clock_timestamp())>=5 then raise exception 'At most five Admins are allowed'; end if;
    update findback_private.admin_bootstrap set initialized=true;
    return new;
  end if;
  if (select count(*) from public.admin_members)<=1 then raise exception 'The last Admin cannot be removed'; end if;
  if exists(select 1 from public.profiles where id=old.user_id and suspended_at is null) and not exists(
    select 1 from public.admin_members a join public.profiles p on p.id=a.user_id join auth.users u on u.id=a.user_id
    where a.user_id<>old.user_id and p.suspended_at is null and u.email_confirmed_at is not null
  ) then raise exception 'Keep at least one active Admin'; end if;
  return old;
end;
$$;
create trigger findback_admin_membership_guard before insert or delete on public.admin_members for each row execute function public.guard_admin_membership();

create or replace function public.enforce_campus_email() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.email is not null and lower(new.email) ~ '^[a-z0-9._%+-]+@seu[.]edu[.]bd$' then return new; end if;
  if new.email is not null and char_length(new.email)<=254 and new.email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' and (
    exists(select 1 from public.admin_members where user_id=new.id) or exists(
      select 1 from findback_private.admin_provisions where user_id=new.id and email=lower(new.email) and expires_at>clock_timestamp()
    )
  ) then return new; end if;
  raise exception 'Only a valid @seu.edu.bd email address is permitted for student accounts';
end;
$$;
create or replace function public.is_active_member() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p join auth.users u on u.id=p.id
    where p.id=(select auth.uid()) and p.suspended_at is null and u.email_confirmed_at is not null
    and (lower(u.email) ~ '^[a-z0-9._%+-]+@seu[.]edu[.]bd$' or exists(select 1 from public.admin_members where user_id=p.id)));
$$;

create function public.reserve_admin_account(p_email text) returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid:=gen_random_uuid(); v_email text:=lower(btrim(p_email));
begin
  perform pg_advisory_xact_lock(72346116001);
  if not public.is_active_member() or not public.is_admin() then raise exception 'Admin required'; end if;
  if v_email is null or char_length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Invalid email'; end if;
  delete from findback_private.admin_provisions where expires_at<=clock_timestamp();
  if exists(select 1 from auth.users u where lower(u.email)=v_email) then raise exception 'This email already has an account; use a new email for a new Admin'; end if;
  if (select count(*) from public.admin_members)+(select count(*) from findback_private.admin_provisions)>=5 then raise exception 'At most five Admins are allowed'; end if;
  insert into findback_private.admin_provisions(user_id,email,creator_id) values(target,v_email,auth.uid());
  return jsonb_build_object('user_id',target,'email',v_email);
end;
$$;
create function public.cancel_admin_reservation(p_user_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(72346116001);
  delete from findback_private.admin_provisions where user_id=p_user_id and creator_id=auth.uid();
end;
$$;

create function public.prepare_bootstrap_admin(p_email text) returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid; v_email text:=lower(btrim(p_email));
begin
  perform pg_advisory_xact_lock(72346116001);
  if v_email is null or char_length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Invalid email'; end if;
  select id into target from auth.users u where lower(u.email)=v_email;
  if exists(select 1 from public.admin_members where user_id=target) then return jsonb_build_object('user_id',target,'existing',true); end if;
  if (select initialized from findback_private.admin_bootstrap) or exists(select 1 from public.admin_members) then raise exception 'Bootstrap has already been used; ask an existing Admin'; end if;
  delete from findback_private.admin_provisions where expires_at<=clock_timestamp();
  if exists(select 1 from findback_private.admin_provisions) then raise exception 'Bootstrap is already in progress'; end if;
  if target is not null then
    if not exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=target and u.email_confirmed_at is not null and p.suspended_at is null) then raise exception 'Verify the existing account before bootstrap'; end if;
    insert into public.admin_members(user_id) values(target);
    insert into public.moderation_actions(admin_id,action,subject,reason) values(target,'Initial Admin configured',target::text,'Trusted server-side bootstrap');
    return jsonb_build_object('user_id',target,'existing',true);
  end if;
  target:=gen_random_uuid();
  insert into findback_private.admin_provisions(user_id,email,bootstrap) values(target,v_email,true);
  return jsonb_build_object('user_id',target,'existing',false);
end;
$$;
create function public.cancel_bootstrap_admin(p_user_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(72346116001);
  delete from findback_private.admin_provisions where user_id=p_user_id and bootstrap;
end;
$$;

create function public.complete_admin_provision() returns trigger language plpgsql security definer set search_path='' as $$
declare provision findback_private.admin_provisions%rowtype;
begin
  perform pg_advisory_xact_lock(72346116001);
  select * into provision from findback_private.admin_provisions where user_id=new.id and email=lower(new.email);
  if not found then
    if new.raw_app_meta_data->>'findback_admin_provision'='true' then raise exception 'Admin provisioning expired; try again'; end if;
    return new;
  end if;
  if provision.expires_at<=clock_timestamp() then raise exception 'Admin provisioning expired; try again'; end if;
  if new.email_confirmed_at is null then raise exception 'Admin provisioning requires a confirmed account'; end if;
  if provision.bootstrap then
    if (select initialized from findback_private.admin_bootstrap) or exists(select 1 from public.admin_members) then raise exception 'Bootstrap has already been used'; end if;
  elsif not exists(
    select 1 from public.admin_members a join public.profiles p on p.id=a.user_id join auth.users u on u.id=a.user_id
    where a.user_id=provision.creator_id and p.suspended_at is null and u.email_confirmed_at is not null
  ) then raise exception 'The creating Admin no longer has active access'; end if;
  delete from findback_private.admin_provisions where user_id=new.id;
  insert into public.admin_members(user_id) values(new.id);
  insert into public.moderation_actions(admin_id,action,subject,reason) values(coalesce(provision.creator_id,new.id),'Admin account created',new.id::text,'Trusted password account provisioned with an allocated Admin slot');
  return new;
end;
$$;
-- Runs after findback_new_user, which creates the profile and private email.
create trigger findback_provision_admin after insert on auth.users for each row execute function public.complete_admin_provision();

create function public.list_managed_admins() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_active_member() or not public.is_admin() then raise exception 'Admin required'; end if;
  return jsonb_build_object('limit',5,'admins',(select coalesce(jsonb_agg(jsonb_build_object('id',a.user_id,'name',p.display_name,'email',e.email,'createdAt',a.created_at,'suspended',p.suspended_at is not null) order by a.created_at,a.user_id),'[]') from public.admin_members a join public.profiles p on p.id=a.user_id join public.profile_emails e on e.user_id=a.user_id));
end;
$$;
create function public.remove_admin_account(p_user_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(72346116001);
  if not public.is_active_member() or not public.is_admin() then raise exception 'Admin required'; end if;
  if not exists(select 1 from public.admin_members where user_id=p_user_id) then raise exception 'Admin not found'; end if;
  delete from public.admin_members where user_id=p_user_id;
  insert into public.moderation_actions(admin_id,action,subject,reason) values(auth.uid(),'Admin access removed',p_user_id::text,'Admin role removed; account and reports retained');
end;
$$;
create function public.admin_account_provisioned(p_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.admin_members where user_id=p_user_id);
$$;

revoke all on function public.guard_admin_membership(),public.complete_admin_provision(),public.reserve_admin_account(text),public.cancel_admin_reservation(uuid),public.prepare_bootstrap_admin(text),public.cancel_bootstrap_admin(uuid),public.list_managed_admins(),public.remove_admin_account(uuid),public.admin_account_provisioned(uuid) from public,anon,authenticated;
grant execute on function public.reserve_admin_account(text),public.cancel_admin_reservation(uuid),public.list_managed_admins(),public.remove_admin_account(uuid) to authenticated;
grant execute on function public.prepare_bootstrap_admin(text),public.cancel_bootstrap_admin(uuid),public.admin_account_provisioned(uuid) to service_role;
commit;
