-- Several SECURITY DEFINER functions were created with `revoke ... from public`
-- only. Supabase grants EXECUTE on new public-schema functions to anon,
-- authenticated and service_role through default privileges, so those explicit
-- grants survived and the functions stayed callable through /rest/v1/rpc by
-- any signed-in (or, with the publishable key, anonymous) caller. They are
-- meant for triggers, cron and the service-role Edge Function only.
--
-- Each statement is guarded so the migration is safe on databases where an
-- optional function (for example the cron helpers) was never created.
do $$
declare
  fn regprocedure;
begin
  foreach fn in array array[
    to_regprocedure('public.handle_new_user()'),
    to_regprocedure('public.enqueue_comment_emails()'),
    to_regprocedure('public.enrich_comment_email_details()'),
    to_regprocedure('public.claim_comment_email_batch(integer)'),
    to_regprocedure('public.run_comment_email_dispatch()'),
    to_regprocedure('public.cleanup_stale_operational_rows()'),
    to_regprocedure('public.create_overdue_inventory_reminders()'),
    to_regprocedure('public.delete_inventory_type_with_items(uuid)'),
    to_regprocedure('public.protect_profile_security_fields()'),
    to_regprocedure('public.is_email_domain_allowed(text)')
  ]
  loop
    continue when fn is null;
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

-- The auth hook runs as supabase_auth_admin and still needs these two.
grant execute on function public.is_email_domain_allowed(text) to supabase_auth_admin;

-- Row-level-security helpers and the availability aggregate are evaluated as
-- the signed-in role. Signed-in users keep access; anonymous callers lose it.
do $$
declare
  fn regprocedure;
begin
  foreach fn in array array[
    to_regprocedure('public.current_role()'),
    to_regprocedure('public.is_approver()'),
    to_regprocedure('public.is_admin()'),
    to_regprocedure('public.can_view_inventory_request(uuid)'),
    to_regprocedure('public.can_view_program_request(uuid)'),
    to_regprocedure('public.inventory_availability()')
  ]
  loop
    continue when fn is null;
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end;
$$;
