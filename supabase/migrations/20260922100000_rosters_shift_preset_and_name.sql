-- Keep the shift preset identity separate from the optional label shown for a
-- scheduled shift. Existing rosters use the shift type name as their preset
-- value, so backfill the new UUID foreign key before removing that column.
alter table public.shift_types
  add column id uuid default gen_random_uuid();

update public.shift_types
set id = gen_random_uuid()
where id is null;

alter table public.shift_types
  alter column id set not null,
  add constraint shift_types_id_key unique (id);

alter table public.rosters
  add column shift_type_id uuid,
  add column shift_name text;

update public.rosters r
set shift_type_id = st.id
from public.shift_types st
where st.name = r.name;

alter table public.rosters
  alter column shift_type_id set not null,
  drop constraint if exists rosters_name_fkey,
  drop column name,
  add constraint rosters_shift_type_id_fkey foreign key (shift_type_id)
    references public.shift_types (id)
    on update cascade on delete restrict;
