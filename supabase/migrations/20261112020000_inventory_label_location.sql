-- A label can sit in a different location than its inventory type (for example
-- one camera body per studio). Empty means "same as the type's location".
alter table public.inventory_type_labels
  add column location text not null default '';

-- Labels used to carry their location in the name ("serial | Studio 2"). Copy
-- that text into the new column once; names are left untouched.
update public.inventory_type_labels
set location = btrim(substring(name from '^.*\|(.*)$'))
where name like '%|%';
