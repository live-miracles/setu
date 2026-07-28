create extension if not exists pgcrypto;

create type public.user_role as enum ('admin', 'member');
create type public.profile_status as enum ('invited', 'active', 'disabled');
create type public.shift_period as enum ('Morning', 'Evening', 'Night');
create type public.inventory_request_status as enum (
  'draft', 'submitted', 'approved', 'rejected', 'issued', 'returned',
  'cancelled', 'closed'
);
create type public.return_condition as enum ('good', 'damaged', 'missing');
create type public.ticket_status as enum ('unassigned', 'pending', 'closed');
create type public.ticket_priority as enum ('low', 'medium', 'high');
create type public.delivery_channel as enum ('email', 'push');
create type public.delivery_status as enum ('pending', 'sent', 'failed');

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text not null unique,
  name text not null,
  role public.user_role not null default 'member',
  status public.profile_status not null default 'invited',
  department_id uuid references public.departments(id) on delete set null,
  timezone text not null default 'Asia/Kolkata',
  phone text,
  whatsapp text,
  avatar_path text,
  notification_email boolean not null default true,
  notification_push boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_lower check (email = lower(email))
);

create table public.roster_shifts (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  period public.shift_period not null,
  location_id uuid references public.locations(id) on delete set null,
  location_name text not null,
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roster_shift_time_order check (ends_at > starts_at)
);

create table public.roster_assignments (
  shift_id uuid not null references public.roster_shifts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (shift_id, profile_id)
);

create table public.equipment_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  requestable boolean not null default true,
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  equipment_type_id uuid not null references public.equipment_types(id),
  name text not null,
  location_id uuid references public.locations(id) on delete set null,
  serial_number text,
  total_quantity integer not null default 0 check (total_quantity >= 0),
  available_quantity integer not null default 0 check (available_quantity >= 0),
  image_path text,
  admin_notes text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_available_not_over_total
    check (available_quantity <= total_quantity)
);

create table public.inventory_requests (
  id uuid primary key default gen_random_uuid(),
  display_id bigint generated always as identity unique,
  title text not null,
  requester_id uuid not null references public.profiles(id),
  from_date date not null,
  to_date date not null,
  purpose text not null,
  status public.inventory_request_status not null default 'draft',
  admin_note text,
  submitted_at timestamptz,
  approved_at timestamptz,
  issued_at timestamptz,
  returned_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_request_date_order check (to_date >= from_date)
);

create table public.inventory_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.inventory_requests(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id),
  quantity integer not null check (quantity > 0),
  issued_quantity integer not null default 0 check (issued_quantity >= 0),
  returned_quantity integer not null default 0 check (returned_quantity >= 0),
  created_at timestamptz not null default now(),
  constraint issued_not_over_requested check (issued_quantity <= quantity),
  constraint returned_not_over_issued check (returned_quantity <= issued_quantity),
  unique (request_id, inventory_item_id)
);

create table public.inventory_returns (
  id uuid primary key default gen_random_uuid(),
  request_item_id uuid not null references public.inventory_request_items(id),
  quantity integer not null check (quantity > 0),
  condition public.return_condition not null,
  notes text not null,
  received_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  display_id bigint generated always as identity unique,
  title text not null,
  description text not null,
  location_id uuid references public.locations(id) on delete set null,
  location_name text not null,
  priority public.ticket_priority not null default 'medium',
  status public.ticket_status not null default 'unassigned',
  reporter_id uuid not null references public.profiles(id),
  assignee_id uuid references public.profiles(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  message text not null,
  created_at timestamptz not null default now()
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (
    owner_type in ('profile', 'inventory_item', 'inventory_request', 'inventory_return', 'ticket', 'ticket_comment')
  ),
  owner_id uuid not null,
  storage_path text not null unique,
  original_name text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 15728640),
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.links (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  display_order integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.home_content (
  id boolean primary key default true check (id),
  support_message text not null default '',
  guidelines text not null default '',
  whatsapp_url text,
  tutorial_url text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  event_key text not null,
  title text not null,
  message text not null,
  href text not null default '/app',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, event_key)
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel public.delivery_channel not null,
  status public.delivery_status not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_id, channel)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.idempotency_keys (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null,
  key text not null,
  response jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, scope, key)
);

