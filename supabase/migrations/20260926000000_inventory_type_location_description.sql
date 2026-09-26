-- The existing "description" column is actually used as a physical location
-- for the item; free it up for a real description field.
alter table public.inventory_types
  rename column description to location;

alter table public.inventory_types
  add column description text not null default '';
