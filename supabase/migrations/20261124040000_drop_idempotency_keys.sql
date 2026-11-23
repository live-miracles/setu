-- The idempotency ledger is retired. The edge function stopped writing to it in
-- the release that shipped 20261124010000 (a create now uses the client's id as
-- the row id), and the daily cleanup no longer touches it, so nothing reads or
-- writes the table any more.
drop table if exists public.idempotency_keys;