create index roster_shifts_starts_at_idx on public.roster_shifts(starts_at);
create index inventory_requests_status_idx on public.inventory_requests(status, updated_at desc);
create index inventory_requests_requester_idx on public.inventory_requests(requester_id);
create index inventory_request_items_request_idx on public.inventory_request_items(request_id);
create index tickets_status_idx on public.tickets(status, updated_at desc);
create index tickets_assignee_idx on public.tickets(assignee_id);
create index notifications_recipient_idx on public.notifications(recipient_id, created_at desc);
create index deliveries_retry_idx on public.notification_deliveries(status, next_attempt_at);
create index audit_entity_idx on public.audit_events(entity_type, entity_id, created_at desc);

create or replace function public.perform_inventory_request_action(
  p_request_id uuid,
  p_actor_id uuid,
  p_action text,
  p_note text,
  p_return_items jsonb,
  p_idempotency_key text
)
returns public.inventory_request_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.inventory_requests%rowtype;
  v_actor public.profiles%rowtype;
  v_request_item public.inventory_request_items%rowtype;
  v_return jsonb;
  v_quantity integer;
  v_condition public.return_condition;
  v_next_status public.inventory_request_status;
  v_before jsonb;
begin
  if length(coalesce(p_idempotency_key, '')) < 8 then
    raise exception 'invalid_idempotency_key';
  end if;

  select * into v_actor from public.profiles
  where id = p_actor_id and status = 'active';
  if not found then raise exception 'actor_not_active'; end if;

  insert into public.idempotency_keys(user_id, scope, key)
  values (p_actor_id, 'inventory_request:' || p_request_id || ':' || p_action, p_idempotency_key);

  select * into v_request from public.inventory_requests
  where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  v_before := to_jsonb(v_request);

  if p_action = 'submit' then
    if v_request.requester_id <> p_actor_id or v_request.status <> 'draft' then
      raise exception 'invalid_transition';
    end if;
    v_next_status := 'submitted';
    update public.inventory_requests
    set status = v_next_status, submitted_at = now()
    where id = p_request_id;
  else
    if v_actor.role <> 'admin' then raise exception 'admin_required'; end if;

    case p_action
      when 'approve' then
        if v_request.status <> 'submitted' then raise exception 'invalid_transition'; end if;
        v_next_status := 'approved';
        update public.inventory_requests
        set status = v_next_status, approved_at = now(), admin_note = nullif(p_note, '')
        where id = p_request_id;
      when 'reject' then
        if v_request.status <> 'submitted' or length(trim(coalesce(p_note, ''))) < 3 then
          raise exception 'invalid_transition_or_note';
        end if;
        v_next_status := 'rejected';
        update public.inventory_requests
        set status = v_next_status, admin_note = p_note
        where id = p_request_id;
      when 'issue' then
        if v_request.status <> 'approved' then raise exception 'invalid_transition'; end if;
        for v_request_item in
          select * from public.inventory_request_items
          where request_id = p_request_id
          order by id
          for update
        loop
          update public.inventory_items
          set
            available_quantity = available_quantity - v_request_item.quantity,
            version = version + 1
          where id = v_request_item.inventory_item_id
            and available_quantity >= v_request_item.quantity;
          if not found then raise exception 'insufficient_inventory'; end if;

          update public.inventory_request_items
          set issued_quantity = quantity
          where id = v_request_item.id;
        end loop;
        v_next_status := 'issued';
        update public.inventory_requests
        set status = v_next_status, issued_at = now(), admin_note = nullif(p_note, '')
        where id = p_request_id;
      when 'return' then
        if v_request.status <> 'issued' or jsonb_array_length(coalesce(p_return_items, '[]')) = 0 then
          raise exception 'invalid_transition_or_return_items';
        end if;
        for v_return in select * from jsonb_array_elements(p_return_items)
        loop
          v_quantity := (v_return->>'quantity')::integer;
          v_condition := (v_return->>'condition')::public.return_condition;
          if v_quantity < 1 or length(trim(coalesce(v_return->>'notes', ''))) < 3 then
            raise exception 'invalid_return_item';
          end if;

          select * into v_request_item from public.inventory_request_items
          where id = (v_return->>'requestItemId')::uuid
            and request_id = p_request_id
          for update;
          if not found or v_request_item.returned_quantity + v_quantity > v_request_item.issued_quantity then
            raise exception 'invalid_return_quantity';
          end if;

          insert into public.inventory_returns(
            request_item_id, quantity, condition, notes, received_by
          ) values (
            v_request_item.id, v_quantity, v_condition, v_return->>'notes', p_actor_id
          );

          update public.inventory_request_items
          set returned_quantity = returned_quantity + v_quantity
          where id = v_request_item.id;

          if v_condition = 'good' then
            update public.inventory_items
            set available_quantity = available_quantity + v_quantity, version = version + 1
            where id = v_request_item.inventory_item_id;
          end if;
        end loop;

        if not exists (
          select 1 from public.inventory_request_items
          where request_id = p_request_id and returned_quantity < issued_quantity
        ) then
          v_next_status := 'returned';
          update public.inventory_requests
          set status = v_next_status, returned_at = now(), admin_note = nullif(p_note, '')
          where id = p_request_id;
        else
          v_next_status := 'issued';
        end if;
      when 'cancel' then
        if v_request.status not in ('draft', 'submitted', 'approved')
          or length(trim(coalesce(p_note, ''))) < 3 then
          raise exception 'invalid_transition_or_note';
        end if;
        v_next_status := 'cancelled';
        update public.inventory_requests
        set status = v_next_status, admin_note = p_note
        where id = p_request_id;
      when 'close' then
        if v_request.status not in ('returned', 'rejected', 'cancelled') then
          raise exception 'invalid_transition';
        end if;
        v_next_status := 'closed';
        update public.inventory_requests
        set status = v_next_status, closed_at = now(), admin_note = coalesce(nullif(p_note, ''), admin_note)
        where id = p_request_id;
      else
        raise exception 'unsupported_action';
    end case;
  end if;

  insert into public.audit_events(
    actor_id, entity_type, entity_id, action, before_state, after_state
  )
  select p_actor_id, 'inventory_request', p_request_id, p_action, v_before, to_jsonb(r)
  from public.inventory_requests r where r.id = p_request_id;

  return v_next_status;
