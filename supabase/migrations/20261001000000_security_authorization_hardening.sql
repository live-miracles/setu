-- Close direct Data API authorization gaps found during the pre-rollout
-- review. The email-domain session behavior remains intentionally unchanged.

create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated' and (
    new.role is distinct from old.role
    or new.email is distinct from old.email
  ) then
    raise exception 'Role and email can only be changed by an administrator.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_profile_security_fields() from public;

drop trigger if exists profiles_protect_security_fields on public.profiles;
create trigger profiles_protect_security_fields
  before update on public.profiles
  for each row execute procedure public.protect_profile_security_fields();

drop policy if exists "approvers manage allowed email domains" on public.allowed_email_domains;
create policy "admins manage allowed email domains"
  on public.allowed_email_domains for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "users insert visible comments" on public.comments;
create policy "request participants insert comments"
  on public.comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and author_name is null
    and (
      (
        inventory_request_id is not null
        and (
          public.is_approver()
          or exists (
            select 1 from public.inventory_requests r
            where r.id = inventory_request_id and r.requester_id = auth.uid()
          )
          or exists (
            select 1 from public.inventory_request_participants p
            where p.request_id = inventory_request_id and p.profile_id = auth.uid()
          )
        )
      )
      or (
        program_request_id is not null
        and (
          public.is_approver()
          or exists (
            select 1 from public.program_requests r
            where r.id = program_request_id and r.requester_id = auth.uid()
          )
          or exists (
            select 1 from public.program_request_participants p
            where p.request_id = program_request_id and p.profile_id = auth.uid()
          )
        )
      )
    )
  );

-- Existing rows are a short-lived retry cache. Give them a sentinel actor so
-- deploying this migration does not need to discard in-flight results; they
-- expire through the existing six-hour cleanup job.
alter table public.idempotency_keys add column actor_id uuid;
update public.idempotency_keys
set actor_id = '00000000-0000-0000-0000-000000000000'
where actor_id is null;
alter table public.idempotency_keys alter column actor_id set not null;
alter table public.idempotency_keys drop constraint idempotency_keys_pkey;
alter table public.idempotency_keys
  add primary key (actor_id, scope, request_id);
