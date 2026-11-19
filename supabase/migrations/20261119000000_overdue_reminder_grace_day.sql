-- Give borrowers one extra day to return equipment before the daily reminder
-- emails start, and write the due date in the reminder as "16 Nov 2026"
-- instead of the ambiguous "11/16/2026".
--
-- Timeline for a request whose end_date is 16 November:
--   16 Nov  due date
--   17 Nov  grace day; the app already shows the request as overdue
--   18 Nov  first reminder comment (and email); one per day after that
--
-- The reminder wording keeps the prefix that enqueue_comment_emails() and the
-- once-a-day check below match on.
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
          and c.created_at::date = current_date
          and c.message like 'This is a reminder that the equipment you borrowed was due to be returned on %'
     );
end;
$$;

revoke all on function public.create_overdue_inventory_reminders() from public;