exception
  when unique_violation then
    raise exception 'duplicate_operation';
end;
$$;

create or replace function public.perform_ticket_action(
  p_ticket_id uuid,
  p_actor_id uuid,
  p_action text,
  p_assignee_id uuid,
  p_idempotency_key text
)
returns public.ticket_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets%rowtype;
  v_actor public.profiles%rowtype;
  v_next_status public.ticket_status;
begin
  if length(coalesce(p_idempotency_key, '')) < 8 then
    raise exception 'invalid_idempotency_key';
  end if;
  select * into v_actor from public.profiles where id = p_actor_id and status = 'active';
  if not found then raise exception 'actor_not_active'; end if;

  insert into public.idempotency_keys(user_id, scope, key)
  values (p_actor_id, 'ticket:' || p_ticket_id || ':' || p_action, p_idempotency_key);

  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found then raise exception 'ticket_not_found'; end if;

  if p_action = 'assign' then
    if v_actor.role <> 'admin' or p_assignee_id is null then raise exception 'admin_required'; end if;
    if not exists (
      select 1 from public.profiles where id = p_assignee_id and status = 'active'
    ) then raise exception 'assignee_not_active'; end if;
    v_next_status := 'pending';
    update public.tickets
    set assignee_id = p_assignee_id, status = v_next_status, closed_at = null
    where id = p_ticket_id;
  elsif p_action = 'close' then
    if v_actor.role <> 'admin' and v_ticket.assignee_id <> p_actor_id then
      raise exception 'not_ticket_owner';
    end if;
    if v_ticket.status not in ('unassigned', 'pending') then raise exception 'invalid_transition'; end if;
    v_next_status := 'closed';
    update public.tickets set status = v_next_status, closed_at = now()
    where id = p_ticket_id;
  elsif p_action = 'reopen' then
    if v_actor.role <> 'admin' then raise exception 'admin_required'; end if;
    if v_ticket.status <> 'closed' then raise exception 'invalid_transition'; end if;
    v_next_status := 'pending';
    update public.tickets set status = v_next_status, closed_at = null
    where id = p_ticket_id;
  else
    raise exception 'unsupported_action';
  end if;

  insert into public.audit_events(
    actor_id, entity_type, entity_id, action, before_state, after_state
  )
  select p_actor_id, 'ticket', p_ticket_id, p_action, to_jsonb(v_ticket), to_jsonb(t)
  from public.tickets t where t.id = p_ticket_id;

  return v_next_status;
