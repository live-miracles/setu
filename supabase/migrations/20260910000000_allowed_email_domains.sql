-- An empty enabled list intentionally means open access. Once an admin adds
-- the first domain, only exact, case-insensitive domain matches are allowed.
create table public.allowed_email_domains (
  domain citext primary key,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (domain::text ~ '^[^@[:space:]]+\.[^@[:space:]]+$')
);

create trigger allowed_email_domains_set_updated_at
  before update on public.allowed_email_domains
  for each row execute procedure public.set_updated_at();

alter table public.allowed_email_domains enable row level security;

create or replace function public.is_email_domain_allowed(candidate_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.allowed_email_domains where enabled)
    or exists (
      select 1 from public.allowed_email_domains
      where enabled and lower(domain::text) = lower(split_part(coalesce(candidate_email, ''), '@', 2))
    )
$$;

grant execute on function public.is_email_domain_allowed(text) to authenticated, service_role, supabase_auth_admin;

-- Supabase Auth can be configured to call this Postgres function as the
-- Before User Created hook. It runs before auth.users/profile creation.
create or replace function public.restrict_user_by_email_domain(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  candidate_email text := event->'user'->>'email';
begin
  if public.is_email_domain_allowed(candidate_email) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Access is restricted to approved email domains.'
    )
  );
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.restrict_user_by_email_domain(jsonb) to supabase_auth_admin;
revoke execute on function public.restrict_user_by_email_domain(jsonb) from anon, authenticated, public;

create policy "approvers manage allowed email domains"
  on public.allowed_email_domains for all to authenticated
  using (public.is_approver()) with check (public.is_approver());
