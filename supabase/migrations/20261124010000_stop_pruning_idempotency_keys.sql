-- The idempotency ledger (a port of the Apps Script CacheService dedupe) is
-- retired: creating a request or a comment now uses the client's id as the new
-- row's primary key, so a replayed create finds its own row, and every other
-- write is either naturally repeatable or rejected by its own transition and
-- uniqueness rules.
--
-- The table itself is dropped in a later release. The previous version of the
-- edge function still writes to it until the new one is live, so dropping it in
-- the same deploy would break every write in between.

-- The daily cleanup stops pruning it; the email_outbox pruning is unchanged.
-- create or replace keeps the existing owner, search_path and grants.
create or replace function public.cleanup_stale_operational_rows()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only rows that reached a terminal state are pruned; pending/processing
  -- rows are left alone regardless of age since they still need delivery.
  delete from public.email_outbox
    where status in ('sent', 'failed') and updated_at < now() - interval '30 days';
end;
$$;
