-- rosters.name is always one of the shift_types names today (the roster
-- form's "Shift" field is a closed select over shiftTypes, never free text —
-- see frontend/src/sections/roster.tsx), but nothing enforced that at the
-- database level, so a renamed or deleted shift type silently orphaned
-- existing roster rows instead of cascading like every other name-keyed
-- reference in this schema (program_requests.language/program_type,
-- program_sessions.session_type). Both projects currently have zero roster
-- rows with a name that doesn't match an existing shift type, so this adds
-- the constraint directly rather than needing a backfill.
alter table public.rosters
  add constraint rosters_name_fkey foreign key (name) references public.shift_types (name)
  on update cascade on delete restrict;
