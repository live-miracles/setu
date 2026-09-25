-- Add optional manufacturer details to inventory types.
alter table public.inventory_types
  add column brand text not null default '',
  add column model text not null default '';

-- The same named item can exist for different brands/models.
alter table public.inventory_types
  drop constraint if exists inventory_types_name_key;

alter table public.inventory_types
  add constraint inventory_types_brand_name_model_key unique (brand, name, model);
