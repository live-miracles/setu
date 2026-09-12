alter table public.shift_types
  alter column default_start_time drop not null,
  alter column default_end_time drop not null;
