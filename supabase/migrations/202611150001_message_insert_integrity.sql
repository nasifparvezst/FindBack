-- Final audit: serialize message insertion with claim closure and keep server timestamps.
begin;
create function public.guard_claim_message_insert() returns trigger
language plpgsql security definer set search_path='' as $$
declare state text;
begin
  -- Claim transitions take this same row lock. A waiting insert checks the final state.
  select status into state from public.claims where id=new.claim_id for update;
  if state is null or state not in ('pending','approved','disputed') then
    raise insufficient_privilege using message='new row violates row-level security policy for table "messages": conversation unavailable';
  end if;
  -- Existing RLS still enforces sender, active membership and participant/Admin access.
  -- Trusted database fixtures/imports may preserve historical message times.
  if current_setting('role',true)='authenticated' then new.created_at:=clock_timestamp(); end if;
  return new;
end;
$$;
revoke all on function public.guard_claim_message_insert() from public,anon,authenticated;
create trigger findback_claim_message_guard before insert on public.messages
  for each row execute function public.guard_claim_message_insert();
commit;
