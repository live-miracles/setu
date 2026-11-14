-- A label's name is optional: the item number (display_id) already identifies
-- the unit. Several unnamed labels may share one inventory type, so names are
-- only unique per type when they are not empty.
alter table public.inventory_type_labels
  drop constraint if exists inventory_type_labels_inventory_type_id_name_key;

create unique index inventory_type_labels_type_name_key
  on public.inventory_type_labels (inventory_type_id, name)
  where name <> '';
