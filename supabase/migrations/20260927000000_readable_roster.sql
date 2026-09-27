-- Roster schedules are readable reference data. Scheduling mutations remain
-- protected by the Edge Function's requireApprover checks.
drop policy if exists "approvers read rosters" on public.rosters;
create policy "authenticated users read rosters" on public.rosters
  for select to authenticated using (true);
