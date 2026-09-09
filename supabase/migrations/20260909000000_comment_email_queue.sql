-- Comments are the only application event that sends email.  Queue rows are
-- created in the same transaction as the comment, so a successful comment
-- can never be silently lost by a later email failure.

create policy "users update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "users insert visible comments" on public.comments for insert to authenticated
  with check (
    author_id = auth.uid() and (
      (target_type = 'inventory_request' and public.can_view_inventory_request(target_id))
      or (target_type = 'program_request' and public.can_view_program_request(target_id))
      or (target_type = 'ticket' and public.is_approver())
    )
  );

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
  elsif new.target_type = 'ticket' then
    for recipient_email in
      select distinct p.email from public.tickets t join public.profiles p on p.id = t.assignee_id where t.id = new.target_id and p.id <> new.author_id
    loop
      insert into public.email_outbox (idempotency_key, template, recipient, payload)
      values ('comment:' || new.id::text || ':' || lower(recipient_email::text), 'comment', recipient_email,
        jsonb_build_object('commentId', new.id, 'targetType', new.target_type, 'targetId', new.target_id,
          'targetName', '', 'authorId', new.author_id, 'message', new.message))
      on conflict (idempotency_key) do nothing;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists comments_enqueue_email on public.comments;
create trigger comments_enqueue_email
  after insert on public.comments
  for each row execute procedure public.enqueue_comment_emails();

revoke all on function public.enqueue_comment_emails() from public;

create or replace function public.claim_comment_email_batch(batch_size integer default 100)
returns setof public.email_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimed as (
    select id from public.email_outbox
    where template = 'comment' and status = 'pending' and next_attempt_at <= now()
    order by created_at
    limit greatest(1, least(batch_size, 500))
    for update skip locked
  )
  update public.email_outbox e
     set status = 'processing', attempts = e.attempts + 1
    from claimed c
   where e.id = c.id
  returning e.*;
end;
$$;
revoke all on function public.claim_comment_email_batch(integer) from public;
