create extension if not exists pgcrypto;

create type public.user_role as enum ('admin', 'member');
create type public.inventory_request_status as enum (
  'draft', 'submitted', 'approved', 'rejected', 'issued', 'returned',
  'cancelled', 'closed'
);
create type public.program_request_status as enum (
  'draft', 'submitted', 'approved', 'rejected', 'cancelled', 'closed'
);
create type public.return_condition as enum ('good', 'damaged', 'missing');
create type public.ticket_status as enum ('unassigned', 'pending', 'closed');

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text
);

create table public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

-- Id is the lowercase Google-account email itself, not a generated uuid;
-- see users_id_lower. This also means auth is a plain email match (no
-- separate auth_user_id linking column) — see auth/callback/route.ts.
create table public.users (
  id text primary key,
  name text not null,
  role public.user_role not null default 'member',
  department_id uuid references public.departments(id) on delete set null,
  timezone text not null default 'Asia/Kolkata',
  phone text,
  whatsapp text,
  constraint users_id_lower check (id = lower(id))
);

-- One row per person per roster entry (no separate many-to-many
-- assignment table).
create table public.rosters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  start_time time not null,
  end_time time not null,
  user_id text not null references public.users(id) on delete cascade,
  constraint roster_date_order check (end_date >= start_date)
);

-- Type-level catalog only; there is no per-unit/serial-tracked row anymore.
-- "Available" is computed at issue time, not stored — see
-- perform_inventory_request_action.
create table public.inventory_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  requestable boolean not null default true,
  image_drive_id text,
  total_quantity integer not null default 0 check (total_quantity >= 0)
);

create table public.inventory_requests (
  id uuid primary key default gen_random_uuid(),
  display_id integer not null unique,
  name text not null,
  user_id text not null references public.users(id),
  start_date date not null,
  end_date date not null,
  status public.inventory_request_status not null default 'draft',
  image1_drive_id text,
  image2_drive_id text,
  image3_drive_id text,
  constraint inventory_request_date_order check (end_date >= start_date)
);

-- Line items. A return is a single all-or-nothing event per line (no
-- partial-quantity, multi-condition return history) — returned_quantity is
-- always 0 or equal to issued_quantity.
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.inventory_requests(id) on delete cascade,
  inventory_type_id uuid not null references public.inventory_types(id),
  quantity integer not null check (quantity > 0),
  issued_quantity integer not null default 0 check (issued_quantity >= 0),
  returned_quantity integer not null default 0 check (returned_quantity >= 0),
  condition public.return_condition,
  constraint issued_not_over_requested check (issued_quantity <= quantity),
  constraint returned_not_over_issued check (returned_quantity <= issued_quantity),
  unique (request_id, inventory_type_id)
);

create table public.program_requests (
  id uuid primary key default gen_random_uuid(),
  display_id integer not null unique,
  name text not null,
  type text not null,
  user_id text not null references public.users(id),
  status public.program_request_status not null default 'draft',
  place_id uuid not null references public.places(id)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,
  request_id uuid not null references public.program_requests(id) on delete cascade,
  start_date_time timestamptz not null,
  end_date_time timestamptz not null,
  constraint session_time_order check (end_date_time > start_date_time)
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  display_id integer not null unique,
  title text not null,
  description text not null,
  status public.ticket_status not null default 'unassigned',
  assignee_id text references public.users(id) on delete set null
);

-- Requests only — tickets have no comments. Exactly one of the two owner
-- FKs must be set.
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamptz not null default now(),
  program_request_id uuid references public.program_requests(id) on delete cascade,
  inventory_request_id uuid references public.inventory_requests(id) on delete cascade,
  user_id text not null references public.users(id),
  message text not null,
  constraint comments_exactly_one_owner check (
    (program_request_id is not null)::int + (inventory_request_id is not null)::int = 1
  )
);

create table public.links (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null
);

-- Generic key/value store: display-id counters (see next_display_id) and
-- home-content fields (support_message, guidelines, whatsapp_url,
-- tutorial_url) all live here as rows, keyed by Id.
create table public.settings (
  id text primary key,
  value text not null
);

