-- Optional unit labels for inventory types. A label identifies one physical
-- item (for example, Camera body / CAM-001) without making every inventory
-- type serial-tracked.
create table public.inventory_type_labels (
  id uuid primary key default gen_random_uuid(),
  inventory_type_id uuid not null references public.inventory_types(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (inventory_type_id, name)
);

-- Labels assigned to a request line. The request line's quantity remains the
-- source of truth for requested/issued count; labels are optional metadata.
create table public.inventory_request_item_labels (
  id uuid primary key default gen_random_uuid(),
  request_item_id uuid not null references public.inventory_request_items(id) on delete cascade,
  inventory_type_label_id uuid not null references public.inventory_type_labels(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (request_item_id, inventory_type_label_id)
);

create index inventory_type_labels_type_idx
  on public.inventory_type_labels (inventory_type_id);
create index inventory_request_item_labels_item_idx
  on public.inventory_request_item_labels (request_item_id);
create index inventory_request_item_labels_label_idx
  on public.inventory_request_item_labels (inventory_type_label_id);

alter table public.inventory_type_labels enable row level security;
alter table public.inventory_request_item_labels enable row level security;

create policy "authenticated users read inventory labels"
  on public.inventory_type_labels for select to authenticated using (true);

create policy "request viewers read inventory item labels"
  on public.inventory_request_item_labels for select to authenticated
  using (
    exists (
      select 1
      from public.inventory_request_items i
      where i.id = inventory_request_item_labels.request_item_id
        and public.can_view_inventory_request(i.request_id)
    )
  );
