-- Viewer is the organization-wide read-only role. Keep direct Data API
-- writes aligned with the Edge Function and UI, including requests that the
-- viewer originally created or joined before receiving the viewer role.
drop policy if exists "request participants insert comments" on public.comments;
create policy "request participants insert comments"
  on public.comments for insert to authenticated
  with check (
    public.current_role() <> 'viewer'
    and author_id = auth.uid()
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