create table public.failed_emails (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamptz not null default now(),
  user_id text references public.users(id) on delete set null,
  title text not null,
  message text not null,
  error text not null
);

create index rosters_user_idx on public.rosters(user_id);
create index rosters_start_date_idx on public.rosters(start_date);
create index inventory_requests_status_idx on public.inventory_requests(status);
create index inventory_requests_user_idx on public.inventory_requests(user_id);
create index inventory_items_request_idx on public.inventory_items(request_id);
create index inventory_items_type_idx on public.inventory_items(inventory_type_id);
create index program_requests_status_idx on public.program_requests(status);
create index program_requests_user_idx on public.program_requests(user_id);
create index sessions_request_idx on public.sessions(request_id);
create index tickets_status_idx on public.tickets(status);
create index tickets_assignee_idx on public.tickets(assignee_id);
create index comments_program_request_idx on public.comments(program_request_id);
create index comments_inventory_request_idx on public.comments(inventory_request_id);
create index failed_emails_user_idx on public.failed_emails(user_id);

-- Availability is computed, not stored (see inventory_types comment
-- above) — this view is how the API layer reads it without recomputing
-- the aggregate by hand everywhere.
create view public.inventory_types_with_availability as
select
  it.*,
  (it.total_quantity - coalesce(
    sum(case when ii.condition = 'good' then 0 else ii.issued_quantity end), 0
  ))::integer as available_quantity
from public.inventory_types it
left join public.inventory_items ii on ii.inventory_type_id = it.id
group by it.id;

-- Atomic display-id counter. A single UPDATE...RETURNING is what makes
-- concurrent creates safe without a separate lock step.
create or replace function public.next_display_id(p_key text)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.settings
  set value = (value::integer + 1)::text
  where id = p_key
  returning value::integer;
$$;

create or replace function public.perform_inventory_request_action(
  p_request_id uuid,
  p_actor_id text,
  p_action text,
  p_note text,
  p_return_items jsonb
)
returns public.inventory_request_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.inventory_requests%rowtype;
  v_actor public.users%rowtype;
  v_item public.inventory_items%rowtype;
  v_return jsonb;
  v_condition public.return_condition;
  v_next_status public.inventory_request_status;
  v_available integer;
