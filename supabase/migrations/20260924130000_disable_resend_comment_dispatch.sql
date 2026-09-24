-- Comment delivery now runs from the existing Apps Script deployment. Stop
-- the old Supabase cron caller so it cannot claim rows ahead of that worker.
do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
    from cron.job
   where jobname = 'setu-comment-email-dispatch';
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end;
$$;

-- A trigger can be interrupted after claiming rows. Reclaim those rows on the
-- next run instead of leaving them permanently stuck in processing.
create or replace function public.claim_comment_email_batch(batch_size integer default 100)
returns setof public.email_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimed as (
    select id
      from public.email_outbox
     where (
       status = 'pending'
       or (status = 'processing' and updated_at < now() - interval '15 minutes')
     )
       and next_attempt_at <= now()
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
