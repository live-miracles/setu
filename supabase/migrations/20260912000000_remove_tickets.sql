-- Tickets never shipped past the schema; remove the table, its status enum,
-- the 'ticket' comment target, and every policy/function branch that
-- referenced it rather than leaving dead schema behind.
--
-- The two comments policies are dropped up front (not recreated until the
-- end) because a policy expression referencing target_type is a hard
-- dependency that blocks the column's later ALTER COLUMN TYPE.

drop policy if exists "approvers read tickets" on public.tickets;
drop policy if exists "users read visible comments" on public.comments;
drop policy if exists "users insert visible comments" on public.comments;

create or replace function public.enqueue_comment_emails()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_label text;
  target_name text;
  recipient_email citext;
begin
  if new.target_type = 'inventory_request' then
    select r.name into target_name from public.inventory_requests r where r.id = new.target_id;
    target_label := 'inventory request';
    for recipient_email in
      select distinct email from (
        select r.lead_email as email from public.inventory_requests r where r.id = new.target_id
        union all select p.email from public.inventory_requests r join public.profiles p on p.id = r.requester_id where r.id = new.target_id
        union all select p.email from public.inventory_request_participants rp join public.profiles p on p.id = rp.profile_id where rp.request_id = new.target_id
        union all select rp.external_email from public.inventory_request_participants rp where rp.request_id = new.target_id
      ) recipients where email is not null and lower(email::text) <> lower((select email::text from public.profiles where id = new.author_id))
    loop
      insert into public.email_outbox (idempotency_key, template, recipient, payload)
      values ('comment:' || new.id::text || ':' || lower(recipient_email::text), 'comment', recipient_email,
        jsonb_build_object('commentId', new.id, 'targetType', new.target_type, 'targetId', new.target_id,
          'targetName', coalesce(target_name, ''), 'authorId', new.author_id, 'message', new.message))
      on conflict (idempotency_key) do nothing;
    end loop;
  elsif new.target_type = 'program_request' then
    select r.name into target_name from public.program_requests r where r.id = new.target_id;
    target_label := 'program request';
    for recipient_email in
      select distinct email from (
        select r.lead_email as email from public.program_requests r where r.id = new.target_id
        union all select p.email from public.program_requests r join public.profiles p on p.id = r.requester_id where r.id = new.target_id
        union all select p.email from public.program_request_participants rp join public.profiles p on p.id = rp.profile_id where rp.request_id = new.target_id
        union all select rp.external_email from public.program_request_participants rp where rp.request_id = new.target_id
      ) recipients where email is not null and lower(email::text) <> lower((select email::text from public.profiles where id = new.author_id))
    loop
      insert into public.email_outbox (idempotency_key, template, recipient, payload)
      values ('comment:' || new.id::text || ':' || lower(recipient_email::text), 'comment', recipient_email,
        jsonb_build_object('commentId', new.id, 'targetType', new.target_type, 'targetId', new.target_id,
          'targetName', coalesce(target_name, ''), 'authorId', new.author_id, 'message', new.message))
      on conflict (idempotency_key) do nothing;
    end loop;
  end if;
  return new;
end;
$$;

delete from public.comments where target_type = 'ticket';

drop trigger if exists tickets_set_updated_at on public.tickets;
drop table if exists public.tickets;
drop type if exists public.ticket_status;

alter type public.comment_target rename to comment_target_old;
create type public.comment_target as enum ('inventory_request', 'program_request');
alter table public.comments
  alter column target_type type public.comment_target using target_type::text::public.comment_target;
drop type public.comment_target_old;

create policy "users read visible comments" on public.comments for select to authenticated using (
  (target_type = 'inventory_request' and public.can_view_inventory_request(target_id))
  or (target_type = 'program_request' and public.can_view_program_request(target_id))
);

create policy "users insert visible comments" on public.comments for insert to authenticated
  with check (
    author_id = auth.uid() and (
      (target_type = 'inventory_request' and public.can_view_inventory_request(target_id))
      or (target_type = 'program_request' and public.can_view_program_request(target_id))
    )
  );
