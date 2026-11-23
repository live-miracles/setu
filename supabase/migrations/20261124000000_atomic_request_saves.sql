-- Atomic saves for requests.
--
-- Creating or editing a request used to be a TypeScript sequence of statements
-- (insert the request, delete its children, insert each child), so a failure
-- part-way left a request without its items or sessions, and the place
-- availability check ran outside the lock that approval takes. These functions
-- do the whole save in one transaction; the edge function authorizes and
-- validates first and passes the validated values in as JSON.
--
-- p_expected_status is the status the caller authorized against. If the locked
-- row has moved on (another approver acted in between), the save is refused
-- instead of editing a request the caller was no longer allowed to edit.
--
-- On create, p_request_id is chosen by the client and doubles as the
-- idempotency key: a replayed create finds the row already there and returns
-- it unchanged, so no separate idempotency table is needed.

create or replace function public.save_inventory_request_tx(
  p_mode text,
  p_request_id uuid,
  p_fields jsonb,
  p_items jsonb,
  p_participants jsonb,
  p_expected_status text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_status text;
  current_requester uuid;
  inserted uuid;
  item jsonb;
  item_id uuid;
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
    select status::text into current_status
      from public.inventory_requests where id = p_request_id for update;
    if not found then raise exception 'Request not found.'; end if;
    if current_status <> p_expected_status then
      raise exception 'This request changed while you were editing it. Reload and try again.';
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

  return p_request_id;
end;
$$;

create or replace function public.save_program_request_tx(
  p_mode text,
  p_request_id uuid,
  p_fields jsonb,
  p_sessions jsonb,
  p_participants jsonb,
  p_expected_status text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_status text;
  current_requester uuid;
  inserted uuid;
  request_place uuid := (p_fields->>'place_id')::uuid;
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
    select status::text into current_status
      from public.program_requests where id = p_request_id for update;
    if not found then raise exception 'Request not found.'; end if;
    if current_status <> p_expected_status then
      raise exception 'This request changed while you were editing it. Reload and try again.';
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

  return p_request_id;
end;
$$;

-- Replaces only a request's participants, under the request row lock.
create or replace function public.save_request_participants_tx(
  p_kind text,
  p_request_id uuid,
  p_participants jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_kind = 'inventory' then
    perform 1 from public.inventory_requests where id = p_request_id for update;
    if not found then raise exception 'Request not found.'; end if;
    delete from public.inventory_request_participants where request_id = p_request_id;
    insert into public.inventory_request_participants (request_id, profile_id, external_email)
    select p_request_id, (participant->>'profile_id')::uuid, participant->>'external_email'
      from jsonb_array_elements(p_participants) as participant;
  elsif p_kind = 'program' then
    perform 1 from public.program_requests where id = p_request_id for update;
    if not found then raise exception 'Request not found.'; end if;
    delete from public.program_request_participants where request_id = p_request_id;
    insert into public.program_request_participants (request_id, profile_id, external_email)
    select p_request_id, (participant->>'profile_id')::uuid, participant->>'external_email'
      from jsonb_array_elements(p_participants) as participant;
  else
    raise exception 'Unknown request kind.';
  end if;
end;
$$;

revoke all on function public.save_inventory_request_tx(text, uuid, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.save_inventory_request_tx(text, uuid, jsonb, jsonb, jsonb, text) to service_role;
revoke all on function public.save_program_request_tx(text, uuid, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.save_program_request_tx(text, uuid, jsonb, jsonb, jsonb, text) to service_role;
revoke all on function public.save_request_participants_tx(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_request_participants_tx(text, uuid, jsonb) to service_role;
