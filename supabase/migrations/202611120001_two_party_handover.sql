-- Phase 2: additive claim state and two-party handover. Review before applying.
-- No reports, claims or messages are deleted. Historical completed claims stay intact.
begin;

alter table public.claims
  add column reviewed_at timestamptz,
  add column owner_confirmed_at timestamptz,
  add column claimant_confirmed_at timestamptz,
  add column completed_at timestamptz,
  add column cancelled_at timestamptz,
  add column disputed_at timestamptz,
  add column issue_reason text check (char_length(issue_reason) <= 1000),
  add column resolved_at timestamptz,
  add column resolution_reason text check (char_length(resolution_reason) <= 1000);
alter table public.claims drop constraint claims_status_check;
alter table public.claims add constraint claims_status_check
  check (status in ('pending','approved','rejected','completed','cancelled','disputed'));
alter table public.claims add constraint claims_completion_confirmations_check
  check (completed_at is null or (status='completed' and owner_confirmed_at is not null and claimant_confirmed_at is not null));
alter table public.moderation_actions add column reason text check (char_length(reason) <= 1000);

-- Stop rather than silently rewriting pre-existing conflicting reservations.
do $$ begin
  if exists (
    select 1 from public.claims a join public.claims b on a.id < b.id
    where a.status='approved' and b.status='approved'
      and array[a.report_id,a.related_report_id] && array[b.report_id,b.related_report_id]
  ) then raise exception 'Resolve overlapping approved claims before applying Phase 2'; end if;
end $$;
drop index public.uq_one_approved_claim_per_report;
create unique index uq_one_approved_claim_per_report on public.claims(report_id) where status in ('approved','disputed');
drop index public.uq_active_claim_per_person;
create unique index uq_active_claim_per_person on public.claims(report_id,claimant_id) where status in ('pending','approved','disputed');

