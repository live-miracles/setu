-- Small hardening of three checks that trusted their input a little too much.

-- 1. An address must have exactly one "@" with text on both sides before the
--    domain allowlist is consulted. Before, a blank address passed whenever the
--    allowlist was empty, and an address with two "@" was judged by its middle
--    part. The rule matches requests to a signed-in user by profile email, so a
--    user without a real address must never get in. CREATE OR REPLACE keeps the
--    existing grants.
create or replace function public.is_email_domain_allowed(candidate_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(candidate_email, '') ~ '^[^@[:space:]]+@[^@[:space:]]+$'
    and (
      not exists (select 1 from public.allowed_email_domains where enabled)
      or exists (
        select 1 from public.allowed_email_domains
        where enabled and lower(domain::text) = lower(split_part(candidate_email, '@', 2))
      )
    )
$$;

-- 2. A comment's time is when it was posted. The Data API insert policy checks
--    who writes a comment but not its created_at, so a signed-in user could
--    back- or future-date one and move it in the activity order. The server
--    clock now decides for every insert made as a signed-in user; the service
--    role (status and edit events, reminders) is unaffected.
create or replace function public.set_comment_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    new.created_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.set_comment_created_at() from public, anon, authenticated;

drop trigger if exists comments_set_created_at on public.comments;
create trigger comments_set_created_at
  before insert on public.comments
  for each row execute procedure public.set_comment_created_at();

-- 3. The daily overdue reminder is skipped when one was already posted today.
--    Only reminders the system wrote count (they have no author), so a comment
--    a person types with the same opening words no longer suppresses it.
create or replace function public.create_overdue_inventory_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.comments (inventory_request_id, author_id, author_name, message)
  select r.id,
         null,
         'Setu Bot',
         format(
           'This is a reminder that the equipment you borrowed was due to be returned on %s. Please return the equipment, or let us know if there''s any issue from your end.',
           to_char(r.end_date, 'FMDD Mon YYYY')
         )
    from public.inventory_requests r
   where r.status = 'issued'
     and r.end_date < current_date - 1
     and not exists (
       select 1
         from public.comments c
        where c.inventory_request_id = r.id
          and c.author_id is null
          and c.created_at::date = current_date
          and c.message like 'This is a reminder that the equipment you borrowed was due to be returned on %'
     );
end;
$$;

revoke all on function public.create_overdue_inventory_reminders() from public, anon, authenticated;
