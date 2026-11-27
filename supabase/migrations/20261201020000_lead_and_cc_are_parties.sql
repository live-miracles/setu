-- The workflow action functions count the request's lead, and participants
-- listed by email, as parties, like the API and the read rules do (see
-- 20261201000000). Only the is_participant lookup changes in each function; the
-- rest is the definition from 20261128000000_activity_events.sql. CREATE OR
-- REPLACE keeps the existing grants (service role only).

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

  -- A party: a participant with an account, or (matched on the actor's profile
  -- email) the request's lead or a participant listed by email. The requester is
  -- checked separately below.
  select exists (
    select 1 from public.inventory_request_participants
     where request_id = p_request_id and profile_id = p_actor_id
  ) or exists (
    select 1
      from public.inventory_requests r
      join public.profiles me on me.id = p_actor_id
     where r.id = p_request_id
       and (
         lower(r.lead_email::text) = lower(me.email::text)
         or exists (
           select 1 from public.inventory_request_participants p
            where p.request_id = r.id
              and lower(p.external_email::text) = lower(me.email::text)
         )
       )
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

  -- A party: a participant with an account, or (matched on the actor's profile
  -- email) the request's lead or a participant listed by email. The requester is
  -- checked separately below.
  select exists (
    select 1 from public.program_request_participants
     where request_id = p_request_id and profile_id = p_actor_id
  ) or exists (
    select 1
      from public.program_requests r
      join public.profiles me on me.id = p_actor_id
     where r.id = p_request_id
       and (
         lower(r.lead_email::text) = lower(me.email::text)
         or exists (
           select 1 from public.program_request_participants p
            where p.request_id = r.id
              and lower(p.external_email::text) = lower(me.email::text)
         )
       )
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
