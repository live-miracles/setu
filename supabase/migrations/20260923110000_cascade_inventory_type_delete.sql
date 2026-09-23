-- Deleting an inventory type removes only its item rows from inventory
-- requests. Keep this in one database function so the item rows and the type
-- are removed atomically; item-label assignments then cascade automatically.
create or replace function public.delete_inventory_type_with_items(
  target_inventory_type_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.inventory_request_items
   where inventory_type_id = target_inventory_type_id;

  delete from public.inventory_types
   where id = target_inventory_type_id;
  if not found then
    raise exception 'Inventory type not found.';
  end if;
end;
$$;

revoke all on function public.delete_inventory_type_with_items(uuid) from public;
grant execute on function public.delete_inventory_type_with_items(uuid) to service_role;
