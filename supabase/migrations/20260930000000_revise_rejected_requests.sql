-- Keep the status change and its activity entry atomic. Only the trusted
-- API may supply an actor; browser roles must not impersonate another user.
create or replace function public.revise_rejected_request(
  p_kind text,
  p_request_id uuid,
  p_actor_id uuid
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  request_status text;
  requester uuid;
  is_participant boolean;
  is_approver boolean;
begin
  select role in ('admin', 'approver') into is_approver
    from public.profiles where id = p_actor_id;
  if not found then
    raise exception 'You are not allowed to revise this request.';
  end if;

  if p_kind = 'inventory_request' then
    select status::text, requester_id into request_status, requester
      from public.inventory_requests where id = p_request_id for update;
    select exists (
      select 1 from public.inventory_request_participants
      where request_id = p_request_id and profile_id = p_actor_id
    ) into is_participant;
  elsif p_kind = 'program_request' then
    select status::text, requester_id into request_status, requester
      from public.program_requests where id = p_request_id for update;
    select exists (
      select 1 from public.program_request_participants
      where request_id = p_request_id and profile_id = p_actor_id
    ) into is_participant;
  else
    raise exception 'Unsupported request type.';
  end if;

  if request_status is null or not (is_approver or requester = p_actor_id or is_participant) then
    raise exception 'You are not allowed to revise this request.';
  end if;
  if request_status <> 'rejected' then
    raise exception 'Only rejected requests can be returned to draft. Refresh and try again.';
  end if;

  if p_kind = 'inventory_request' then
    update public.inventory_requests set status = 'draft' where id = p_request_id;
    insert into public.comments (inventory_request_id, author_id, message)
      values (p_request_id, p_actor_id, 'Returned this rejected request to draft for revision.');
  else
    update public.program_requests set status = 'draft' where id = p_request_id;
    insert into public.comments (program_request_id, author_id, message)
      values (p_request_id, p_actor_id, 'Returned this rejected request to draft for revision.');
  end if;
  return 'draft';
end;
$$;

revoke all on function public.revise_rejected_request(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.revise_rejected_request(text, uuid, uuid) to service_role;
