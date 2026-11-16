-- Roster start/end times are optional. start_at/end_at stay NOT NULL (the date
-- is still required): a blank time is stored as the start (00:00) or end
-- (23:59:59) of its day, and these flags record that the time was left blank
-- so it is read back as empty instead of 00:00 / 23:59.
alter table public.rosters
  add column start_time_set boolean not null default true,
  add column end_time_set boolean not null default true;
