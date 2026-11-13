begin;

-- Additive: old notifications remain valid; new message notices have an exact read cursor.
alter table public.notifications add column if not exists message_id uuid references public.messages(id) on delete set null;
create index if not exists idx_messages_claim_cursor on public.messages(claim_id,created_at desc,id desc);
create index if not exists idx_unread_notices on public.notifications(user_id,href) where read_at is null;

create or replace function public.on_new_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications(user_id,title,body,href,message_id)
  select recipient,'New message','You have a new private claim message.','/claims/'||new.claim_id::text,new.id
  from (
    select c.claimant_id as recipient from public.claims c where c.id=new.claim_id
    union
    select r.owner_id from public.claims c join public.reports r on r.id=c.report_id where c.id=new.claim_id
  ) parties where recipient<>new.sender_id;
  return new;
end;
$$;

-- SECURITY INVOKER: caller's existing claim/message RLS still applies.
create function public.get_claim_messages(
  p_claim_id uuid, p_before_created_at timestamptz default null, p_before_id uuid default null,
  p_after_created_at timestamptz default null, p_after_id uuid default null
) returns setof public.messages language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.is_active_member() or not exists(select 1 from public.claims where id=p_claim_id) then
    raise exception 'Conversation unavailable';
  end if;
  if (p_before_created_at is null) <> (p_before_id is null)
    or (p_after_created_at is null) <> (p_after_id is null)
    or (p_before_id is not null and p_after_id is not null) then
    raise exception 'Invalid message cursor';
  end if;
  if p_after_id is not null then
    return query select m.* from public.messages m where m.claim_id=p_claim_id
      and (m.created_at,m.id)>(p_after_created_at,p_after_id)
      order by m.created_at,m.id limit 51;
  else
    return query select m.* from public.messages m where m.claim_id=p_claim_id
      and (p_before_id is null or (m.created_at,m.id)<(p_before_created_at,p_before_id))
      order by m.created_at desc,m.id desc limit 51;
  end if;
end;
$$;

-- A retry after a lost response uses the same UUID and cannot create a duplicate message/alert.
create function public.send_claim_message(p_claim_id uuid,p_message_id uuid,p_body text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare clean text:=btrim(p_body);
begin
  if not public.is_active_member() or clean is null or char_length(clean) not between 1 and 2000 then
    raise exception 'An active account and 1 to 2000 message characters are required';
  end if;
  if exists(select 1 from public.messages where id=p_message_id and claim_id=p_claim_id and sender_id=auth.uid() and body=clean) then return p_message_id; end if;
  insert into public.messages(id,claim_id,sender_id,body) values(p_message_id,p_claim_id,auth.uid(),clean) on conflict(id) do nothing;
  if not exists(select 1 from public.messages where id=p_message_id and claim_id=p_claim_id and sender_id=auth.uid() and body=clean) then
    raise exception 'Message could not be sent with this delivery ID';
  end if;
  return p_message_id;
end;
$$;

create function public.mark_claim_messages_read(p_claim_id uuid,p_through_created_at timestamptz,p_through_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_member() or not exists (
    select 1 from public.claims c join public.reports r on r.id=c.report_id
    where c.id=p_claim_id and (c.claimant_id=auth.uid() or r.owner_id=auth.uid() or public.is_admin())
  ) then raise exception 'Conversation unavailable'; end if;
  if not exists(select 1 from public.messages where id=p_through_id and claim_id=p_claim_id and created_at=p_through_created_at) then
    raise exception 'Invalid message cursor';
  end if;
  update public.notifications n set read_at=now()
  where n.user_id=auth.uid() and n.read_at is null and n.href='/claims/'||p_claim_id::text and n.title='New message'
    and ((n.message_id is null and n.created_at<=p_through_created_at) or exists (
      select 1 from public.messages m where m.id=n.message_id and (m.created_at,m.id)<=(p_through_created_at,p_through_id)
    ));
end;
$$;

create function public.get_notification_summary()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('unreadNotifications',(select count(*) from public.notifications where read_at is null),
    'unreadClaims',coalesce((select jsonb_object_agg(claim_id,total) from (
      select substring(href from 9) as claim_id,count(*) as total from public.notifications
      where read_at is null and title='New message' and href like '/claims/%' group by href
    ) counts),'{}'::jsonb));
$$;

revoke all on function public.get_claim_messages(uuid,timestamptz,uuid,timestamptz,uuid),
  public.send_claim_message(uuid,uuid,text),public.mark_claim_messages_read(uuid,timestamptz,uuid),public.get_notification_summary() from public,anon;
grant execute on function public.get_claim_messages(uuid,timestamptz,uuid,timestamptz,uuid),
  public.send_claim_message(uuid,uuid,text),public.mark_claim_messages_read(uuid,timestamptz,uuid),public.get_notification_summary() to authenticated;

-- Supabase-managed publication; idempotent when a table was already enabled in Dashboard.
do $$
declare table_name text;
begin
  if not exists(select 1 from pg_publication where pubname='supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach table_name in array array['messages','notifications','claims'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=table_name) then
      execute format('alter publication supabase_realtime add table public.%I',table_name);
    end if;
  end loop;
end;
$$;

commit;
