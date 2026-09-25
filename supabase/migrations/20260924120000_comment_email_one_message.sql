-- One comment produces one email: requester is To, all other stakeholders
-- are CC. This keeps delivery state at the comment level while preserving the
-- outbox's retry and audit behavior.
alter table public.email_outbox
  add column comment_id uuid references public.comments(id) on delete cascade;

create unique index email_outbox_one_comment_email
  on public.email_outbox (comment_id)
  where template = 'comment' and comment_id is not null;

-- Any rows created by the former one-row-per-recipient trigger must not be
-- delivered after this migration, otherwise one old comment could still send
-- several messages. New comments use the one-row format below.
update public.email_outbox
   set status = 'failed',
       last_error = 'Superseded by one-email-per-comment delivery change'
 where template = 'comment'
   and status in ('pending', 'processing');

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
begin
  if new.target_type = 'inventory_request' then
    select r.name, p.email
      into target_name, requester_email
      from public.inventory_requests r
      join public.profiles p on p.id = r.requester_id
     where r.id = new.target_id;

    select coalesce(array_agg(distinct recipients.email order by recipients.email)
      filter (where recipients.email is not null
        and lower(recipients.email::text) <> lower(requester_email::text)), '{}')
      into cc_emails
      from (
        select r.lead_email as email
          from public.inventory_requests r where r.id = new.target_id
        union all
        select p.email
          from public.inventory_request_participants rp
          join public.profiles p on p.id = rp.profile_id
         where rp.request_id = new.target_id
        union all
        select rp.external_email
          from public.inventory_request_participants rp
         where rp.request_id = new.target_id
        union all
        select p.email
          from public.profiles p where p.id = new.author_id
      ) recipients;
  elsif new.target_type = 'program_request' then
    select r.name, p.email
      into target_name, requester_email
      from public.program_requests r
      join public.profiles p on p.id = r.requester_id
     where r.id = new.target_id;

    select coalesce(array_agg(distinct recipients.email order by recipients.email)
      filter (where recipients.email is not null
        and lower(recipients.email::text) <> lower(requester_email::text)), '{}')
      into cc_emails
      from (
        select r.lead_email as email
          from public.program_requests r where r.id = new.target_id
        union all
        select p.email
          from public.program_request_participants rp
          join public.profiles p on p.id = rp.profile_id
         where rp.request_id = new.target_id
        union all
        select rp.external_email
          from public.program_request_participants rp
         where rp.request_id = new.target_id
        union all
        select p.email
          from public.profiles p where p.id = new.author_id
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
        'targetType', new.target_type,
        'targetId', new.target_id,
        'targetName', coalesce(target_name, ''),
        'authorId', new.author_id,
        'message', new.message,
        'cc', to_jsonb(cc_emails)
      )
    )
    on conflict (idempotency_key) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.enqueue_comment_emails() from public;
