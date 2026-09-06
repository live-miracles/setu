-- Setu's application database. This is intentionally a clean schema rather
-- than a transcription of the Sheets tabs: relationships that previously
-- lived in comma-separated strings and JSON are first-class tables here.
create extension if not exists pgcrypto;
create extension if not exists citext;

create type public.user_role as enum ('admin', 'approver', 'viewer', 'user');
create type public.inventory_request_status as enum (
  'draft', 'submitted', 'approved', 'rejected', 'issued', 'cancelled', 'closed'
);
create type public.program_request_status as enum (
  'draft', 'submitted', 'approved', 'rejected', 'cancelled'
);
create type public.ticket_status as enum ('unassigned', 'pending', 'closed');
create type public.return_condition as enum ('returned', 'damaged', 'missing');
create type public.comment_target as enum ('inventory_request', 'program_request', 'ticket');
create type public.email_status as enum ('pending', 'processing', 'sent', 'failed');

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text not null unique,
  lead_email citext not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  name text not null default '',
  role public.user_role not null default 'user',
  department_id uuid references public.departments(id) on delete set null,
  phone text not null default '',
  whatsapp text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  requestable boolean not null default true,
  image_path text not null default '',
  total_quantity integer not null check (total_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shift_types (
  name text primary key,
  color text not null default '',
  default_start_time time not null,
  default_end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.program_types (
  name text primary key,
  color text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.program_languages (
  name text primary key,
  created_at timestamptz not null default now()
);

create table public.session_types (
  name text primary key,
  created_at timestamptz not null default now()
);

create table public.home_content (
  id boolean primary key default true check (id),
  guidelines text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
insert into public.home_content (id) values (true);

create table public.rosters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);

create table public.inventory_requests (
  id uuid primary key default gen_random_uuid(),
  display_id bigint generated always as identity unique,
  name text not null,
  requester_id uuid not null references public.profiles(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  status public.inventory_request_status not null default 'draft',
  image_path text not null default '',
  department_id uuid references public.departments(id) on delete set null,
  lead_email citext not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.inventory_request_participants (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.inventory_requests(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  external_email citext,
  created_at timestamptz not null default now(),
  check (num_nonnulls(profile_id, external_email) = 1)
);
create unique index inventory_request_participants_profile_key
  on public.inventory_request_participants (request_id, profile_id)
  where profile_id is not null;
create unique index inventory_request_participants_external_email_key
  on public.inventory_request_participants (request_id, external_email)
  where external_email is not null;

create table public.inventory_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.inventory_requests(id) on delete cascade,
  inventory_type_id uuid not null references public.inventory_types(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  return_condition public.return_condition,
  created_at timestamptz not null default now(),
  unique (request_id, inventory_type_id)
);

create table public.program_requests (
  id uuid primary key default gen_random_uuid(),
  display_id bigint generated always as identity unique,
  name text not null,
  language text not null references public.program_languages(name) on update cascade,
  program_type text not null references public.program_types(name) on update cascade,
  requester_id uuid not null references public.profiles(id) on delete restrict,
  status public.program_request_status not null default 'draft',
  place_id uuid not null references public.places(id) on delete restrict,
  department_id uuid references public.departments(id) on delete set null,
  lead_email citext not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.program_request_participants (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.program_requests(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  external_email citext,
  created_at timestamptz not null default now(),
  check (num_nonnulls(profile_id, external_email) = 1)
);
create unique index program_request_participants_profile_key
  on public.program_request_participants (request_id, profile_id)
  where profile_id is not null;
create unique index program_request_participants_external_email_key
  on public.program_request_participants (request_id, external_email)
  where external_email is not null;

create table public.program_sessions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.program_requests(id) on delete cascade,
  name text not null default '',
  session_type text not null references public.session_types(name) on update cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (end_at > start_at),
  check (end_at - start_at < interval '24 hours')
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  display_id bigint generated always as identity unique,
  title text not null,
  description text not null default '',
  status public.ticket_status not null default 'unassigned',
  assignee_id uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  target_type public.comment_target not null,
  target_id uuid not null,
  author_id uuid not null references public.profiles(id) on delete restrict,
  message text not null check (length(trim(message)) > 0),
  created_at timestamptz not null default now()
);
create index comments_target_idx on public.comments (target_type, target_id, created_at);

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  place text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);

-- A transactional outbox ensures the database change and its notification are
-- committed together. A scheduled Edge Function will claim and deliver rows.
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  template text not null,
  recipient citext not null,
  payload jsonb not null default '{}'::jsonb,
  status public.email_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index email_outbox_dispatch_idx on public.email_outbox (status, next_attempt_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')
  );
  return new;
end;
$$;

create trigger departments_set_updated_at before update on public.departments
  for each row execute procedure public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();
create trigger places_set_updated_at before update on public.places
  for each row execute procedure public.set_updated_at();
create trigger inventory_types_set_updated_at before update on public.inventory_types
  for each row execute procedure public.set_updated_at();
create trigger shift_types_set_updated_at before update on public.shift_types
  for each row execute procedure public.set_updated_at();
create trigger program_types_set_updated_at before update on public.program_types
  for each row execute procedure public.set_updated_at();
create trigger home_content_set_updated_at before update on public.home_content
  for each row execute procedure public.set_updated_at();
create trigger rosters_set_updated_at before update on public.rosters
  for each row execute procedure public.set_updated_at();
create trigger inventory_requests_set_updated_at before update on public.inventory_requests
  for each row execute procedure public.set_updated_at();
create trigger program_requests_set_updated_at before update on public.program_requests
  for each row execute procedure public.set_updated_at();
create trigger tickets_set_updated_at before update on public.tickets
  for each row execute procedure public.set_updated_at();
create trigger blocks_set_updated_at before update on public.blocks
  for each row execute procedure public.set_updated_at();
create trigger email_outbox_set_updated_at before update on public.email_outbox
  for each row execute procedure public.set_updated_at();

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_approver()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() in ('admin', 'approver')
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() = 'admin'
$$;

create or replace function public.can_view_inventory_request(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() <> 'user'
    or exists (select 1 from public.inventory_requests r where r.id = target and r.requester_id = auth.uid())
    or exists (
      select 1 from public.inventory_request_participants p
      where p.request_id = target and p.profile_id = auth.uid()
    )
$$;

create or replace function public.can_view_program_request(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() <> 'user'
    or exists (select 1 from public.program_requests r where r.id = target and r.requester_id = auth.uid())
    or exists (
      select 1 from public.program_request_participants p
      where p.request_id = target and p.profile_id = auth.uid()
    )
$$;

-- Availability is not sensitive, but the underlying issued requests are.
-- This function exposes only the aggregate needed by the catalog UI.
create or replace function public.inventory_availability()
returns table (inventory_type_id uuid, available_quantity integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    t.total_quantity - coalesce(sum(i.quantity) filter (where r.status = 'issued'), 0)::integer
  from public.inventory_types t
  left join public.inventory_request_items i on i.inventory_type_id = t.id
  left join public.inventory_requests r on r.id = i.request_id
  group by t.id, t.total_quantity
$$;
grant execute on function public.inventory_availability() to authenticated;

alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.places enable row level security;
alter table public.inventory_types enable row level security;
alter table public.shift_types enable row level security;
alter table public.program_types enable row level security;
alter table public.program_languages enable row level security;
alter table public.session_types enable row level security;
alter table public.home_content enable row level security;
alter table public.rosters enable row level security;
alter table public.inventory_requests enable row level security;
alter table public.inventory_request_participants enable row level security;
alter table public.inventory_request_items enable row level security;
alter table public.program_requests enable row level security;
alter table public.program_request_participants enable row level security;
alter table public.program_sessions enable row level security;
alter table public.tickets enable row level security;
alter table public.comments enable row level security;
alter table public.blocks enable row level security;
alter table public.email_outbox enable row level security;

-- Reference data is readable by signed-in users. Mutations and all workflow
-- transitions go through Edge Functions/RPCs added in follow-up migrations.
create policy "authenticated users read departments" on public.departments for select to authenticated using (true);
create policy "authenticated users read places" on public.places for select to authenticated using (true);
create policy "authenticated users read inventory types" on public.inventory_types for select to authenticated using (true);
create policy "authenticated users read shift types" on public.shift_types for select to authenticated using (true);
create policy "authenticated users read program types" on public.program_types for select to authenticated using (true);
create policy "authenticated users read program languages" on public.program_languages for select to authenticated using (true);
create policy "authenticated users read session types" on public.session_types for select to authenticated using (true);
create policy "authenticated users read home content" on public.home_content for select to authenticated using (true);

create policy "users read own profile and approvers read profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_approver());
create policy "approvers read rosters" on public.rosters for select to authenticated using (public.is_approver());
create policy "request viewers read inventory requests" on public.inventory_requests for select to authenticated
  using (public.can_view_inventory_request(id));
create policy "requesters create inventory drafts" on public.inventory_requests for insert to authenticated
  with check (requester_id = auth.uid() and status = 'draft');
create policy "request viewers read inventory participants" on public.inventory_request_participants for select to authenticated
  using (public.can_view_inventory_request(request_id));
create policy "request viewers read inventory items" on public.inventory_request_items for select to authenticated
  using (public.can_view_inventory_request(request_id));
create policy "request viewers read program requests" on public.program_requests for select to authenticated
  using (public.can_view_program_request(id));
create policy "requesters create program drafts" on public.program_requests for insert to authenticated
  with check (requester_id = auth.uid() and status = 'draft');
create policy "request viewers read program participants" on public.program_request_participants for select to authenticated
  using (public.can_view_program_request(request_id));
create policy "request viewers read program sessions" on public.program_sessions for select to authenticated
  using (public.can_view_program_request(request_id));
create policy "approvers read tickets" on public.tickets for select to authenticated using (public.is_approver());
create policy "approvers read blocks" on public.blocks for select to authenticated using (public.is_approver());
create policy "users read visible comments" on public.comments for select to authenticated using (
  (target_type = 'inventory_request' and public.can_view_inventory_request(target_id))
  or (target_type = 'program_request' and public.can_view_program_request(target_id))
  or (target_type = 'ticket' and public.is_approver())
);

-- Files are private. Only a trusted Edge Function issues upload/download URLs
-- after it applies the request access rules above; clients get no broad bucket
-- listing or direct object permissions.
insert into storage.buckets (id, name, public)
values ('request-images', 'request-images', false)
on conflict (id) do nothing;
