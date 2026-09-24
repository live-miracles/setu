-- Short, stable identifiers for inventory QR codes. Identity values are
-- intentionally table-wide: the type and label parts are combined as
-- <inventory_type_number>-<label_number> when a label is present.
alter table public.inventory_types
  add column display_id bigint generated always as identity;

alter table public.inventory_types
  add constraint inventory_types_display_id_key unique (display_id);

alter table public.inventory_type_labels
  add column display_id bigint generated always as identity;

alter table public.inventory_type_labels
  add constraint inventory_type_labels_display_id_key unique (display_id);
