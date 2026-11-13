-- Phase 5: bounded, authorized data pages and exact counters.
begin;
create index idx_reports_public_created_cursor on public.reports(created_at desc,id desc) where not hidden;
create index idx_reports_owner_cursor on public.reports(owner_id,created_at desc,id desc);
create index idx_reports_candidate on public.reports(category,type,occurred_on,id) where not hidden and status='open';
create index idx_claims_claimant_cursor on public.claims(claimant_id,created_at desc,id desc);
create index idx_claims_report_cursor on public.claims(report_id,created_at desc,id desc);
create index idx_notifications_cursor on public.notifications(user_id,created_at desc,id desc);
create index idx_actions_cursor on public.moderation_actions(created_at desc,id desc);
create index idx_flags_cursor on public.report_flags(created_at desc,id desc);

-- A bounded bundle hydrates only the relationships needed by a requested page. RLS applies throughout.
create function public.get_page_bundle(p_reports uuid[] default '{}',p_claims uuid[] default '{}',p_profiles uuid[] default '{}',p_notices uuid[] default '{}',p_actions uuid[] default '{}',p_flags uuid[] default '{}')
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb:='{}'; rs uuid[]:=p_reports; us uuid[]:=p_profiles; cs jsonb:='[]'; fs jsonb:='[]'; acts jsonb:='[]'; active boolean:=false;
begin
  if greatest(cardinality(p_reports),cardinality(p_claims),cardinality(p_profiles),cardinality(p_notices),cardinality(p_actions),cardinality(p_flags))>100 then raise exception 'Page bundle too large'; end if;
  if auth.uid() is not null then active:=public.is_active_member(); end if;
  if active then
    select coalesce(jsonb_agg(to_jsonb(c)),'[]') into cs from public.claims c where id=any(p_claims);
    select coalesce(jsonb_agg(to_jsonb(f)),'[]') into fs from public.report_flags f where id=any(p_flags);
    select coalesce(jsonb_agg(to_jsonb(a)),'[]') into acts from public.moderation_actions a where id=any(p_actions);
    rs:=rs||array(select (v->>'report_id')::uuid from jsonb_array_elements(cs||fs) v)||array(select (v->>'related_report_id')::uuid from jsonb_array_elements(cs) v where v->>'related_report_id' is not null);
    us:=us||array(select (v->>'claimant_id')::uuid from jsonb_array_elements(cs) v)||array(select (v->>'reporter_id')::uuid from jsonb_array_elements(fs) v)||array(select (v->>'admin_id')::uuid from jsonb_array_elements(acts) v);
    result:=jsonb_build_object('claims',cs,'flags',fs,'activity',acts,'notifications',(select coalesce(jsonb_agg(to_jsonb(n)),'[]') from public.notifications n where id=any(p_notices)));
  end if;
  result:=result||jsonb_build_object('reports',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.reports r where id=any(rs)));
  us:=us||array(select owner_id from public.reports where id=any(rs));
  if auth.uid() is not null then
    us:=us||array[auth.uid()];
    result:=result||jsonb_build_object('profiles',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,'created_at',p.created_at,'suspended_at',p.suspended_at)),'[]') from public.profiles p where id=any(us)));
  else
    result:=result||jsonb_build_object('profiles',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,'created_at',p.created_at)),'[]') from public.profiles p where id=any(us)));
  end if;
  if active then result:=result||jsonb_build_object(
    'emails',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from public.profile_emails e where user_id=any(us)),
    'admins',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.admin_members a where user_id=any(us)),
    'contacts',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from public.report_contacts c where report_id=any(rs))); end if;
  return result;
end;
$$;

-- Only public aggregates are exposed, never claim IDs, evidence, recipients or contact fields.
create function public.get_public_report_stats() returns jsonb language sql stable security definer set search_path='' as $$
  with visible as (select * from public.reports where not hidden), pairs as (
    select distinct least(c.report_id,c.related_report_id),greatest(c.report_id,c.related_report_id) from public.claims c
    join visible a on a.id=c.report_id and a.status='returned' join visible b on b.id=c.related_report_id and b.status='returned' where c.status='completed'
  ) select jsonb_build_object('totalReports',(select count(*) from visible),'activeLost',(select count(*) from visible where type='lost' and status='open'),
    'activeFound',(select count(*) from visible where type='found' and status='open'),'recoveredItems',greatest(0,(select count(*) from visible where status='returned')-(select count(*) from pairs)));
$$;

create function public.get_data_page(p_query jsonb default '{}') returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
  kind text:=coalesce(p_query->>'kind','bootstrap'); table_name text; conditions text:='true'; ordering text:='e.created_at'; direction text:='desc'; statement text;
  size integer:=coalesce((p_query->>'pageSize')::integer,20); page integer:=coalesce((p_query->>'page')::integer,1); result jsonb; ids uuid[]; rs uuid[]:='{}'; cs uuid[]:='{}'; us uuid[]:='{}'; ns uuid[]:='{}'; acts uuid[]:='{}'; fs uuid[]:='{}';
  active boolean:=false; admin boolean:=false; source public.reports%rowtype; stats jsonb:='{}'; stamp timestamptz:=coalesce((p_query->>'snapshot')::timestamptz,statement_timestamp());
