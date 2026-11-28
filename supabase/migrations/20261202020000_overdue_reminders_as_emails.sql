-- Overdue inventory reminders are sent as emails, no longer posted as "Setu
-- Bot" comments. The daily job queues one email per overdue request per day in
-- the outbox, where the email dispatcher sends it like a comment email: same
-- recipients (the requester, with the request's participants and the admin CC
-- list copied), same layout and same Gmail conversation. The request's activity
-- no longer fills up with reminders, and the outbox row is the record that one
-- was sent.
--
-- Timing is unchanged (20261119000000): no reminder on the due date or the grace
-- day after it, then one a day until the request leaves "issued". The
-- idempotency key (request and date) is what keeps it to one a day.

create or replace function public.create_overdue_inventory_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.email_outbox (idempotency_key, template, recipient, payload)
  select 'overdue-reminder:' || r.id::text || ':' || current_date::text,
         'overdue_reminder',
         requester.email,
         jsonb_build_object(
           'targetType', 'inventory_request',
           'targetId', r.id,
           'targetName', r.name,
           'authorName', 'Setu Bot',
           'kind', 'reminder',
           'message', format(
             'This is a reminder that the equipment you borrowed was due to be returned on %s. Please return the equipment, or let us know if there''s any issue from your end.',
             to_char(r.end_date, 'FMDD Mon YYYY')
           ),
           'cc', to_jsonb(coalesce(cc.emails, '{}'::citext[])),
           'requestPath', '/inventory/' || r.id::text,
           'requestSerial', 'REQ-' || r.display_id,
           'requestTitle', coalesce(nullif(r.name, ''), 'Unnamed request'),
           'requestMonthYear', to_char(r.start_date, 'Mon YYYY'),
           'items', coalesce(items.list, '[]'::jsonb)
         )
    from public.inventory_requests r
    join public.profiles requester on requester.id = r.requester_id
    -- The participants, with or without an account, other than the requester.
    left join lateral (
      select array_agg(distinct recipients.email order by recipients.email) as emails
        from (
          select p.email
            from public.inventory_request_participants rp
            join public.profiles p on p.id = rp.profile_id
           where rp.request_id = r.id
          union all
          select rp.external_email
            from public.inventory_request_participants rp
           where rp.request_id = r.id
        ) recipients
       where recipients.email is not null
         and lower(recipients.email::text) <> lower(requester.email::text)
    ) cc on true
    left join lateral (
      select jsonb_agg(jsonb_build_object(
               'name', concat_ws(' · ', nullif(t.brand, ''), nullif(t.name, ''), nullif(t.model, '')),
               'quantity', i.quantity
             ) order by t.name) as list
        from public.inventory_request_items i
        join public.inventory_types t on t.id = i.inventory_type_id
       where i.request_id = r.id
    ) items on true
   where r.status = 'issued'
     and r.end_date < current_date - 1
     and requester.email <> ''
  on conflict (idempotency_key) do nothing;
end;
$$;

revoke all on function public.create_overdue_inventory_reminders() from public, anon, authenticated;

-- The dispatcher puts a request's emails in one Gmail conversation by finding
-- the first one already sent for it; reminders now take part in that lookup.
drop index if exists public.email_outbox_comment_thread_idx;
create index email_outbox_comment_thread_idx
  on public.email_outbox ((payload ->> 'targetId'), sent_at)
  where template in ('comment', 'overdue_reminder')
    and status = 'sent'
    and provider_thread_id is not null;
