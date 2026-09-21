-- short_name was declared `unique`, which also enforces uniqueness on the
-- empty string. Since the UI treats short name as optional, this meant only
-- one department could ever be saved with a blank short name — every
-- subsequent one failed with a unique violation misreported to the user as
-- "a department with this name already exists". Relax it to a partial
-- unique index, matching the pattern already used for
-- inventory_request_participants above.
alter table public.departments drop constraint departments_short_name_key;

create unique index departments_short_name_key
  on public.departments (short_name)
  where short_name <> '';
