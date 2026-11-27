-- The roster is for staff. Ordinary users ('user') no longer read it; admins,
-- approvers and viewers do. Scheduling writes still go through the Edge
-- Function's requireApprover checks.
drop policy if exists "authenticated users read rosters" on public.rosters;
create policy "staff read rosters" on public.rosters
  for select to authenticated using (public.current_role() <> 'user');