exception
  when unique_violation then
    raise exception 'duplicate_operation';
end;
$$;

revoke all on function public.perform_inventory_request_action(
  uuid, uuid, text, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.perform_inventory_request_action(
  uuid, uuid, text, text, jsonb, text
) to service_role;
revoke all on function public.perform_ticket_action(
  uuid, uuid, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.perform_ticket_action(
  uuid, uuid, text, uuid, text
) to service_role;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger departments_updated_at before update on public.departments
for each row execute function public.touch_updated_at();
create trigger locations_updated_at before update on public.locations
for each row execute function public.touch_updated_at();
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();
create trigger roster_shifts_updated_at before update on public.roster_shifts
for each row execute function public.touch_updated_at();
create trigger equipment_types_updated_at before update on public.equipment_types
for each row execute function public.touch_updated_at();
create trigger inventory_items_updated_at before update on public.inventory_items
for each row execute function public.touch_updated_at();
create trigger inventory_requests_updated_at before update on public.inventory_requests
for each row execute function public.touch_updated_at();
create trigger tickets_updated_at before update on public.tickets
for each row execute function public.touch_updated_at();
create trigger links_updated_at before update on public.links
for each row execute function public.touch_updated_at();
create trigger notification_deliveries_updated_at before update on public.notification_deliveries
for each row execute function public.touch_updated_at();

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles
  where auth_user_id = auth.uid() and status = 'active'
  limit 1
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where auth_user_id = auth.uid() and status = 'active'
  )
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where auth_user_id = auth.uid() and status = 'active' and role = 'admin'
  )
$$;

alter table public.departments enable row level security;
alter table public.locations enable row level security;
alter table public.profiles enable row level security;
alter table public.roster_shifts enable row level security;
alter table public.roster_assignments enable row level security;
alter table public.equipment_types enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_requests enable row level security;
alter table public.inventory_request_items enable row level security;
alter table public.inventory_returns enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_comments enable row level security;
alter table public.attachments enable row level security;
alter table public.links enable row level security;
alter table public.home_content enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.audit_events enable row level security;
alter table public.idempotency_keys enable row level security;

create policy "active users read departments" on public.departments
for select using (public.is_active_user());
create policy "admins manage departments" on public.departments
for all using (public.is_admin()) with check (public.is_admin());

create policy "active users read locations" on public.locations
for select using (public.is_active_user());
create policy "admins manage locations" on public.locations
for all using (public.is_admin()) with check (public.is_admin());

create policy "users read active profiles" on public.profiles
for select using (public.is_active_user() and (status = 'active' or public.is_admin()));
create policy "users update own profile" on public.profiles
for update using (id = public.current_profile_id())
with check (id = public.current_profile_id());
create policy "admins manage profiles" on public.profiles
for all using (public.is_admin()) with check (public.is_admin());

revoke update on public.profiles from authenticated;
grant update (
  name, timezone, phone, whatsapp, avatar_path,
  notification_email, notification_push
) on public.profiles to authenticated;

create policy "active users read roster" on public.roster_shifts
for select using (public.is_active_user());
create policy "admins manage roster" on public.roster_shifts
for all using (public.is_admin()) with check (public.is_admin());
create policy "active users read assignments" on public.roster_assignments
for select using (public.is_active_user());
create policy "admins manage assignments" on public.roster_assignments
for all using (public.is_admin()) with check (public.is_admin());

