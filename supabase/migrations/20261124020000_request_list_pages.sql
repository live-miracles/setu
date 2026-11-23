-- Request list pages, narrowed in the database.
--
-- The list endpoints used to read every request, session, participant, item and
-- comment, build every DTO, then filter, sort and slice 25 rows in TypeScript.
-- These functions do the filtering, searching, sorting, paging and status
-- counting in Postgres and return only the ids of the requested page, so the
-- edge function loads the children of 25 requests instead of all of them.
--
-- They are SECURITY DEFINER because a requester's name and email live in
-- profiles, which a plain user cannot read; visibility of each request is still
-- the caller's own, through can_view_*_request (which reads auth.uid()), the
-- same rule the table policies apply.
--
-- p_query keys (all optional):
--   statuses[], departmentId, requesterEmail, q (every word must match),
--   sortBy, sortDirection ('asc' | 'desc'); inventory also inventoryTypeId and
--   labelId; programs also placeId and dateScope ('past' | anything else).
-- Without sortBy the newest activity (latest comment) comes first.
-- Text sorts compare lower-cased values with the database collation.

create or replace function public.list_inventory_requests_page(
  p_query jsonb,
  p_page integer,
  p_page_size integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  statuses text[] := array(select jsonb_array_elements_text(coalesce(p_query->'statuses', '[]'::jsonb)));
  needles text[] := array(
    select lower(word) from regexp_split_to_table(btrim(coalesce(p_query->>'q', '')), '\s+') as word
     where word <> ''
  );
  sort_by text := nullif(p_query->>'sortBy', '');
  ascending boolean := coalesce(p_query->>'sortDirection', 'asc') <> 'desc';
  page_start integer := (greatest(coalesce(p_page, 1), 1) - 1) * p_page_size;
  result jsonb;
begin
  with matching as (
    select r.id, r.display_id, r.status::text as status,
           case sort_by
             when 'name' then lower(r.name)
             when 'status' then r.status::text
             when 'requester' then lower(requester.name)
           end as k_text,
           case sort_by
             when 'startDate' then r.start_date::timestamptz
             when 'endDate' then r.end_date::timestamptz
           end as k_ts,
           case when sort_by in ('name', 'status', 'requester', 'startDate', 'endDate')
                then null else r.display_id end as k_num,
           (select max(c.created_at) from public.comments c where c.inventory_request_id = r.id) as last_activity
      from public.inventory_requests r
      join public.profiles requester on requester.id = r.requester_id
      left join public.departments d on d.id = r.department_id
     where public.can_view_inventory_request(r.id)
       and (p_query->>'departmentId' is null or r.department_id::text = p_query->>'departmentId')
       and (p_query->>'requesterEmail' is null or requester.email::text = p_query->>'requesterEmail')
       and (p_query->>'inventoryTypeId' is null or exists (
             select 1 from public.inventory_request_items i
              where i.request_id = r.id and i.inventory_type_id::text = p_query->>'inventoryTypeId'))
       and (p_query->>'labelId' is null or exists (
             select 1 from public.inventory_request_items i
               join public.inventory_request_item_labels l on l.request_item_id = i.id
              where i.request_id = r.id and l.inventory_type_label_id::text = p_query->>'labelId'))
       and (cardinality(needles) = 0 or not exists (
             select 1 from unnest(needles) as needle
              where position(needle in lower(concat_ws(chr(10),
                      'req-' || r.display_id, r.name, requester.name, d.name, r.lead_email::text,
                      (select string_agg(coalesce(p.email::text, ip.external_email::text, ''), ' ')
                         from public.inventory_request_participants ip
                         left join public.profiles p on p.id = ip.profile_id
                        where ip.request_id = r.id),
                      (select string_agg(concat_ws(' · ', nullif(btrim(t.brand), ''), nullif(btrim(t.name), '')), ' ')
                         from public.inventory_request_items i
                         join public.inventory_types t on t.id = i.inventory_type_id
                        where i.request_id = r.id)
                    ))) = 0))
  ),
  filtered as (
    select * from matching where cardinality(statuses) = 0 or status = any (statuses)
  ),
  numbered as (
    select id, row_number() over (
      order by
        case when ascending then k_text end asc nulls last,
        case when not ascending then k_text end desc nulls last,
        case when ascending then k_ts end asc nulls last,
        case when not ascending then k_ts end desc nulls last,
        case when ascending then k_num end asc nulls last,
        case when not ascending then k_num end desc nulls last,
        case when sort_by is null then coalesce(last_activity, 'epoch'::timestamptz) end desc,
        display_id desc
    ) as rn
    from filtered
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'ids', coalesce((select jsonb_agg(id order by rn) from numbered
                      where rn > page_start and rn <= page_start + p_page_size), '[]'::jsonb),
    -- Counted before the status filter so every status option keeps its badge.
    'statusCounts', coalesce((select jsonb_object_agg(status, n)
                                from (select status, count(*) as n from matching group by status) counts),
                             '{}'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.list_program_requests_page(
  p_query jsonb,
  p_page integer,
  p_page_size integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  statuses text[] := array(select jsonb_array_elements_text(coalesce(p_query->'statuses', '[]'::jsonb)));
  needles text[] := array(
    select lower(word) from regexp_split_to_table(btrim(coalesce(p_query->>'q', '')), '\s+') as word
     where word <> ''
  );
  sort_by text := nullif(p_query->>'sortBy', '');
  ascending boolean := coalesce(p_query->>'sortDirection', 'asc') <> 'desc';
  date_scope text := nullif(p_query->>'dateScope', '');
  page_start integer := (greatest(coalesce(p_page, 1), 1) - 1) * p_page_size;
  result jsonb;
begin
  with matching as (
    select r.id, r.display_id, r.status::text as status,
           case sort_by
             when 'name' then lower(r.name)
             when 'status' then r.status::text
             when 'place' then lower(pl.name)
             when 'requester' then lower(requester.name)
           end as k_text,
           case sort_by
             when 'sessionStart' then (select min(s.start_at) from public.program_sessions s where s.request_id = r.id)
           end as k_ts,
           case when sort_by in ('name', 'status', 'place', 'requester', 'sessionStart')
                then null else r.display_id end as k_num,
           (select max(c.created_at) from public.comments c where c.program_request_id = r.id) as last_activity
      from public.program_requests r
      join public.profiles requester on requester.id = r.requester_id
      left join public.departments d on d.id = r.department_id
      left join public.places pl on pl.id = r.place_id
     where public.can_view_program_request(r.id)
       and (p_query->>'placeId' is null or r.place_id::text = p_query->>'placeId')
       and (p_query->>'departmentId' is null or r.department_id::text = p_query->>'departmentId')
       and (p_query->>'requesterEmail' is null or requester.email::text = p_query->>'requesterEmail')
       -- 'past' = scheduled and every session over; any other scope = still to
       -- come, running now, or not scheduled yet.
       and (date_scope is null or (
             case
               when date_scope = 'past' then
                 exists (select 1 from public.program_sessions s where s.request_id = r.id)
                 and not exists (select 1 from public.program_sessions s where s.request_id = r.id and s.end_at >= now())
               else
                 not exists (select 1 from public.program_sessions s where s.request_id = r.id)
                 or exists (select 1 from public.program_sessions s where s.request_id = r.id and s.end_at >= now())
             end))
       and (cardinality(needles) = 0 or not exists (
             select 1 from unnest(needles) as needle
              where position(needle in lower(concat_ws(chr(10),
                      'prg-' || r.display_id, r.name, r.language, r.program_type, requester.name,
                      requester.email::text, d.name, r.lead_email::text, pl.name,
                      (select string_agg(coalesce(p.email::text, pp.external_email::text, ''), ' ')
                         from public.program_request_participants pp
                         left join public.profiles p on p.id = pp.profile_id
                        where pp.request_id = r.id),
                      (select string_agg(s.name || ' ' || s.session_type, ' ')
                         from public.program_sessions s where s.request_id = r.id)
                    ))) = 0))
  ),
  filtered as (
    select * from matching where cardinality(statuses) = 0 or status = any (statuses)
  ),
  numbered as (
    select id, row_number() over (
      order by
        case when ascending then k_text end asc nulls last,
        case when not ascending then k_text end desc nulls last,
        case when ascending then k_ts end asc nulls last,
        case when not ascending then k_ts end desc nulls last,
        case when ascending then k_num end asc nulls last,
        case when not ascending then k_num end desc nulls last,
        case when sort_by is null then coalesce(last_activity, 'epoch'::timestamptz) end desc,
        display_id desc
    ) as rn
    from filtered
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'ids', coalesce((select jsonb_agg(id order by rn) from numbered
                      where rn > page_start and rn <= page_start + p_page_size), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.list_inventory_requests_page(jsonb, integer, integer) from public, anon;
grant execute on function public.list_inventory_requests_page(jsonb, integer, integer) to authenticated, service_role;
revoke all on function public.list_program_requests_page(jsonb, integer, integer) from public, anon;
grant execute on function public.list_program_requests_page(jsonb, integer, integer) to authenticated, service_role;
