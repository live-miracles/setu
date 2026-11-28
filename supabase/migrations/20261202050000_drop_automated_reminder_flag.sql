-- Comment emails no longer carry the `automatedReminder` flag. It marked
-- comments that began with the overdue reminder's wording, but reminders are
-- now emails queued by the daily job (20261202020000), and nothing read the
-- flag. The body is otherwise that of 20261128000000_activity_events.sql;
-- CREATE OR REPLACE keeps the existing grants.

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
        'sessions', sessions,
        'items', items
      )
    )
    on conflict (idempotency_key) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.enqueue_comment_emails() from public, anon, authenticated;