create policy "active users read equipment types" on public.equipment_types
for select using (public.is_active_user());
create policy "admins manage equipment types" on public.equipment_types
for all using (public.is_admin()) with check (public.is_admin());
create policy "active users read inventory" on public.inventory_items
for select using (public.is_active_user());
create policy "admins manage inventory" on public.inventory_items
for all using (public.is_admin()) with check (public.is_admin());

create policy "users read relevant requests" on public.inventory_requests
for select using (
  public.is_admin() or requester_id = public.current_profile_id()
);
create policy "users create own requests" on public.inventory_requests
for insert with check (requester_id = public.current_profile_id());
create policy "users edit own drafts" on public.inventory_requests
for update using (
  requester_id = public.current_profile_id() and status = 'draft'
) with check (
  requester_id = public.current_profile_id() and status in ('draft', 'submitted', 'cancelled')
);
create policy "admins manage requests" on public.inventory_requests
for all using (public.is_admin()) with check (public.is_admin());

create policy "users read request items" on public.inventory_request_items
for select using (
  exists (
    select 1 from public.inventory_requests r
    where r.id = request_id
      and (public.is_admin() or r.requester_id = public.current_profile_id())
  )
);
create policy "users manage own draft request items" on public.inventory_request_items
for all using (
  exists (
    select 1 from public.inventory_requests r
    where r.id = request_id and r.requester_id = public.current_profile_id()
      and r.status = 'draft'
  )
) with check (
  exists (
    select 1 from public.inventory_requests r
    where r.id = request_id and r.requester_id = public.current_profile_id()
      and r.status = 'draft'
  )
);
create policy "admins manage request items" on public.inventory_request_items
for all using (public.is_admin()) with check (public.is_admin());

create policy "users read relevant returns" on public.inventory_returns
for select using (
  public.is_admin() or exists (
    select 1
    from public.inventory_request_items ri
    join public.inventory_requests r on r.id = ri.request_id
    where ri.id = request_item_id and r.requester_id = public.current_profile_id()
  )
);
create policy "admins manage returns" on public.inventory_returns
for all using (public.is_admin()) with check (public.is_admin());

create policy "active users read tickets" on public.tickets
for select using (public.is_active_user());
create policy "users create tickets" on public.tickets
for insert with check (reporter_id = public.current_profile_id());
create policy "assignees update tickets" on public.tickets
for update using (
  assignee_id = public.current_profile_id() or public.is_admin()
) with check (
  assignee_id = public.current_profile_id() or public.is_admin()
);
create policy "admins manage tickets" on public.tickets
for all using (public.is_admin()) with check (public.is_admin());

create policy "active users read comments" on public.ticket_comments
for select using (public.is_active_user());
create policy "active users add comments" on public.ticket_comments
for insert with check (author_id = public.current_profile_id());
create policy "admins manage comments" on public.ticket_comments
for all using (public.is_admin()) with check (public.is_admin());

create policy "active users read links" on public.links
for select using (public.is_active_user());
create policy "admins manage links" on public.links
for all using (public.is_admin()) with check (public.is_admin());
create policy "active users read home content" on public.home_content
for select using (public.is_active_user());
create policy "admins manage home content" on public.home_content
for all using (public.is_admin()) with check (public.is_admin());

create policy "users read own notifications" on public.notifications
for select using (recipient_id = public.current_profile_id());
create policy "users update own notifications" on public.notifications
for update using (recipient_id = public.current_profile_id())
with check (recipient_id = public.current_profile_id());

create policy "users manage own push subscriptions" on public.push_subscriptions
for all using (profile_id = public.current_profile_id())
with check (profile_id = public.current_profile_id());

create policy "admins read audits" on public.audit_events
for select using (public.is_admin());

insert into public.home_content (
  support_message,
  guidelines,
  whatsapp_url,
  tutorial_url
) values (
  'Namaskaram! Please stay a-Live.',
  'Keep studios clean, sign the entry book and report equipment changes through a ticket.',
  null,
  null
) on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'private-attachments',
  'private-attachments',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
) on conflict (id) do nothing;
