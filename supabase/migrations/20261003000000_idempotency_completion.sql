-- `result is null` cannot distinguish an in-flight request from a completed
-- mutation whose natural result is null (for example deletes and participant
-- updates). Track completion separately so retrying those operations returns
-- the stored null result instead of reporting that they are still running.
alter table public.idempotency_keys
  add column completed boolean not null default false;

-- Existing keys are at most six hours old. Treat them as completed during the
-- upgrade: replaying a previously successful void mutation is riskier than
-- returning its null result, and genuinely failed mutations remove their key.
update public.idempotency_keys set completed = true;
