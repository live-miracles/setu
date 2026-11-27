-- A request's lead and its participants listed by email are parties of it.
--
-- A plain user could read a request only if they own it or are a participant
-- with an account. Two groups got the comment emails but could not open the
-- request in Setu:
--   * the request's lead (requests.lead_email, filled from the department), and
--   * a participant added by email before they had an account (external_email).
--
-- Both are matched on the signed-in user's own profile email, which comes from
-- Google sign-in and which users cannot change, and both now count as parties,
-- with the requester's rights: the API (isPartyOfRequest), the workflow action
-- functions (20261201020000) and these read rules all use the same match. That
-- includes drafts, so a lead can see and edit the drafts of their department
-- (the lead email is filled in automatically from the department).
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
    or exists (
      select 1
        from public.inventory_requests r
        join public.profiles me on me.id = auth.uid()
       where r.id = target
         and (
           lower(r.lead_email::text) = lower(me.email::text)
           or exists (
             select 1 from public.inventory_request_participants p
              where p.request_id = r.id
                and lower(p.external_email::text) = lower(me.email::text)
           )
         )
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
    or exists (
      select 1
        from public.program_requests r
        join public.profiles me on me.id = auth.uid()
       where r.id = target
         and (
           lower(r.lead_email::text) = lower(me.email::text)
           or exists (
             select 1 from public.program_request_participants p
              where p.request_id = r.id
                and lower(p.external_email::text) = lower(me.email::text)
           )
         )
    )
$$;
