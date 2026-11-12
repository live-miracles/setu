-- Comment email delivery moves from the Apps Script worker to the
-- email-dispatcher Edge Function, which sends through the Gmail API. Restore
-- the ten-minute cron caller removed in 20260924130000.
--
-- The endpoint and shared secret stay in Vault (setu_project_url and
-- setu_email_dispatch_secret). Without them the scheduler makes no request,
-- and the Edge Function also does nothing until its Gmail secrets are set.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.run_comment_email_dispatch()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  project_url text;
  dispatch_secret text;
begin
  select decrypted_secret into project_url
    from vault.decrypted_secrets where name = 'setu_project_url' limit 1;
  select decrypted_secret into dispatch_secret
    from vault.decrypted_secrets where name = 'setu_email_dispatch_secret' limit 1;

  if coalesce(trim(project_url), '') = '' or coalesce(trim(dispatch_secret), '') = '' then
    return;
  end if;

  -- pg_net cancels requests after 2 seconds by default; a batch of Gmail
  -- sends takes longer. Stay under the 150-second Edge Function wall clock.
  perform net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/email-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dispatch-secret', dispatch_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 140000
  );
end;
$$;

revoke all on function public.run_comment_email_dispatch() from public, anon, authenticated;
grant execute on function public.run_comment_email_dispatch() to service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'setu-comment-email-dispatch';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'setu-comment-email-dispatch',
    '*/10 * * * *',
    'select public.run_comment_email_dispatch();'
  );
end;
$$;
