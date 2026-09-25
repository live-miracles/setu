-- Include the same request identity shown in the detail view in every
-- comment-email subject: serial, combined title, and start month/year.

create or replace function public.enrich_comment_email_details()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_serial text;
  request_title text;
  request_month_year text;
  author_name text;
begin
  if new.template <> 'comment' or new.comment_id is null then
    return new;
  end if;

  select
    'REQ-' || r.display_id,
    coalesce(nullif(r.name, ''), 'Unnamed request'),
    to_char(r.start_date, 'Mon YYYY'),
    coalesce(c.author_name, p.name, 'Setu Bot')
    into request_serial, request_title, request_month_year, author_name
    from public.comments c
    join public.inventory_requests r on r.id = c.inventory_request_id
    left join public.profiles p on p.id = c.author_id
   where c.id = new.comment_id;

  if request_serial is null then
    select
      'PRG-' || r.display_id,
      coalesce(
        nullif(
          concat_ws(
            ' ',
            nullif(r.language, ''),
            case
              when lower(coalesce(r.program_type, '')) = 'other' then null
              else nullif(r.program_type, '')
            end,
            nullif(r.name, '')
          ),
          ''
        ),
        'Unnamed program'
      ),
      to_char(min(s.start_at), 'Mon YYYY'),
      coalesce(c.author_name, p.name, 'Setu Bot')
      into request_serial, request_title, request_month_year, author_name
      from public.comments c
      join public.program_requests r on r.id = c.program_request_id
      left join public.program_sessions s on s.request_id = r.id
      left join public.profiles p on p.id = c.author_id
     where c.id = new.comment_id
     group by c.id, c.author_name, c.author_id, p.name,
              r.id, r.display_id, r.language, r.program_type, r.name;
  end if;

  update public.email_outbox
     set payload = payload || jsonb_build_object(
       'requestSerial', request_serial,
       'requestTitle', request_title,
       'requestMonthYear', request_month_year,
       'authorName', coalesce(author_name, 'Setu Bot')
     )
   where id = new.id;

  return new;
end;
$$;

revoke all on function public.enrich_comment_email_details() from public;

-- Enrich rows already in the outbox as well as future rows.
with subject_data as (
  select
    e.id,
    'REQ-' || r.display_id as request_serial,
    coalesce(nullif(r.name, ''), 'Unnamed request') as request_title,
    to_char(r.start_date, 'Mon YYYY') as request_month_year,
    coalesce(c.author_name, p.name, 'Setu Bot') as author_name
    from public.email_outbox e
    join public.comments c on c.id = e.comment_id
    join public.inventory_requests r on r.id = c.inventory_request_id
    left join public.profiles p on p.id = c.author_id
   where e.template = 'comment'
  union all
  select
    e.id,
    'PRG-' || r.display_id,
    coalesce(
      nullif(
        concat_ws(
          ' ',
          nullif(r.language, ''),
          case
            when lower(coalesce(r.program_type, '')) = 'other' then null
            else nullif(r.program_type, '')
          end,
          nullif(r.name, '')
        ),
        ''
      ),
      'Unnamed program'
    ),
    to_char(min(s.start_at), 'Mon YYYY'),
    coalesce(c.author_name, p.name, 'Setu Bot')
    from public.email_outbox e
    join public.comments c on c.id = e.comment_id
    join public.program_requests r on r.id = c.program_request_id
    left join public.program_sessions s on s.request_id = r.id
    left join public.profiles p on p.id = c.author_id
   where e.template = 'comment'
   group by e.id, c.id, c.author_name, c.author_id, p.name,
            r.id, r.display_id, r.language, r.program_type, r.name
)
update public.email_outbox e
   set payload = e.payload || jsonb_build_object(
     'requestSerial', d.request_serial,
     'requestTitle', d.request_title,
     'requestMonthYear', d.request_month_year,
     'authorName', d.author_name
   )
  from subject_data d
 where e.id = d.id;

drop trigger if exists email_outbox_enrich_comment_details on public.email_outbox;
create trigger email_outbox_enrich_comment_details
  after insert on public.email_outbox
  for each row execute procedure public.enrich_comment_email_details();
