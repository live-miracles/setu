-- Addresses that receive a copy of every comment email. Admins manage the list
-- in Other settings; the email dispatcher (service role) reads it when it sends.
-- It replaces the CC_EMAIL function secret, so the list no longer needs access
-- to the Supabase dashboard to change.
create table public.email_cc_addresses (
  email citext primary key,
  created_at timestamptz not null default now(),
  check (
    length(email::text) <= 254
    and email::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  )
);

alter table public.email_cc_addresses enable row level security;

create policy "admins manage email cc addresses"
  on public.email_cc_addresses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