create function public.notify_claim_parties(p_claim_id uuid,p_title text,p_body text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications(user_id,title,body,href)
  select distinct party,p_title,p_body,'/claims/' || c.id::text
  from public.claims c join public.reports r on r.id=c.report_id
  cross join lateral unnest(array[r.owner_id,c.claimant_id]) party where c.id=p_claim_id;
$$;

create function public.transition_claim(p_claim_id uuid,p_action text,p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_claim public.claims%rowtype; v_report public.reports%rowtype; v_related public.reports%rowtype;
  v_actor uuid := auth.uid(); v_owner boolean; v_claimant boolean; v_admin boolean;
  v_reason text := btrim(coalesce(p_reason,'')); v_title text; v_other uuid;
begin
  if not public.is_active_member() then raise exception 'Verified active account required'; end if;
  select * into v_claim from public.claims where id=p_claim_id;
  if not found then raise exception 'Claim not found'; end if;
  -- Every claim transition locks report rows in UUID order, before the claim row.
  -- Shared target/related reservations therefore serialize, including mirrored claims.
  perform id from public.reports where id in (v_claim.report_id,v_claim.related_report_id) order by id for update;
  select * into v_claim from public.claims where id=p_claim_id for update;
  if not found then raise exception 'Claim no longer available'; end if;
  select * into v_report from public.reports where id=v_claim.report_id;
  v_owner := v_report.owner_id=v_actor;
  v_claimant := v_claim.claimant_id=v_actor;
  v_admin := public.is_admin();
  if not (v_owner or v_claimant or v_admin) then raise exception 'Not authorized'; end if;
  if p_action is null or p_action not in ('approved','rejected','confirm','cancel','dispute','resume','resolve_cancel') then raise exception 'Invalid claim action'; end if;
  if p_action in ('cancel','dispute','resume','resolve_cancel') and char_length(v_reason) not between 10 and 1000 then raise exception 'Reason must be 10 to 1000 characters'; end if;

  if p_action='confirm' then
    if not (v_owner or v_claimant) then raise exception 'Only the two participants can confirm handover'; end if;
    if v_claim.status='completed' then return; end if;
    if v_claim.status <> 'approved' then raise exception 'Approved undisputed claim required'; end if;
  elsif p_action in ('approved','rejected') then
    if not (v_owner or v_admin) then raise exception 'Only owner or Admin may review'; end if;
    if v_claim.status <> 'pending' then raise exception 'Only pending claims can be reviewed'; end if;
  elsif p_action='cancel' then
    if not ((v_claim.status='pending' and v_claimant) or (v_claim.status='approved' and (v_owner or v_claimant))) then raise exception 'Claim cannot be cancelled by you'; end if;
    if v_claim.owner_confirmed_at is not null or v_claim.claimant_confirmed_at is not null then raise exception 'Handover confirmation exists; raise a dispute instead'; end if;
  elsif p_action='dispute' then
    if not (v_owner or v_claimant) or v_claim.status <> 'approved' then raise exception 'Only approved claim participants can raise a dispute'; end if;
  else
    if not v_admin or v_claim.status <> 'disputed' then raise exception 'Admin and disputed claim required'; end if;
  end if;

  if p_action in ('approved','confirm','resume') then
    if v_report.status <> 'open' then raise exception 'Report no longer open'; end if;
    if v_claim.related_report_id is not null then
      select * into v_related from public.reports where id=v_claim.related_report_id;
      if not found or v_related.owner_id <> v_claim.claimant_id or v_related.status <> 'open'
        or v_related.type=v_report.type or v_related.category <> v_report.category then raise exception 'Linked report incompatible or unavailable'; end if;
    end if;
    if exists (select 1 from public.claims c where c.id <> p_claim_id and c.status in ('approved','disputed')
      and array[c.report_id,c.related_report_id] && array[v_claim.report_id,v_claim.related_report_id]) then raise exception 'A report is reserved by another claim'; end if;
  end if;

  if p_action in ('approved','rejected') then
    update public.claims set status=p_action,reviewed_at=now(),updated_at=now() where id=p_claim_id;
    v_title := 'Claim ' || p_action;
  elsif p_action='confirm' then
    if (v_owner and v_claim.owner_confirmed_at is not null) or (v_claimant and v_claim.claimant_confirmed_at is not null) then return; end if;
    update public.claims set
      owner_confirmed_at=case when v_owner then coalesce(owner_confirmed_at,now()) else owner_confirmed_at end,
      claimant_confirmed_at=case when v_claimant then coalesce(claimant_confirmed_at,now()) else claimant_confirmed_at end,
      updated_at=now() where id=p_claim_id returning * into v_claim;
    v_title := 'Handover confirmation recorded';
    if v_claim.owner_confirmed_at is not null and v_claim.claimant_confirmed_at is not null then
      update public.claims set status='completed',completed_at=now(),updated_at=now() where id=p_claim_id;
      update public.reports set status='returned',linked_report_id=case when id=v_claim.report_id then v_claim.related_report_id else v_claim.report_id end,updated_at=now()
        where id in (v_claim.report_id,v_claim.related_report_id);
      for v_other in select id from public.claims where id <> p_claim_id and status='pending'
        and array[report_id,related_report_id] && array[v_claim.report_id,v_claim.related_report_id] order by id
      loop
        update public.claims set status='cancelled',cancelled_at=now(),updated_at=now(),issue_reason='Another claim completed the return of a linked item.' where id=v_other;
        perform public.notify_claim_parties(v_other,'Claim cancelled','Another claim completed the return of a linked item.');
      end loop;
      v_title := 'Handover completed';
    end if;
  elsif p_action='cancel' then
    update public.claims set status='cancelled',cancelled_at=now(),issue_reason=v_reason,updated_at=now() where id=p_claim_id;
    v_title := 'Claim cancelled';
  elsif p_action='dispute' then
    update public.claims set status='disputed',disputed_at=now(),issue_reason=v_reason,updated_at=now() where id=p_claim_id;
    v_title := 'Claim disputed';
  elsif p_action='resume' then
    update public.claims set status='approved',owner_confirmed_at=null,claimant_confirmed_at=null,resolved_at=now(),resolution_reason=v_reason,updated_at=now() where id=p_claim_id;
    v_title := 'Claim resumed; new confirmations required';
  else
    update public.claims set status='cancelled',cancelled_at=now(),resolved_at=now(),resolution_reason=v_reason,updated_at=now() where id=p_claim_id;
    v_title := 'Disputed claim cancelled';
  end if;
  perform public.notify_claim_parties(p_claim_id,v_title,'The claim for ' || v_report.title || ' was updated.');
  if v_admin and p_action in ('approved','rejected','resume','resolve_cancel') then
    insert into public.moderation_actions(admin_id,action,subject,reason)
      values(v_actor,v_title,'Claim ' || p_claim_id::text || ': ' || v_report.title,
        case when p_action in ('resume','resolve_cancel') then v_reason else 'Review of pending ownership evidence' end);
  end if;
end;
$$;

create or replace function public.review_claim(p_claim_id uuid,p_decision text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_decision is null or p_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  perform public.transition_claim(p_claim_id,p_decision);
end;
$$;
create function public.confirm_handover(p_claim_id uuid)
returns void language sql security definer set search_path = '' as $$
  select public.transition_claim(p_claim_id,'confirm');
$$;
create function public.manage_claim(p_claim_id uuid,p_action text,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_action is null or p_action not in ('cancel','dispute','resume','resolve_cancel') then raise exception 'Invalid management action'; end if;
  perform public.transition_claim(p_claim_id,p_action,p_reason);
end;
$$;

-- Disable the legacy single-party endpoint, including calls from cached old clients.
create or replace function public.complete_handover(p_report_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin raise exception 'Use claim-based two-party confirmation'; end;
$$;
revoke execute on function public.complete_handover(uuid) from public,anon,authenticated;

create or replace function public.submit_claim(p_report_id uuid,p_message text,p_related_report_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_report public.reports%rowtype; v_related public.reports%rowtype; v_id uuid;
begin
  if not public.is_active_member() then raise exception 'Verified active account required'; end if;
  perform id from public.reports where id in (p_report_id,p_related_report_id) order by id for update;
  select * into v_report from public.reports where id=p_report_id;
  if not found or v_report.status <> 'open' then raise exception 'Report unavailable'; end if;
  if v_report.owner_id=auth.uid() then raise exception 'Cannot claim your own report'; end if;
  if p_message is null or char_length(btrim(p_message)) not between 12 and 2000 then raise exception 'Claim explanation must be 12 to 2000 characters'; end if;
  if p_related_report_id is not null then
    select * into v_related from public.reports where id=p_related_report_id;
    if not found or v_related.owner_id <> auth.uid() or v_related.status <> 'open' or v_related.type=v_report.type or v_related.category <> v_report.category then raise exception 'Invalid related report'; end if;
  end if;
  if exists(select 1 from public.claims where report_id=p_report_id and claimant_id=auth.uid() and status in ('pending','approved','disputed')) then raise exception 'You already have an active claim'; end if;
  if exists(select 1 from public.claims where status in ('approved','disputed')
    and array[report_id,related_report_id] && array[p_report_id,p_related_report_id]) then raise exception 'A report is reserved by another claim'; end if;
  insert into public.claims(report_id,related_report_id,claimant_id,message) values(p_report_id,p_related_report_id,auth.uid(),btrim(p_message)) returning id into v_id;
  perform public.notify_claim_parties(v_id,'New claim request','A claim for ' || v_report.title || ' was submitted.');
  return v_id;
end;
$$;

-- Preserve reservations and evidence against report edits/deletion through older RPCs.
create function public.guard_claim_report_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='DELETE' then
    if exists(select 1 from public.claims where status in ('approved','disputed') and (report_id=old.id or related_report_id=old.id)) then raise exception 'Resolve approved or disputed claims before deleting the report'; end if;
    return old;
  end if;
  if (new.type,new.category,new.owner_id) is distinct from (old.type,old.category,old.owner_id)
    and exists(select 1 from public.claims where status in ('pending','approved','disputed') and (report_id=old.id or related_report_id=old.id)) then raise exception 'Resolve active claims before changing report type or category'; end if;
  if new.status='returned' and old.status <> 'returned' and not exists(
    select 1 from public.claims where status='completed' and owner_confirmed_at is not null and claimant_confirmed_at is not null
      and (report_id=old.id or related_report_id=old.id)
  ) then raise exception 'Both handover confirmations are required'; end if;
  return new;
end;
$$;
create trigger findback_claim_report_guard before update or delete on public.reports for each row execute function public.guard_claim_report_changes();

drop policy message_participants_write on public.messages;
create policy message_participants_write on public.messages for insert to authenticated with check (
  sender_id=(select auth.uid()) and (select public.is_active_member()) and exists (
    select 1 from public.claims c join public.reports r on r.id=c.report_id
    where c.id=claim_id and c.status in ('pending','approved','disputed')
      and (c.claimant_id=(select auth.uid()) or r.owner_id=(select auth.uid()) or (select public.is_admin()))
  )
);
create or replace function public.on_new_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications(user_id,title,body,href)
  select distinct party,'New private message','You have a message about ' || r.title,'/claims/' || c.id::text
  from public.claims c join public.reports r on r.id=c.report_id
  cross join lateral unnest(array[r.owner_id,c.claimant_id]) party
  where c.id=new.claim_id and party <> new.sender_id;
  return new;
end;
$$;

revoke execute on function public.notify_claim_parties(uuid,text,text),public.transition_claim(uuid,text,text),
  public.guard_claim_report_changes(),public.confirm_handover(uuid),public.manage_claim(uuid,text,text) from public,anon,authenticated;
grant execute on function public.confirm_handover(uuid),public.manage_claim(uuid,text,text) to authenticated;
commit;