begin
  select * into v_actor from public.users where id = p_actor_id;
  if not found then raise exception 'actor_not_found'; end if;

  select * into v_request from public.inventory_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;

  if p_action = 'submit' then
    if v_request.user_id <> p_actor_id or v_request.status <> 'draft' then
      raise exception 'invalid_transition';
    end if;
    v_next_status := 'submitted';
    update public.inventory_requests set status = v_next_status
    where id = p_request_id and status = 'draft';
  else
    if v_actor.role <> 'admin' then raise exception 'admin_required'; end if;

    case p_action
      when 'approve' then
        if v_request.status <> 'submitted' then raise exception 'invalid_transition'; end if;
        v_next_status := 'approved';
        update public.inventory_requests set status = v_next_status
        where id = p_request_id and status = 'submitted';
      when 'reject' then
        if v_request.status <> 'submitted' or length(trim(coalesce(p_note, ''))) < 3 then
          raise exception 'invalid_transition_or_note';
        end if;
        v_next_status := 'rejected';
        update public.inventory_requests set status = v_next_status
        where id = p_request_id and status = 'submitted';
      when 'issue' then
        if v_request.status <> 'approved' then raise exception 'invalid_transition'; end if;
        for v_item in
          select * from public.inventory_items
          where request_id = p_request_id
          order by inventory_type_id
        loop
          -- Lock the type row so concurrent issues against it serialize.
          perform 1 from public.inventory_types where id = v_item.inventory_type_id for update;

          -- Availability is computed, not stored: total minus everything
          -- currently checked out or permanently lost/damaged. An item
          -- only re-enters the pool if it came back in 'good' condition.
          select it.total_quantity - coalesce(
            sum(case when ii.condition = 'good' then 0 else ii.issued_quantity end), 0
          )
          into v_available
          from public.inventory_types it
          left join public.inventory_items ii on ii.inventory_type_id = it.id
          where it.id = v_item.inventory_type_id
          group by it.total_quantity;

          if v_available < v_item.quantity then raise exception 'insufficient_inventory'; end if;

          update public.inventory_items set issued_quantity = quantity where id = v_item.id;
        end loop;
        v_next_status := 'issued';
        update public.inventory_requests set status = v_next_status
        where id = p_request_id and status = 'approved';
      when 'return' then
        if v_request.status <> 'issued' or jsonb_array_length(coalesce(p_return_items, '[]')) = 0 then
          raise exception 'invalid_transition_or_return_items';
        end if;
        for v_return in select * from jsonb_array_elements(p_return_items)
        loop
          v_condition := (v_return->>'condition')::public.return_condition;
          select * into v_item from public.inventory_items
            where id = (v_return->>'itemId')::uuid and request_id = p_request_id
            for update;
          if not found or v_item.returned_quantity > 0 then
            raise exception 'invalid_return_item';
          end if;
          update public.inventory_items
          set returned_quantity = issued_quantity, condition = v_condition
          where id = v_item.id;
        end loop;

        if not exists (
          select 1 from public.inventory_items
          where request_id = p_request_id and returned_quantity < issued_quantity
        ) then
          v_next_status := 'returned';
          update public.inventory_requests set status = v_next_status
          where id = p_request_id and status = 'issued';
        else
          v_next_status := 'issued';
        end if;
      when 'cancel' then
        if v_request.status not in ('draft', 'submitted', 'approved')
          or length(trim(coalesce(p_note, ''))) < 3 then
          raise exception 'invalid_transition_or_note';
        end if;
        v_next_status := 'cancelled';
        update public.inventory_requests set status = v_next_status where id = p_request_id;
      when 'close' then
        if v_request.status not in ('returned', 'rejected', 'cancelled') then
          raise exception 'invalid_transition';
        end if;
        v_next_status := 'closed';
        update public.inventory_requests set status = v_next_status where id = p_request_id;
      else
        raise exception 'unsupported_action';
    end case;
  end if;

  if length(trim(coalesce(p_note, ''))) > 0 then
    insert into public.comments (program_request_id, inventory_request_id, user_id, message)
    values (null, p_request_id, p_actor_id, p_note);
  end if;

  return v_next_status;
end;
$$;

create or replace function public.perform_program_request_action(
  p_request_id uuid,
  p_actor_id text,
  p_action text,
  p_note text
)
returns public.program_request_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.program_requests%rowtype;
  v_actor public.users%rowtype;
  v_next_status public.program_request_status;
begin
  select * into v_actor from public.users where id = p_actor_id;
  if not found then raise exception 'actor_not_found'; end if;

  select * into v_request from public.program_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;

  if p_action = 'submit' then
    if v_request.user_id <> p_actor_id or v_request.status <> 'draft' then
      raise exception 'invalid_transition';
    end if;
    v_next_status := 'submitted';
    update public.program_requests set status = v_next_status
    where id = p_request_id and status = 'draft';
  else
    if v_actor.role <> 'admin' then raise exception 'admin_required'; end if;
    case p_action
      when 'approve' then
        if v_request.status <> 'submitted' then raise exception 'invalid_transition'; end if;
        v_next_status := 'approved';
        update public.program_requests set status = v_next_status
        where id = p_request_id and status = 'submitted';
      when 'reject' then
        if v_request.status <> 'submitted' or length(trim(coalesce(p_note, ''))) < 3 then
          raise exception 'invalid_transition_or_note';
        end if;
        v_next_status := 'rejected';
        update public.program_requests set status = v_next_status
        where id = p_request_id and status = 'submitted';
      when 'cancel' then
        if v_request.status not in ('draft', 'submitted', 'approved')
          or length(trim(coalesce(p_note, ''))) < 3 then
          raise exception 'invalid_transition_or_note';
        end if;
        v_next_status := 'cancelled';
        update public.program_requests set status = v_next_status where id = p_request_id;
      when 'close' then
        if v_request.status not in ('approved', 'rejected', 'cancelled') then
          raise exception 'invalid_transition';
        end if;
        v_next_status := 'closed';
        update public.program_requests set status = v_next_status where id = p_request_id;
      else
        raise exception 'unsupported_action';
    end case;
  end if;

  if length(trim(coalesce(p_note, ''))) > 0 then
    insert into public.comments (program_request_id, inventory_request_id, user_id, message)
    values (p_request_id, null, p_actor_id, p_note);
  end if;

  return v_next_status;
