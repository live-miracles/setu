-- performProgramRequestAction (ported from src/Programs.ts) only requires a
-- place before the 'approve' transition ("A place must be assigned before
-- approval."), and createProgramRequest/updateProgramRequest both allow
-- creating or editing a draft with no place chosen yet. The initial schema
-- declared place_id NOT NULL, which made that draft-without-a-place state
-- impossible to store — this was a gap in the migration, not a deliberate
-- tightening of the business rule.
alter table public.program_requests alter column place_id drop not null;
