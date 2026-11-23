-- Members added by an administrator before they have an organisation email.
-- Their auth identity exists (rosters and requests point at profiles, which
-- point at auth.users) but is banned, so they cannot sign in. The flag lets the
-- app show that state and limits the email change to these accounts. It is
-- cleared when an administrator sets their work email.
alter table public.profiles
  add column sign_in_blocked boolean not null default false;

create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated' and (
    new.role is distinct from old.role
    or new.email is distinct from old.email
    or new.sign_in_blocked is distinct from old.sign_in_blocked
  ) then
    raise exception 'Role and email can only be changed by an administrator.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