end;
$$;

create or replace function public.perform_ticket_action(
  p_ticket_id uuid,
  p_actor_id text,
  p_action text,
  p_assignee_id text
)
returns public.ticket_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets%rowtype;
  v_actor public.users%rowtype;
  v_next_status public.ticket_status;
begin
  select * into v_actor from public.users where id = p_actor_id;
  if not found then raise exception 'actor_not_found'; end if;

  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found then raise exception 'ticket_not_found'; end if;

  if p_action = 'assign' then
    if v_actor.role <> 'admin' or p_assignee_id is null then raise exception 'admin_required'; end if;
    if not exists (select 1 from public.users where id = p_assignee_id) then
      raise exception 'assignee_not_found';
    end if;
    v_next_status := 'pending';
    update public.tickets set assignee_id = p_assignee_id, status = v_next_status
    where id = p_ticket_id;
  elsif p_action = 'close' then
    if v_actor.role <> 'admin' and v_ticket.assignee_id <> p_actor_id then
      raise exception 'not_ticket_owner';
    end if;
    if v_ticket.status not in ('unassigned', 'pending') then raise exception 'invalid_transition'; end if;
    v_next_status := 'closed';
    update public.tickets set status = v_next_status where id = p_ticket_id;
  elsif p_action = 'reopen' then
    if v_actor.role <> 'admin' then raise exception 'admin_required'; end if;
    if v_ticket.status <> 'closed' then raise exception 'invalid_transition'; end if;
    v_next_status := 'pending';
    update public.tickets set status = v_next_status where id = p_ticket_id;
  else
    raise exception 'unsupported_action';
  end if;

  return v_next_status;
end;
$$;

revoke all on function public.next_display_id(text) from public, anon, authenticated;
grant execute on function public.next_display_id(text) to service_role;
revoke all on function public.perform_inventory_request_action(
  uuid, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.perform_inventory_request_action(
  uuid, text, text, text, jsonb
) to service_role;
revoke all on function public.perform_program_request_action(
  uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.perform_program_request_action(
  uuid, text, text, text
) to service_role;
revoke all on function public.perform_ticket_action(
  uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.perform_ticket_action(
  uuid, text, text, text
) to service_role;

-- Every read/write goes through /api/v1 using the service-role client
-- (which bypasses RLS), gated by app-level requireUser/requireAdmin
-- checks. RLS here is a default-deny safety net, not the access-control
-- mechanism, so it's enabled with no policies rather than maintained as a
-- parallel set of per-table rules.
alter table public.departments enable row level security;
alter table public.places enable row level security;
alter table public.users enable row level security;
alter table public.rosters enable row level security;
alter table public.inventory_types enable row level security;
alter table public.inventory_requests enable row level security;
alter table public.inventory_items enable row level security;
alter table public.program_requests enable row level security;
alter table public.sessions enable row level security;
alter table public.tickets enable row level security;
alter table public.comments enable row level security;
alter table public.links enable row level security;
alter table public.settings enable row level security;
alter table public.failed_emails enable row level security;

revoke all on all tables in schema public from anon, authenticated;

insert into public.settings (id, value) values
  ('inventory_request_display_id', '0'),
  ('program_request_display_id', '0'),
  ('ticket_display_id', '0'),
  ('support_message', 'Namaskaram! Please stay a-Live.'),
  ('guidelines', 'Keep studios clean, sign the entry book and report equipment changes through a ticket.'),
  ('whatsapp_url', ''),
  ('tutorial_url', '')
on conflict (id) do nothing;
