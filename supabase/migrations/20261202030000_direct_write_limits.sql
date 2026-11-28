-- Writes a signed-in user can make straight through the Data API now meet the
-- same limits as writes through the app's API.

-- 1. Requests are created only through the API, which saves a request with its
--    items, sessions and participants in one transaction (save_*_request_tx, as
--    the service role). The insert policies that let a user add a bare draft
--    directly were not used by the app and skipped the API's checks (name
--    length, image path), so they are dropped. Viewers were already refused.
drop policy if exists "requesters create inventory drafts" on public.inventory_requests;
drop policy if exists "requesters create program drafts" on public.program_requests;

-- 2. A user may edit their own profile (the API's updateOwnProfile writes as the
--    user). Hold those writes to the API's lengths: name 200, phone and WhatsApp
--    50 characters. Role, email and sign_in_blocked stay protected by
--    protect_profile_security_fields. Administrator and service writes are not
--    affected.
create or replace function public.limit_profile_contact_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only a changed value is checked, so an older long value never blocks an
  -- edit of another field.
  if current_user = 'authenticated' and (
    (new.name is distinct from old.name and length(coalesce(new.name, '')) > 200)
    or (new.phone is distinct from old.phone and length(coalesce(new.phone, '')) > 50)
    or (new.whatsapp is distinct from old.whatsapp and length(coalesce(new.whatsapp, '')) > 50)
  ) then
    raise exception 'Name must be at most 200 characters, phone and WhatsApp at most 50.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.limit_profile_contact_fields() from public, anon, authenticated;

drop trigger if exists profiles_limit_contact_fields on public.profiles;
create trigger profiles_limit_contact_fields
  before update on public.profiles
  for each row execute procedure public.limit_profile_contact_fields();
