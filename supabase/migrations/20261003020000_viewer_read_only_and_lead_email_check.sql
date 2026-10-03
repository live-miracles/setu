-- Viewer is the organization-wide read-only role. The Edge Function already
-- refuses viewer writes; close the same gap for direct Data API inserts.
drop policy if exists "requesters create inventory drafts" on public.inventory_requests;
create policy "requesters create inventory drafts" on public.inventory_requests
  for insert to authenticated
  with check (
    requester_id = auth.uid()
    and status = 'draft'
    and public.current_role() <> 'viewer'
  );

drop policy if exists "requesters create program drafts" on public.program_requests;
create policy "requesters create program drafts" on public.program_requests
  for insert to authenticated
  with check (
    requester_id = auth.uid()
    and status = 'draft'
    and public.current_role() <> 'viewer'
  );

-- The lead email becomes a mail recipient. The API validates it, but drafts can
-- also be inserted directly, so reject anything that is not exactly one address.
-- A trigger on lead_email (rather than a CHECK constraint) leaves status-only
-- updates of older rows untouched.
create or replace function public.validate_request_lead_email()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.lead_email::text <> ''
     and (
       length(new.lead_email::text) > 254
       or new.lead_email::text !~ '^[^\s@,;:<>()\[\]"\\]+@[^\s@,;:<>()\[\]"\\]+\.[^\s@,;:<>()\[\]"\\]+$'
     ) then
    raise exception 'Lead email must be a single valid email address.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_requests_validate_lead_email on public.inventory_requests;
create trigger inventory_requests_validate_lead_email
  before insert or update of lead_email on public.inventory_requests
  for each row execute procedure public.validate_request_lead_email();

drop trigger if exists program_requests_validate_lead_email on public.program_requests;
create trigger program_requests_validate_lead_email
  before insert or update of lead_email on public.program_requests
  for each row execute procedure public.validate_request_lead_email();
