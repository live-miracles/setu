-- Inventory locations become a managed list (like program places) instead of
-- free text, so one place is never spelled two ways and a rename applies to
-- every item that sits there.
create table public.inventory_places (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger inventory_places_set_updated_at before update on public.inventory_places
  for each row execute procedure public.set_updated_at();

alter table public.inventory_places enable row level security;
create policy "authenticated users read inventory places"
  on public.inventory_places for select to authenticated using (true);

-- One place per distinct location text already in use on a type or a label.
insert into public.inventory_places (name)
select distinct btrim(location)
from (
  select location from public.inventory_types
  union all
  select location from public.inventory_type_labels
) used
where btrim(location) <> '';

-- A place cannot be deleted while a type or label still points at it. A label
-- without a place falls back to its type's place, as before.
alter table public.inventory_types
  add column location_id uuid references public.inventory_places(id) on delete restrict;
alter table public.inventory_type_labels
  add column location_id uuid references public.inventory_places(id) on delete restrict;

update public.inventory_types t
set location_id = p.id
from public.inventory_places p
where btrim(t.location) = p.name;

update public.inventory_type_labels l
set location_id = p.id
from public.inventory_places p
where btrim(l.location) = p.name;

create index inventory_types_location_idx on public.inventory_types (location_id);
create index inventory_type_labels_location_idx on public.inventory_type_labels (location_id);

alter table public.inventory_types drop column location;
alter table public.inventory_type_labels drop column location;
