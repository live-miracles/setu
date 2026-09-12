-- comments.target_type/target_id was a polymorphic association with no real
-- foreign key: nothing enforced that target_id pointed at an existing row,
-- and deleting a request left its comments orphaned instead of cascading.
-- Both projects currently have zero comment rows, so this replaces the
-- columns outright rather than backfilling them.
--
-- The two comments policies are dropped up front (not recreated until the
-- end) for the same reason as the tickets-removal migration: a policy
-- expression referencing a column is a hard dependency that blocks dropping
-- it.

drop policy if exists "users read visible comments" on public.comments;
drop policy if exists "users insert visible comments" on public.comments;

drop index if exists public.comments_target_idx;

alter table public.comments
  drop column target_type,
  drop column target_id;
drop type if exists public.comment_target;

alter table public.comments
  add column inventory_request_id uuid references public.inventory_requests(id) on delete cascade,
  add column program_request_id uuid references public.program_requests(id) on delete cascade,
  add constraint comments_exactly_one_target
    check (num_nonnulls(inventory_request_id, program_request_id) = 1);

create index comments_inventory_request_idx on public.comments (inventory_request_id, created_at)
  where inventory_request_id is not null;
create index comments_program_request_idx on public.comments (program_request_id, created_at)
  where program_request_id is not null;

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
  if new.inventory_request_id is not null then
    select r.name into target_name from public.inventory_requests r where r.id = new.inventory_request_id;
    target_label := 'inventory request';
    for recipient_email in
      select distinct email from (
        select r.lead_email as email from public.inventory_requests r where r.id = new.inventory_request_id
        union all select p.email from public.inventory_requests r join public.profiles p on p.id = r.requester_id where r.id = new.inventory_request_id
        union all select p.email from public.inventory_request_participants rp join public.profiles p on p.id = rp.profile_id where rp.request_id = new.inventory_request_id
        union all select rp.external_email from public.inventory_request_participants rp where rp.request_id = new.inventory_request_id
      ) recipients where email is not null and lower(email::text) <> lower((select email::text from public.profiles where id = new.author_id))
    loop
      insert into public.email_outbox (idempotency_key, template, recipient, payload)
      values ('comment:' || new.id::text || ':' || lower(recipient_email::text), 'comment', recipient_email,
        jsonb_build_object('commentId', new.id, 'targetType', 'inventory_request', 'targetId', new.inventory_request_id,
          'targetName', coalesce(target_name, ''), 'authorId', new.author_id, 'message', new.message))
      on conflict (idempotency_key) do nothing;
    end loop;
  elsif new.program_request_id is not null then
    select r.name into target_name from public.program_requests r where r.id = new.program_request_id;
    target_label := 'program request';
    for recipient_email in
      select distinct email from (
        select r.lead_email as email from public.program_requests r where r.id = new.program_request_id
        union all select p.email from public.program_requests r join public.profiles p on p.id = r.requester_id where r.id = new.program_request_id
        union all select p.email from public.program_request_participants rp join public.profiles p on p.id = rp.profile_id where rp.request_id = new.program_request_id
        union all select rp.external_email from public.program_request_participants rp where rp.request_id = new.program_request_id
      ) recipients where email is not null and lower(email::text) <> lower((select email::text from public.profiles where id = new.author_id))
    loop
      insert into public.email_outbox (idempotency_key, template, recipient, payload)
      values ('comment:' || new.id::text || ':' || lower(recipient_email::text), 'comment', recipient_email,
        jsonb_build_object('commentId', new.id, 'targetType', 'program_request', 'targetId', new.program_request_id,
          'targetName', coalesce(target_name, ''), 'authorId', new.author_id, 'message', new.message))
      on conflict (idempotency_key) do nothing;
    end loop;
  end if;
  return new;
end;
$$;

create policy "users read visible comments" on public.comments for select to authenticated using (
  (inventory_request_id is not null and public.can_view_inventory_request(inventory_request_id))
  or (program_request_id is not null and public.can_view_program_request(program_request_id))
);

create policy "users insert visible comments" on public.comments for insert to authenticated
  with check (
    author_id = auth.uid() and (
      (inventory_request_id is not null and public.can_view_inventory_request(inventory_request_id))
      or (program_request_id is not null and public.can_view_program_request(program_request_id))
    )
  );
