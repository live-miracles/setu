-- Inventory brands become a managed list (like inventory places) instead of
-- free text, so one brand is never spelled two ways.
--
-- inventory_types.brand stays a text column holding the brand's name (empty for
-- none): the request/reminder SQL and the (brand, name, model) uniqueness read
-- it directly. The triggers below give it the guarantees a foreign key would:
-- it must name a listed brand, a rename applies to every type, and a brand that
-- a type still uses cannot be deleted.
create table public.inventory_brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger inventory_brands_set_updated_at before update on public.inventory_brands
  for each row execute procedure public.set_updated_at();

alter table public.inventory_brands enable row level security;
create policy "authenticated users read inventory brands"
  on public.inventory_brands for select to authenticated using (true);

-- One brand per distinct brand text already in use.
insert into public.inventory_brands (name)
select distinct btrim(brand)
from public.inventory_types
where btrim(brand) <> '';

update public.inventory_types set brand = btrim(brand) where brand <> btrim(brand);

create or replace function public.inventory_types_require_listed_brand()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.brand <> '' and not exists (
    select 1 from public.inventory_brands where name = new.brand
  ) then
    raise exception 'Brand "%" is not in the inventory brands list.', new.brand
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger inventory_types_require_listed_brand
  before insert or update of brand on public.inventory_types
  for each row execute procedure public.inventory_types_require_listed_brand();

create or replace function public.inventory_brands_cascade_rename()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.inventory_types set brand = new.name where brand = old.name;
  return new;
end;
$$;

create trigger inventory_brands_cascade_rename
  after update of name on public.inventory_brands
  for each row when (old.name is distinct from new.name)
  execute procedure public.inventory_brands_cascade_rename();

create or replace function public.inventory_brands_block_delete_in_use()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.inventory_types where brand = old.name) then
    raise exception 'Brand "%" is still used by inventory types.', old.name
      using errcode = '23503';
  end if;
  return old;
end;
$$;

create trigger inventory_brands_block_delete_in_use
  before delete on public.inventory_brands
  for each row execute procedure public.inventory_brands_block_delete_in_use();
