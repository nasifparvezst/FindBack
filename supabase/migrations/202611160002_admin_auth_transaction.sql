-- Auth's Admin API inserts the user before setting email confirmation/app metadata.
-- Provision the role at commit using the final row, while preserving atomicity.
begin;
create or replace function public.complete_admin_provision() returns trigger
language plpgsql security definer set search_path='' as $$
declare provision findback_private.admin_provisions%rowtype; final_user auth.users%rowtype;
begin
  select * into final_user from auth.users where id=new.id;
  if not found then return new; end if;
  perform pg_advisory_xact_lock(72346116001);
  select * into provision from findback_private.admin_provisions where user_id=final_user.id and email=lower(final_user.email);
  if not found then
    if final_user.raw_app_meta_data->>'findback_admin_provision'='true' then raise exception 'Admin provisioning expired; try again'; end if;
    return new;
  end if;
  if provision.expires_at<=clock_timestamp() then raise exception 'Admin provisioning expired; try again'; end if;
  if final_user.email_confirmed_at is null then raise exception 'Admin provisioning requires a confirmed account'; end if;
  if provision.bootstrap then
    if (select initialized from findback_private.admin_bootstrap) or exists(select 1 from public.admin_members) then raise exception 'Bootstrap has already been used'; end if;
  elsif not exists(
    select 1 from public.admin_members a join public.profiles p on p.id=a.user_id join auth.users u on u.id=a.user_id
    where a.user_id=provision.creator_id and p.suspended_at is null and u.email_confirmed_at is not null
  ) then raise exception 'The creating Admin no longer has active access'; end if;
  delete from findback_private.admin_provisions where user_id=final_user.id;
  insert into public.admin_members(user_id) values(final_user.id);
  insert into public.moderation_actions(admin_id,action,subject,reason)
    values(coalesce(provision.creator_id,final_user.id),'Admin account created',final_user.id::text,'Trusted password account provisioned with an allocated Admin slot');
  return new;
end;
$$;
drop trigger findback_provision_admin on auth.users;
create constraint trigger findback_provision_admin after insert on auth.users
  deferrable initially deferred for each row execute function public.complete_admin_provision();
revoke all on function public.complete_admin_provision() from public,anon,authenticated;
commit;
