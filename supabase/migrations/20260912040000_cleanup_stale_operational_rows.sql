-- idempotency_keys and email_outbox were both designed to be bounded (see
-- their own migration comments) but nothing ever actually pruned old rows.
-- Runs once a day since neither table needs tighter pruning than that.
create or replace function public.cleanup_stale_operational_rows()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Mirrors the old Apps Script cache's 6-hour TTL: a retried call is only
  -- ever a client-side double-submit within the same session.
  delete from public.idempotency_keys where created_at < now() - interval '6 hours';

  -- Only rows that reached a terminal state are pruned; pending/processing
  -- rows are left alone regardless of age since they still need delivery.
  delete from public.email_outbox
    where status in ('sent', 'failed') and updated_at < now() - interval '30 days';
end;
$$;

revoke all on function public.cleanup_stale_operational_rows() from public;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'setu-cleanup-stale-rows';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'setu-cleanup-stale-rows',
    '0 3 * * *',
    'select public.cleanup_stale_operational_rows();'
  );
end;
$$;
