-- Activity events: a request's activity feed now holds three kinds of rows.
--   comment  what people write (unchanged)
--   status   a workflow action: data = {from, to, action, note}
--   edit     a change to the request's details: data = {changes, truncated}
-- They share the comments table, so permissions, cascade deletes and loading
-- keep working. `message` stays filled with a plain-text summary of every
-- event for the email and anything that reads comments as text.
--
-- Status events still email the request's people; edit events never do.
-- Edits are only recorded once a request has left draft, and only the fields
-- that changed are stored (values capped at 200 characters, at most 30
-- entries), so the history stays small.

alter table public.comments
  add column kind text not null default 'comment'
    check (kind in ('comment', 'status', 'edit')),
  add column data jsonb,
  add constraint comments_data_size
    check (data is null or length(data::text) <= 20000);

-- Only the database functions below write status and edit events. The Data API
-- may insert plain comments only, so a user cannot forge an audit entry.
drop policy if exists "request participants insert comments" on public.comments;
create policy "request participants insert comments"
  on public.comments for insert to authenticated
  with check (
    public.current_role() <> 'viewer'
    and author_id = auth.uid()
    and author_name is null
    and kind = 'comment'
    and data is null
    and (
      (
        inventory_request_id is not null
        and (
          public.is_approver()
          or exists (
            select 1 from public.inventory_requests r
            where r.id = inventory_request_id and r.requester_id = auth.uid()
          )
          or exists (
            select 1 from public.inventory_request_participants p
            where p.request_id = inventory_request_id and p.profile_id = auth.uid()
          )
        )
      )
      or (
        program_request_id is not null
        and (
          public.is_approver()
          or exists (
            select 1 from public.program_requests r
            where r.id = program_request_id and r.requester_id = auth.uid()
          )
          or exists (
            select 1 from public.program_request_participants p
            where p.request_id = program_request_id and p.profile_id = auth.uid()
          )
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Diff helpers. They only build jsonb; the save functions below call them.
-- ---------------------------------------------------------------------------

-- One changed value, or null when nothing changed.
create or replace function public.activity_change(p_field text, p_from text, p_to text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when p_from is not distinct from p_to then null
    else jsonb_build_object('field', p_field, 'from', left(p_from, 200), 'to', left(p_to, 200))
  end;
$$;

-- Entries added to / removed from a list, or null when the lists match. Both
-- lists are jsonb arrays of objects such as {"label": "..."}; at most ten
-- entries of each are kept, with a count of the rest.
create or replace function public.activity_set_change(p_field text, p_old jsonb, p_new jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  added jsonb;
  removed jsonb;
  added_count integer;
  removed_count integer;
begin
  select coalesce(jsonb_agg(e order by e), '[]'::jsonb), count(*)
    into added, added_count
    from (
      select e from jsonb_array_elements(p_new) e
      except
      select e from jsonb_array_elements(p_old) e
    ) a;
  select coalesce(jsonb_agg(e order by e), '[]'::jsonb), count(*)
    into removed, removed_count
    from (
      select e from jsonb_array_elements(p_old) e
      except
      select e from jsonb_array_elements(p_new) e
    ) r;
  if added_count = 0 and removed_count = 0 then return null; end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'field', p_field,
    'added', case when added_count > 0 then jsonb_path_query_array(added, '$[0 to 9]') end,
    'removed', case when removed_count > 0 then jsonb_path_query_array(removed, '$[0 to 9]') end,
    'moreAdded', nullif(greatest(added_count - 10, 0), 0),
    'moreRemoved', nullif(greatest(removed_count - 10, 0), 0)
  ));
end;
$$;

-- Participants as [{label: email}], from [{profile_id, external_email}].
create or replace function public.activity_participants_json(p_participants jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('label', lower(coalesce(p.email::text, x.external_email)))),
    '[]'::jsonb
  )
    from jsonb_to_recordset(p_participants) as x(profile_id uuid, external_email text)
    left join public.profiles p on p.id = x.profile_id;
$$;

-- Sessions as [{label, startAt, endAt}], from [{name, session_type, start_at, end_at}].
create or replace function public.activity_sessions_json(p_sessions jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'label', coalesce(nullif(concat_ws(' · ', nullif(s.name, ''), nullif(s.session_type, '')), ''), 'Session'),
    'startAt', to_char(s.start_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'endAt', to_char(s.end_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  )), '[]'::jsonb)
    from jsonb_to_recordset(p_sessions)
      as s(name text, session_type text, start_at timestamptz, end_at timestamptz);
$$;

-- Inventory lines as an object keyed by type id: {name, qty, condition, labels},
-- from [{inventory_type_id, quantity, return_condition, label_ids}].
create or replace function public.activity_inventory_items(p_items jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(g.type_id, jsonb_build_object(
    'name', g.name, 'qty', g.qty, 'condition', g.condition, 'labels', g.labels
  )), '{}'::jsonb)
    from (
      select i.inventory_type_id::text as type_id,
             coalesce(
               nullif(trim(concat_ws(' · ', nullif(t.brand, ''), nullif(t.name, ''))), ''),
               'Unnamed item'
             ) as name,
             sum(i.quantity)::integer as qty,
             max(i.return_condition) as condition,
             sum(jsonb_array_length(coalesce(i.label_ids, '[]'::jsonb)))::integer as labels
        from jsonb_to_recordset(p_items)
          as i(inventory_type_id uuid, quantity integer, return_condition text, label_ids jsonb)
        join public.inventory_types t on t.id = i.inventory_type_id
       group by i.inventory_type_id, t.brand, t.name
    ) g;
$$;

-- Item changes: lines added or removed, then per-line quantity, return
-- condition and scanned-label count changes. Returns a jsonb array.
create or replace function public.activity_diff_items(p_old jsonb, p_new jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  changes jsonb := '[]'::jsonb;
  change jsonb;
  line record;
begin
  change := public.activity_set_change(
    'Items',
    coalesce((select jsonb_agg(jsonb_build_object('label', o.value->>'name' || ' × ' || (o.value->>'qty')))
                from jsonb_each(p_old) o where not p_new ? o.key), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('label', n.value->>'name' || ' × ' || (n.value->>'qty')))
                from jsonb_each(p_new) n where not p_old ? n.key), '[]'::jsonb)
  );
  if change is not null then changes := changes || jsonb_build_array(change); end if;

  for line in
    select n.value as new_line, p_old->n.key as old_line
      from jsonb_each(p_new) n
     where p_old ? n.key
     order by n.value->>'name'
  loop
    for change in
      select c from unnest(array[
        public.activity_change(line.new_line->>'name' || ' quantity',
          line.old_line->>'qty', line.new_line->>'qty'),
        public.activity_change(line.new_line->>'name' || ' condition',
          line.old_line->>'condition', line.new_line->>'condition'),
        public.activity_change(line.new_line->>'name' || ' labels',
          line.old_line->>'labels', line.new_line->>'labels')
      ]) as c where c is not null
    loop
      changes := changes || jsonb_build_array(change);
    end loop;
  end loop;
  return changes;
end;
$$;

-- The changed request fields of an inventory request being saved, plus its
-- items and participants. `o` is the row before the update.
create or replace function public.activity_inventory_changes(
  o public.inventory_requests,
  p_fields jsonb,
  p_items jsonb,
  p_participants jsonb
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  changes jsonb := '[]'::jsonb;
  change jsonb;
  new_image text := p_fields->>'image_path';
begin
  for change in
    select c from unnest(array[
      public.activity_change('Name', o.name, p_fields->>'name'),
      public.activity_change('Requester',
        (select name from public.profiles where id = o.requester_id),
        (select name from public.profiles where id = (p_fields->>'requester_id')::uuid)),
      public.activity_change('Start date',
        to_char(o.start_date, 'FMDD Mon YYYY'),
        to_char((p_fields->>'start_date')::date, 'FMDD Mon YYYY')),
      public.activity_change('End date',
        to_char(o.end_date, 'FMDD Mon YYYY'),
        to_char((p_fields->>'end_date')::date, 'FMDD Mon YYYY')),
      public.activity_change('Department',
        (select name from public.departments where id = o.department_id),
        (select name from public.departments where id = (p_fields->>'department_id')::uuid)),
      public.activity_change('Lead email', o.lead_email::text, p_fields->>'lead_email'),
      case
        when p_fields ? 'image_path' and new_image is distinct from o.image_path
        then public.activity_change('Image',
          case when coalesce(o.image_path, '') = '' then 'None' else 'Image' end,
          case when coalesce(new_image, '') = '' then 'None' else 'New image' end)
      end
    ]) as c where c is not null
  loop
    changes := changes || jsonb_build_array(change);
  end loop;

  changes := changes || public.activity_diff_items(
    public.activity_inventory_items((
      select coalesce(jsonb_agg(jsonb_build_object(
        'inventory_type_id', i.inventory_type_id,
        'quantity', i.quantity,
        'return_condition', i.return_condition,
        'label_ids', (
          select coalesce(jsonb_agg(l.inventory_type_label_id), '[]'::jsonb)
            from public.inventory_request_item_labels l
           where l.request_item_id = i.id
        )
      )), '[]'::jsonb)
        from public.inventory_request_items i
       where i.request_id = o.id
    )),
    public.activity_inventory_items(p_items)
  );

  change := public.activity_set_change(
    'Participants',
    public.activity_participants_json((
      select coalesce(jsonb_agg(jsonb_build_object(
        'profile_id', rp.profile_id, 'external_email', rp.external_email
      )), '[]'::jsonb)
        from public.inventory_request_participants rp
       where rp.request_id = o.id
    )),
    public.activity_participants_json(p_participants)
  );
  if change is not null then changes := changes || jsonb_build_array(change); end if;
  return changes;
end;
$$;

create or replace function public.activity_program_changes(
  o public.program_requests,
  p_fields jsonb,
  p_sessions jsonb,
  p_participants jsonb
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  changes jsonb := '[]'::jsonb;
  change jsonb;
begin
  for change in
    select c from unnest(array[
      public.activity_change('Name', o.name, p_fields->>'name'),
      public.activity_change('Language', o.language, p_fields->>'language'),
      public.activity_change('Program type', o.program_type, p_fields->>'program_type'),
      public.activity_change('Requester',
        (select name from public.profiles where id = o.requester_id),
        (select name from public.profiles where id = (p_fields->>'requester_id')::uuid)),
      public.activity_change('Place',
        (select name from public.places where id = o.place_id),
        (select name from public.places where id = (p_fields->>'place_id')::uuid)),
      public.activity_change('Department',
        (select name from public.departments where id = o.department_id),
        (select name from public.departments where id = (p_fields->>'department_id')::uuid)),
      public.activity_change('Lead email', o.lead_email::text, p_fields->>'lead_email')
    ]) as c where c is not null
  loop
    changes := changes || jsonb_build_array(change);
  end loop;

  change := public.activity_set_change(
    'Sessions',
    public.activity_sessions_json((
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', s.name, 'session_type', s.session_type,
        'start_at', s.start_at, 'end_at', s.end_at
      )), '[]'::jsonb)
        from public.program_sessions s
       where s.request_id = o.id
    )),
    public.activity_sessions_json(p_sessions)
  );
  if change is not null then changes := changes || jsonb_build_array(change); end if;

  change := public.activity_set_change(
    'Participants',
    public.activity_participants_json((
      select coalesce(jsonb_agg(jsonb_build_object(
        'profile_id', rp.profile_id, 'external_email', rp.external_email
      )), '[]'::jsonb)
        from public.program_request_participants rp
       where rp.request_id = o.id
    )),
    public.activity_participants_json(p_participants)
  );
  if change is not null then changes := changes || jsonb_build_array(change); end if;
  return changes;
end;
$$;

-- Writes one edit event for a request, if anything changed.
create or replace function public.record_request_edit(
  p_kind text,
  p_request_id uuid,
  p_actor_id uuid,
  p_changes jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  summary text;
begin
  if p_actor_id is null or p_changes is null or jsonb_array_length(p_changes) = 0 then
    return;
  end if;
  select left('Edited ' || string_agg(distinct c->>'field', ', ' order by c->>'field'), 300)
    into summary
    from jsonb_array_elements(p_changes) c;
  insert into public.comments (
    inventory_request_id, program_request_id, author_id, message, kind, data
  ) values (
    case when p_kind = 'inventory' then p_request_id end,
    case when p_kind = 'program' then p_request_id end,
    p_actor_id,
    summary,
    'edit',
    jsonb_build_object(
      'changes', jsonb_path_query_array(p_changes, '$[0 to 29]'),
      'truncated', jsonb_array_length(p_changes) > 30
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Saves. Same behaviour as 20261124000000_atomic_request_saves.sql, plus an
-- optional p_actor_id: when it is given, an edit of a request that has left
-- draft records an `edit` event in the same transaction. The old signatures
-- are dropped so callers cannot reach a version that forgets the audit trail.
-- ---------------------------------------------------------------------------
drop function if exists public.save_inventory_request_tx(text, uuid, jsonb, jsonb, jsonb, text);
drop function if exists public.save_program_request_tx(text, uuid, jsonb, jsonb, jsonb, text);
drop function if exists public.save_request_participants_tx(text, uuid, jsonb);

create function public.save_inventory_request_tx(
  p_mode text,
  p_request_id uuid,
  p_fields jsonb,
  p_items jsonb,
  p_participants jsonb,
  p_expected_status text,
  p_actor_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_request public.inventory_requests%rowtype;
  current_requester uuid;
  inserted uuid;
  item jsonb;
  item_id uuid;
  changes jsonb := '[]'::jsonb;
begin
  if p_mode = 'create' then
    insert into public.inventory_requests (
      id, name, requester_id, start_date, end_date, status, image_path, department_id, lead_email
    ) values (
      p_request_id,
      p_fields->>'name',
      (p_fields->>'requester_id')::uuid,
      (p_fields->>'start_date')::date,
      (p_fields->>'end_date')::date,
      'draft',
      coalesce(p_fields->>'image_path', ''),
      (p_fields->>'department_id')::uuid,
      p_fields->>'lead_email'
    )
    on conflict (id) do nothing
    returning id into inserted;
    if inserted is null then
      select requester_id into current_requester
        from public.inventory_requests where id = p_request_id;
      if current_requester is distinct from (p_fields->>'requester_id')::uuid then
        raise exception 'This request id is already in use.';
      end if;
      return p_request_id; -- replayed create: already saved
    end if;
  elsif p_mode = 'update' then
    select * into old_request
      from public.inventory_requests where id = p_request_id for update;
    if not found then raise exception 'Request not found.'; end if;
    if old_request.status::text <> p_expected_status then
      raise exception 'This request changed while you were editing it. Reload and try again.';
    end if;
    -- Drafts are still being filled in, so only later edits are recorded.
    if p_actor_id is not null and old_request.status::text <> 'draft' then
      changes := public.activity_inventory_changes(old_request, p_fields, p_items, p_participants);
    end if;
    update public.inventory_requests set
      name = p_fields->>'name',
      requester_id = (p_fields->>'requester_id')::uuid,
      start_date = (p_fields->>'start_date')::date,
      end_date = (p_fields->>'end_date')::date,
      department_id = (p_fields->>'department_id')::uuid,
      lead_email = p_fields->>'lead_email',
      image_path = case when p_fields ? 'image_path' then p_fields->>'image_path' else image_path end
     where id = p_request_id;
    delete from public.inventory_request_items where request_id = p_request_id;
    delete from public.inventory_request_participants where request_id = p_request_id;
  else
    raise exception 'Unknown save mode.';
  end if;

  for item in select value from jsonb_array_elements(p_items) loop
    insert into public.inventory_request_items (request_id, inventory_type_id, quantity, return_condition)
    values (
      p_request_id,
      (item->>'inventory_type_id')::uuid,
      (item->>'quantity')::integer,
      nullif(item->>'return_condition', '')::public.return_condition
    )
    returning id into item_id;
    insert into public.inventory_request_item_labels (request_item_id, inventory_type_label_id)
    select item_id, label_id::uuid from jsonb_array_elements_text(coalesce(item->'label_ids', '[]'::jsonb)) as label_id;
  end loop;

  insert into public.inventory_request_participants (request_id, profile_id, external_email)
  select p_request_id, (participant->>'profile_id')::uuid, participant->>'external_email'
    from jsonb_array_elements(p_participants) as participant;

  perform public.record_request_edit('inventory', p_request_id, p_actor_id, changes);
  return p_request_id;
end;
$$;

create function public.save_program_request_tx(
  p_mode text,
  p_request_id uuid,
  p_fields jsonb,
  p_sessions jsonb,
  p_participants jsonb,
  p_expected_status text,
  p_actor_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_request public.program_requests%rowtype;
  current_requester uuid;
  inserted uuid;
  request_place uuid := (p_fields->>'place_id')::uuid;
  changes jsonb := '[]'::jsonb;
begin
  -- The same place rule approval enforces, under the same place lock, so two
  -- concurrent edits cannot double-book a place.
  if request_place is not null and jsonb_array_length(p_sessions) > 0 then
    perform 1 from public.places where id = request_place for update;
    if exists (
      select 1
        from jsonb_to_recordset(p_sessions) as current_session(start_at timestamptz, end_at timestamptz)
        join public.program_requests other_request
          on other_request.place_id = request_place
         and other_request.status = 'approved'
         and other_request.id <> p_request_id
        join public.program_sessions other_session on other_session.request_id = other_request.id
       where current_session.start_at < other_session.end_at + interval '1 hour'
         and other_session.start_at < current_session.end_at + interval '1 hour'
    ) then
      raise exception 'This place is unavailable: its session is within one hour of another scheduled program.';
    end if;
  end if;

  if p_mode = 'create' then
    insert into public.program_requests (
      id, name, language, program_type, requester_id, status, place_id, department_id, lead_email
    ) values (
      p_request_id,
      p_fields->>'name',
      p_fields->>'language',
      p_fields->>'program_type',
      (p_fields->>'requester_id')::uuid,
      'draft',
      request_place,
      (p_fields->>'department_id')::uuid,
      p_fields->>'lead_email'
    )
    on conflict (id) do nothing
    returning id into inserted;
    if inserted is null then
      select requester_id into current_requester
        from public.program_requests where id = p_request_id;
      if current_requester is distinct from (p_fields->>'requester_id')::uuid then
        raise exception 'This request id is already in use.';
      end if;
      return p_request_id; -- replayed create: already saved
    end if;
  elsif p_mode = 'update' then
    select * into old_request
      from public.program_requests where id = p_request_id for update;
    if not found then raise exception 'Request not found.'; end if;
    if old_request.status::text <> p_expected_status then
      raise exception 'This request changed while you were editing it. Reload and try again.';
    end if;
    if p_actor_id is not null and old_request.status::text <> 'draft' then
      changes := public.activity_program_changes(old_request, p_fields, p_sessions, p_participants);
    end if;
    update public.program_requests set
      name = p_fields->>'name',
      language = p_fields->>'language',
      program_type = p_fields->>'program_type',
      requester_id = (p_fields->>'requester_id')::uuid,
      place_id = request_place,
      department_id = (p_fields->>'department_id')::uuid,
      lead_email = p_fields->>'lead_email'
     where id = p_request_id;
    delete from public.program_sessions where request_id = p_request_id;
    delete from public.program_request_participants where request_id = p_request_id;
  else
    raise exception 'Unknown save mode.';
  end if;

  insert into public.program_sessions (request_id, name, session_type, start_at, end_at)
  select p_request_id, coalesce(name, ''), session_type, start_at, end_at
    from jsonb_to_recordset(p_sessions)
      as session(name text, session_type text, start_at timestamptz, end_at timestamptz);

  insert into public.program_request_participants (request_id, profile_id, external_email)
  select p_request_id, (participant->>'profile_id')::uuid, participant->>'external_email'
    from jsonb_array_elements(p_participants) as participant;

  perform public.record_request_edit('program', p_request_id, p_actor_id, changes);
  return p_request_id;
end;
$$;

-- Replaces only a request's participants, under the request row lock.
create function public.save_request_participants_tx(
  p_kind text,
  p_request_id uuid,
  p_participants jsonb,
  p_actor_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  request_status text;
  old_participants jsonb;
  change jsonb;
begin
  if p_kind = 'inventory' then
    select status::text into request_status
      from public.inventory_requests where id = p_request_id for update;
    if not found then raise exception 'Request not found.'; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'profile_id', rp.profile_id, 'external_email', rp.external_email
    )), '[]'::jsonb) into old_participants
      from public.inventory_request_participants rp where rp.request_id = p_request_id;
    delete from public.inventory_request_participants where request_id = p_request_id;
    insert into public.inventory_request_participants (request_id, profile_id, external_email)
    select p_request_id, (participant->>'profile_id')::uuid, participant->>'external_email'
      from jsonb_array_elements(p_participants) as participant;
  elsif p_kind = 'program' then
    select status::text into request_status
      from public.program_requests where id = p_request_id for update;
    if not found then raise exception 'Request not found.'; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'profile_id', rp.profile_id, 'external_email', rp.external_email
    )), '[]'::jsonb) into old_participants
      from public.program_request_participants rp where rp.request_id = p_request_id;
    delete from public.program_request_participants where request_id = p_request_id;
    insert into public.program_request_participants (request_id, profile_id, external_email)
    select p_request_id, (participant->>'profile_id')::uuid, participant->>'external_email'
      from jsonb_array_elements(p_participants) as participant;
  else
    raise exception 'Unknown request kind.';
  end if;

  if request_status <> 'draft' then
    change := public.activity_set_change(
      'Participants',
      public.activity_participants_json(old_participants),
      public.activity_participants_json(p_participants)
    );
    if change is not null then
      perform public.record_request_edit(p_kind, p_request_id, p_actor_id, jsonb_build_array(change));
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Workflow actions: same rules as 20261115000000_no_cancel_for_drafts.sql, but
-- the activity row is a `status` event with the old and new status.
-- ---------------------------------------------------------------------------
create or replace function public.perform_inventory_request_action_tx(
  p_request_id uuid,
  p_action text,
  p_actor_id uuid,
  p_note text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  request_status public.inventory_request_status;
  next_status public.inventory_request_status;
  requester uuid;
  actor_role public.user_role;
  is_participant boolean;
  is_approver boolean;
  action_message text;
  action_note text;
  shortages text := '';
  stock record;
  issued_quantity integer;
begin
  select role into actor_role from public.profiles where id = p_actor_id;
  if not found then
    raise exception 'You are not allowed to update this request.';
  end if;
  is_approver := actor_role in ('admin', 'approver');

  select status, requester_id into request_status, requester
    from public.inventory_requests
   where id = p_request_id
   for update;
  if not found then raise exception 'Request not found.'; end if;

  select exists (
    select 1 from public.inventory_request_participants
     where request_id = p_request_id and profile_id = p_actor_id
  ) into is_participant;

  if p_action = 'revise' then
    if request_status <> 'rejected'
       or not (is_approver or requester = p_actor_id or is_participant) then
      raise exception 'Only an accessible rejected request can be returned to draft.';
    end if;
    next_status := 'draft';
    action_message := 'Returned this rejected request to draft for revision.';
  elsif p_action = 'submit' then
    if request_status <> 'draft'
       or not (is_approver or requester = p_actor_id or is_participant) then
      raise exception 'Invalid transition.';
    end if;
    if not exists (select 1 from public.inventory_request_items where request_id = p_request_id) then
      raise exception 'At least one item is required.';
    end if;
    next_status := 'submitted';
    action_message := 'Submitted this request.';
  else
    if not is_approver then raise exception 'Approver access is required.'; end if;

    if p_action = 'approve' then
      if request_status <> 'submitted' then raise exception 'Invalid transition.'; end if;
      next_status := 'approved';
      action_message := 'Approved this request.';
    elsif p_action = 'reject' then
      if request_status <> 'submitted' then raise exception 'Invalid transition.'; end if;
      next_status := 'rejected';
      action_message := 'Rejected this request.';
    elsif p_action = 'unapprove' then
      if request_status <> 'approved' then raise exception 'Invalid transition.'; end if;
      next_status := 'submitted';
      action_message := 'Withdrew the approval of this request and returned it to submitted.';
    elsif p_action = 'reopen' then
      if request_status <> 'cancelled' then raise exception 'Invalid transition.'; end if;
      next_status := 'draft';
      action_message := 'Reopened this cancelled request as a draft.';
    elsif p_action = 'issue' then
      if request_status <> 'approved' then raise exception 'Invalid transition.'; end if;

      -- Stable lock order prevents deadlocks when requests contain several types.
      perform 1
        from public.inventory_types t
       where exists (
         select 1 from public.inventory_request_items i
          where i.request_id = p_request_id and i.inventory_type_id = t.id
       )
       order by t.id
       for update;

      if exists (
        select 1
          from public.inventory_request_item_labels a
          join public.inventory_request_items i on i.id = a.request_item_id
         where i.request_id = p_request_id
         group by a.inventory_type_label_id
        having count(*) > 1
      ) then
        raise exception 'A label was scanned more than once for this request.';
      end if;

      if exists (
        select 1
          from public.inventory_request_item_labels current_label
          join public.inventory_request_items current_item
            on current_item.id = current_label.request_item_id
          join public.inventory_request_item_labels used_label
            on used_label.inventory_type_label_id = current_label.inventory_type_label_id
          join public.inventory_request_items used_item
            on used_item.id = used_label.request_item_id
          join public.inventory_requests used_request
            on used_request.id = used_item.request_id and used_request.status = 'issued'
         where current_item.request_id = p_request_id
           and used_request.id <> p_request_id
      ) then
        raise exception 'This inventory label is already assigned to an issued request.';
      end if;

      update public.inventory_request_items i
         set quantity = label_counts.label_count
        from (
          select request_item_id, count(*)::integer as label_count
            from public.inventory_request_item_labels
           group by request_item_id
        ) label_counts
       where i.id = label_counts.request_item_id
         and i.request_id = p_request_id
         and label_counts.label_count > i.quantity;

      for stock in
        select t.id,
               t.total_quantity,
               coalesce(nullif(trim(concat_ws(' · ', nullif(t.brand, ''), nullif(t.name, ''))), ''), 'Unnamed item') as item_name,
               sum(i.quantity)::integer as requested_quantity
          from public.inventory_request_items i
          join public.inventory_types t on t.id = i.inventory_type_id
         where i.request_id = p_request_id
         group by t.id, t.total_quantity, t.brand, t.name
      loop
        select coalesce(sum(other_item.quantity), 0)::integer
          into issued_quantity
          from public.inventory_request_items other_item
          join public.inventory_requests other_request on other_request.id = other_item.request_id
         where other_item.inventory_type_id = stock.id
           and other_request.status = 'issued'
           and other_request.id <> p_request_id;

        if stock.total_quantity is not null
           and stock.total_quantity - issued_quantity < stock.requested_quantity then
          shortages := shortages
            || case when shortages = '' then '' else E'\n' end
            || '- ' || stock.item_name
            || ' — Requested: ' || stock.requested_quantity
            || ', Available: ' || greatest(stock.total_quantity - issued_quantity, 0);
        end if;
      end loop;

      if shortages <> '' then
        raise exception 'Unable to issue inventory request. The following item(s) have insufficient inventory:%', E'\n' || shortages;
      end if;
      next_status := 'issued';
      action_message := 'Issued the equipment.';
    elsif p_action = 'cancel' then
      if request_status not in ('submitted', 'approved') then
        raise exception 'Invalid transition.';
      end if;
      next_status := 'cancelled';
      action_message := 'Cancelled this request.';
    elsif p_action = 'close' then
      if request_status = 'issued' then
        if not exists (select 1 from public.inventory_request_items where request_id = p_request_id)
           or exists (
             select 1 from public.inventory_request_items
              where request_id = p_request_id and return_condition is null
           ) then
          raise exception 'Please configure return status for all the issued inventory items before closing the request.';
        end if;
      elsif request_status not in ('rejected', 'cancelled') then
        raise exception 'Invalid transition.';
      end if;
      next_status := 'closed';
      action_message := 'Closed this request.';
    else
      raise exception 'Unsupported action.';
    end if;

    if coalesce(trim(p_note), '') <> '' then
      action_note := trim(p_note);
      action_message := action_message || ' ' || action_note;
    end if;
  end if;

  update public.inventory_requests set status = next_status where id = p_request_id;
  insert into public.comments (inventory_request_id, author_id, message, kind, data)
    values (
      p_request_id, p_actor_id, action_message, 'status',
      jsonb_build_object(
        'from', request_status::text, 'to', next_status::text,
        'action', p_action, 'note', action_note
      )
    );
  return next_status::text;
end;
$$;

create or replace function public.perform_program_request_action_tx(
  p_request_id uuid,
  p_action text,
  p_actor_id uuid,
  p_note text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  request_status public.program_request_status;
  next_status public.program_request_status;
  requester uuid;
  request_place uuid;
  actor_role public.user_role;
  is_participant boolean;
  is_approver boolean;
  action_message text;
  action_note text;
  blocking_name text;
begin
  select role into actor_role from public.profiles where id = p_actor_id;
  if not found then raise exception 'You are not allowed to update this request.'; end if;
  is_approver := actor_role in ('admin', 'approver');

  select status, requester_id, place_id into request_status, requester, request_place
    from public.program_requests
   where id = p_request_id
   for update;
  if not found then raise exception 'Request not found.'; end if;

  select exists (
    select 1 from public.program_request_participants
     where request_id = p_request_id and profile_id = p_actor_id
  ) into is_participant;

  if p_action = 'revise' then
    if request_status <> 'rejected'
       or not (is_approver or requester = p_actor_id or is_participant) then
      raise exception 'Only an accessible rejected request can be returned to draft.';
    end if;
    next_status := 'draft';
    action_message := 'Returned this rejected request to draft for revision.';
  elsif p_action = 'submit' then
    if request_status <> 'draft'
       or not (is_approver or requester = p_actor_id or is_participant) then
      raise exception 'Invalid transition.';
    end if;
    if not exists (select 1 from public.program_sessions where request_id = p_request_id) then
      raise exception 'At least one session is required.';
    end if;
    if not is_approver then
      select b.name into blocking_name
        from public.program_sessions s
        join public.blocks b
          on b.place_id is null and s.start_at < b.end_at and b.start_at < s.end_at
       where s.request_id = p_request_id
       limit 1;
      if blocking_name is not null then
        raise exception 'This request overlaps with a blocked time: %', blocking_name;
      end if;
    end if;
    next_status := 'submitted';
    action_message := 'Submitted this request.';
  else
    if not is_approver then raise exception 'Approver access is required.'; end if;

    if p_action = 'approve' then
      if request_status <> 'submitted' then raise exception 'Invalid transition.'; end if;
      if request_place is null then raise exception 'A place must be assigned before approval.'; end if;

      perform 1 from public.places where id = request_place for update;
      if exists (
        select 1
          from public.program_sessions current_session
          join public.program_requests other_request
            on other_request.place_id = request_place
           and other_request.status = 'approved'
           and other_request.id <> p_request_id
          join public.program_sessions other_session on other_session.request_id = other_request.id
         where current_session.request_id = p_request_id
           and current_session.start_at < other_session.end_at + interval '1 hour'
           and other_session.start_at < current_session.end_at + interval '1 hour'
      ) then
        raise exception 'This place is unavailable: its session is within one hour of another scheduled program.';
      end if;
      next_status := 'approved';
      action_message := 'Approved this request.';
    elsif p_action = 'reject' then
      if request_status <> 'submitted' then raise exception 'Invalid transition.'; end if;
      next_status := 'rejected';
      action_message := 'Rejected this request.';
    elsif p_action = 'unapprove' then
      if request_status <> 'approved' then raise exception 'Invalid transition.'; end if;
      next_status := 'submitted';
      action_message := 'Withdrew the approval of this request and returned it to submitted.';
    elsif p_action = 'reopen' then
      if request_status <> 'cancelled' then raise exception 'Invalid transition.'; end if;
      next_status := 'draft';
      action_message := 'Reopened this cancelled request as a draft.';
    elsif p_action = 'cancel' then
      if request_status not in ('submitted', 'approved') then
        raise exception 'Invalid transition.';
      end if;
      if request_status = 'approved' and not exists (
        select 1 from public.program_sessions
         where request_id = p_request_id and end_at >= now()
      ) then
        raise exception 'Cannot cancel an approved past program.';
      end if;
      next_status := 'cancelled';
      action_message := 'Cancelled this request.';
    else
      raise exception 'Unsupported action.';
    end if;

    if coalesce(trim(p_note), '') <> '' then
      action_note := trim(p_note);
      action_message := action_message || ' ' || action_note;
    end if;
  end if;

  update public.program_requests set status = next_status where id = p_request_id;
  insert into public.comments (program_request_id, author_id, message, kind, data)
    values (
      p_request_id, p_actor_id, action_message, 'status',
      jsonb_build_object(
        'from', request_status::text, 'to', next_status::text,
        'action', p_action, 'note', action_note
      )
    );
  return next_status::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Comment email: status events email like comments always have (the body says
-- the status changed); edit events send nothing.
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_comment_emails()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_name text;
  requester_email citext;
  cc_emails citext[];
  request_path text;
  author_name text;
  sessions jsonb := '[]'::jsonb;
  items jsonb := '[]'::jsonb;
begin
  if new.kind = 'edit' then return new; end if;

  select coalesce(new.author_name, p.name, 'Setu Bot')
    into author_name
    from public.profiles p
   where p.id = new.author_id;
  author_name := coalesce(author_name, new.author_name, 'Setu Bot');

  if new.inventory_request_id is not null then
    select r.name, p.email, '/inventory/' || r.id::text
      into target_name, requester_email, request_path
      from public.inventory_requests r
      join public.profiles p on p.id = r.requester_id
     where r.id = new.inventory_request_id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'name', concat_ws(' · ', nullif(t.brand, ''), nullif(t.name, ''), nullif(t.model, '')),
      'quantity', i.quantity
    ) order by t.name), '[]'::jsonb)
      into items
      from public.inventory_request_items i
      join public.inventory_types t on t.id = i.inventory_type_id
     where i.request_id = new.inventory_request_id;

    select coalesce(array_agg(distinct recipients.email order by recipients.email)
      filter (where recipients.email is not null
        and lower(recipients.email::text) <> lower(requester_email::text)), '{}')
      into cc_emails
      from (
        select p.email
          from public.inventory_request_participants rp
          join public.profiles p on p.id = rp.profile_id
         where rp.request_id = new.inventory_request_id
        union all
        select rp.external_email
          from public.inventory_request_participants rp
         where rp.request_id = new.inventory_request_id
        union all
        select p.email from public.profiles p where p.id = new.author_id
      ) recipients;
  elsif new.program_request_id is not null then
    select r.name, p.email, '/programs/' || r.id::text
      into target_name, requester_email, request_path
      from public.program_requests r
      join public.profiles p on p.id = r.requester_id
     where r.id = new.program_request_id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'name', s.name,
      'type', s.session_type,
      'startAt', s.start_at,
      'endAt', s.end_at
    ) order by s.start_at), '[]'::jsonb)
      into sessions
      from public.program_sessions s
     where s.request_id = new.program_request_id;

    select coalesce(array_agg(distinct recipients.email order by recipients.email)
      filter (where recipients.email is not null
        and lower(recipients.email::text) <> lower(requester_email::text)), '{}')
      into cc_emails
      from (
        select p.email
          from public.program_request_participants rp
          join public.profiles p on p.id = rp.profile_id
         where rp.request_id = new.program_request_id
        union all
        select rp.external_email
          from public.program_request_participants rp
         where rp.request_id = new.program_request_id
        union all
        select p.email from public.profiles p where p.id = new.author_id
      ) recipients;
  end if;

  if requester_email is not null then
    insert into public.email_outbox (idempotency_key, template, comment_id, recipient, payload)
    values (
      'comment:' || new.id::text,
      'comment',
      new.id,
      requester_email,
      jsonb_build_object(
        'commentId', new.id,
        'targetType', case when new.inventory_request_id is not null then 'inventory_request' else 'program_request' end,
        'targetId', coalesce(new.inventory_request_id, new.program_request_id),
        'targetName', coalesce(target_name, ''),
        'authorId', new.author_id,
        'authorName', author_name,
        'message', new.message,
        'kind', new.kind,
        'statusFrom', new.data->>'from',
        'statusTo', new.data->>'to',
        'statusNote', new.data->>'note',
        'cc', to_jsonb(cc_emails),
        'requestPath', request_path,
        'automatedReminder', new.message like 'This is a reminder that the equipment you borrowed was due to be returned on %'
          and new.inventory_request_id is not null,
        'sessions', sessions,
        'items', items
      )
    )
    on conflict (idempotency_key) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.enqueue_comment_emails() from public;

-- Internal helpers: the app roles never call them directly.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.activity_change(text, text, text)',
    'public.activity_set_change(text, jsonb, jsonb)',
    'public.activity_participants_json(jsonb)',
    'public.activity_sessions_json(jsonb)',
    'public.activity_inventory_items(jsonb)',
    'public.activity_diff_items(jsonb, jsonb)',
    'public.activity_inventory_changes(public.inventory_requests, jsonb, jsonb, jsonb)',
    'public.activity_program_changes(public.program_requests, jsonb, jsonb, jsonb)',
    'public.record_request_edit(text, uuid, uuid, jsonb)',
    'public.save_inventory_request_tx(text, uuid, jsonb, jsonb, jsonb, text, uuid)',
    'public.save_program_request_tx(text, uuid, jsonb, jsonb, jsonb, text, uuid)',
    'public.save_request_participants_tx(text, uuid, jsonb, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
