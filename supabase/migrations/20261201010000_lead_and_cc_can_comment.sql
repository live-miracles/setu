-- Comments follow the read rule: whoever can open a request may comment on it.
--
-- The insert policy listed who may comment (approvers, the requester,
-- participants with an account). It now asks the same question the read policy
-- asks, can_view_*_request, so anyone who can open a request can comment on it,
-- except the read-only Viewer role. For a plain user that is exactly a party
-- (the requester, a participant, the request's lead, a participant listed by
-- email; see 20261201000000). Approvers and Admins could always comment.
--
-- Everything else about a comment is unchanged: the author must be the caller,
-- only plain comments can be inserted (status and edit events stay with the SQL
-- functions), and a comment is limited to 5000 characters.
drop policy if exists "request participants insert comments" on public.comments;
create policy "request participants insert comments"
  on public.comments for insert to authenticated
  with check (
    public.current_role() <> 'viewer'
    and author_id = auth.uid()
    and author_name is null
    and kind = 'comment'
    and data is null
    and (
      (inventory_request_id is not null and public.can_view_inventory_request(inventory_request_id))
      or (program_request_id is not null and public.can_view_program_request(program_request_id))
    )
  );
