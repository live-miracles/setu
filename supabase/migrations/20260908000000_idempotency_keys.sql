-- Replaces the Apps Script backend's CacheService-based dedupe ledger
-- (withLockedDedupe in src/Dedupe.ts): every create/update/delete/action
-- operation is called with a client-generated request id (>= 8 characters),
-- and a retried delivery of the same (scope, request_id) pair must return
-- the original result instead of applying the mutation twice.
--
-- The insert itself is the atomic claim (the primary key rejects a second
-- claim of the same key outright); the Edge Function fills in `result` once
-- the mutation completes, and deletes the row again if the mutation throws,
-- so a genuinely failed attempt can be retried with the same request id.
-- Only ever touched by Edge Functions via the service-role client — no
-- policies are needed since RLS default-denies everyone else.
create table public.idempotency_keys (
  scope text not null,
  request_id text not null check (length(request_id) >= 8),
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (scope, request_id)
);
alter table public.idempotency_keys enable row level security;

-- Bounds the table's growth; a retried call is only ever a client-side
-- double-submit within the same session, not something replayed weeks
-- later (mirrors the old cache's 6-hour TTL, generously rounded up).
create index idempotency_keys_created_at_idx on public.idempotency_keys (created_at);