begin
  if p_query is null or jsonb_typeof(p_query)<>'object' then raise exception 'Invalid page query'; end if;
  if size<1 or size>100 or page<1 or length(coalesce(p_query->>'search',''))>200 then raise exception 'Invalid page size, page or search'; end if;
  if coalesce(p_query->>'from','')<>'' and coalesce(p_query->>'to','')<>'' and (p_query->>'from')::date>(p_query->>'to')::date then raise exception 'From date must be before or equal to To date'; end if;
  if auth.uid() is not null then active:=public.is_active_member(); admin:=active and public.is_admin(); end if;
  if kind like 'admin_%' and not admin then raise exception 'Admin required'; end if;
  if kind in ('my_reports','incoming','outgoing','notifications','related','claim','duplicates') and not active then raise exception 'Verified active account required'; end if;
  case kind
    when 'bootstrap' then table_name:='reports';conditions:='not e.hidden';size:=4;page:=1;
    when 'report' then table_name:='reports';conditions:='e.id=($1->>''id'')::uuid';size:=1;page:=1;
    when 'claim' then table_name:='claims';conditions:='e.id=($1->>''id'')::uuid';size:=1;page:=1;
    when 'browse' then table_name:='reports';conditions:='not e.hidden';
    when 'my_reports' then table_name:='reports';conditions:='e.owner_id=$2';
    when 'incoming' then table_name:='claims';conditions:='exists(select 1 from public.reports r where r.id=e.report_id and r.owner_id=$2)';
    when 'outgoing' then table_name:='claims';conditions:='e.claimant_id=$2';
    when 'notifications' then table_name:='notifications';conditions:='e.user_id=$2';
    when 'admin_reports' then table_name:='reports';
    when 'admin_claims' then table_name:='claims';
    when 'admin_users' then table_name:='profiles';
    when 'admin_flags' then table_name:='report_flags';
    when 'admin_activity' then table_name:='moderation_actions';
    when 'match_sources' then table_name:='reports';conditions:='not e.hidden and e.status=''open''';if active and not admin then conditions:=conditions||' and e.owner_id=$2';end if;
    when 'duplicates' then table_name:='reports';conditions:='not e.hidden and e.status=''open'' and e.category=$1->>''category'' and e.type=$1->>''type'' and abs(e.occurred_on-($1->>''occurredOn'')::date)<=14 and (nullif($1->>''id'','''') is null or e.id<>($1->>''id'')::uuid)';
    when 'related','match_candidates' then
      select * into source from public.reports where id=(p_query->>'id')::uuid;
      table_name:='reports';
      if not found or source.hidden or source.status<>'open' then conditions:='false';
      else
        conditions:='not e.hidden and e.status=''open'' and exists(select 1 from public.reports s where s.id=($1->>''id'')::uuid and s.category=e.category and s.type<>e.type';
        if kind='related' then conditions:=conditions||') and e.owner_id=$2';
        else conditions:=conditions||' and s.owner_id<>e.owner_id and abs(s.occurred_on-e.occurred_on)<=30)';end if;
      end if;
    else raise exception 'Unknown data scope';
  end case;
  if kind in ('browse','my_reports','admin_reports','match_sources') then
    conditions:=conditions||' and (coalesce($1->>''category'',''all'')=''all'' or e.category=$1->>''category'') and (coalesce($1->>''type'',''all'')=''all'' or e.type=$1->>''type'') and (coalesce($1->>''status'',''all'')=''all'' or e.status=$1->>''status'')';
    if kind='admin_reports' then
      conditions:=conditions||' and (coalesce($1->>''visibility'',''all'')=''all'' or e.hidden=($1->>''visibility''=''hidden'')) and position(lower(coalesce($1->>''search'','''')) in lower(concat_ws('' '',e.id::text,e.title,e.location,(select display_name from public.profiles where id=e.owner_id))))>0';
    elsif kind='my_reports' then conditions:=conditions||' and position(lower(coalesce($1->>''search'','''')) in lower(concat_ws('' '',e.title,e.category,e.location)))>0';
    else conditions:=conditions||' and not exists(select 1 from unnest(regexp_split_to_array(lower(btrim(coalesce($1->>''search'',''''))),''\s+'')) term where position(term in lower(concat_ws('' '',e.title,e.brand,e.color,e.description,e.location,e.category)))=0)';end if;
    if kind='browse' then
      conditions:=conditions||' and (nullif($1->>''from'','''') is null or e.occurred_on>=($1->>''from'')::date) and (nullif($1->>''to'','''') is null or e.occurred_on<=($1->>''to'')::date)';
      case coalesce(p_query->>'sort','newest') when 'oldest' then direction:='asc'; when 'alphabetical' then ordering:='lower(e.title)';direction:='asc';when 'date' then ordering:='e.occurred_on';when 'newest' then null;else raise exception 'Invalid sort';end case;
    end if;
  elsif table_name='claims' and kind<>'claim' then
    conditions:=conditions||' and (coalesce($1->>''status'',''all'')=''all'' or e.status=$1->>''status'') and position(lower(coalesce($1->>''search'','''')) in lower(concat_ws('' '',e.id::text,e.status,e.issue_reason,(select title from public.reports where id=e.report_id),(select display_name from public.profiles where id=e.claimant_id),(select p.display_name from public.profiles p join public.reports r on r.owner_id=p.id where r.id=e.report_id))))>0';
  elsif kind='admin_users' then
    conditions:=conditions||' and (coalesce($1->>''status'',''all'')=''all'' or (e.suspended_at is not null)=($1->>''status''=''suspended'')) and position(lower(coalesce($1->>''search'','''')) in lower(concat_ws('' '',e.id::text,e.display_name,(select email from public.profile_emails where user_id=e.id))))>0';
  elsif kind='admin_flags' then
    conditions:=conditions||' and (coalesce($1->>''status'',''all'')=''all'' or e.status=$1->>''status'') and position(lower(coalesce($1->>''search'','''')) in lower(concat_ws('' '',e.id::text,e.reason,(select title from public.reports where id=e.report_id),(select display_name from public.profiles where id=e.reporter_id))))>0';
  elsif kind='admin_activity' then
    conditions:=conditions||' and position(lower(coalesce($1->>''search'','''')) in lower(concat_ws('' '',e.action,e.subject,e.reason,(select display_name from public.profiles where id=e.admin_id))))>0';
  end if;
  if kind like 'admin_%' then conditions:=conditions||' and (nullif($1->>''from'','''') is null or e.created_at>=($1->>''from'')::date::timestamp at time zone ''UTC'') and (nullif($1->>''to'','''') is null or e.created_at<(($1->>''to'')::date+1)::timestamp at time zone ''UTC'')';end if;
  if coalesce((p_query->>'forExport')::boolean,false) then
    if kind<>'admin_reports' then raise exception 'Invalid export scope';end if;
    conditions:=conditions||' and e.created_at<=$5 and (nullif($1->>''cursorId'','''') is null or (e.created_at,e.id)<(($1->>''cursorAt'')::timestamptz,($1->>''cursorId'')::uuid))';
  end if;
  statement:=format('with filtered as (select e.id,%s as sort_value from public.%I e where %s), totals as (select count(*) as n from filtered), selected as (select id from filtered order by sort_value %s,id %s limit $3 offset ((least($4,greatest(1,ceil((select n from totals)::numeric/$3)::integer))-1)*$3)) select jsonb_build_object(''ids'',coalesce((select jsonb_agg(id) from selected),''[]''::jsonb),''total'',n,''page'',least($4,greatest(1,ceil(n::numeric/$3)::integer)),''pageSize'',$3) from totals',ordering,table_name,conditions,direction,direction);
  execute statement into result using p_query,auth.uid(),size,page,stamp;
  ids:=array(select value::uuid from jsonb_array_elements_text(result->'ids'));
  case table_name when 'reports' then rs:=ids;when 'claims' then cs:=ids;when 'profiles' then us:=ids;when 'notifications' then ns:=ids;when 'moderation_actions' then acts:=ids;when 'report_flags' then fs:=ids;end case;
  if kind='report' and active then
    cs:=array(select id from public.claims where ((report_id=any(rs) or related_report_id=any(rs)) and status in ('approved','disputed')) or (report_id=any(rs) and claimant_id=auth.uid() and status='pending') order by created_at desc,id desc limit 4);
    fs:=array(select id from public.report_flags where report_id=any(rs) and reporter_id=auth.uid() and status='open' limit 1);
    stats:=jsonb_build_object('claimCount',(select count(*) from public.claims where report_id=any(rs)));
  end if;
  if kind='bootstrap' then
    stats:=public.get_public_report_stats();
    if active then stats:=stats||jsonb_build_object('myReports',(select count(*) from public.reports where owner_id=auth.uid()),'myReturned',(select count(*) from public.reports where owner_id=auth.uid() and status='returned'),
      'incoming',(select count(*) from public.claims c join public.reports r on r.id=c.report_id where r.owner_id=auth.uid()),'outgoing',(select count(*) from public.claims where claimant_id=auth.uid()),
      'pendingIncoming',(select count(*) from public.claims c join public.reports r on r.id=c.report_id where r.owner_id=auth.uid() and c.status='pending'),'pendingOutgoing',(select count(*) from public.claims where claimant_id=auth.uid() and status='pending'));end if;
  end if;
  return result||jsonb_build_object('snapshot',stamp,'stats',stats,'bundle',public.get_page_bundle(rs,cs,us,ns,acts,fs));
end;
$$;
revoke all on function public.get_page_bundle(uuid[],uuid[],uuid[],uuid[],uuid[],uuid[]),public.get_public_report_stats(),public.get_data_page(jsonb) from public,anon,authenticated;
grant execute on function public.get_page_bundle(uuid[],uuid[],uuid[],uuid[],uuid[],uuid[]),public.get_public_report_stats(),public.get_data_page(jsonb) to anon,authenticated;
commit;
