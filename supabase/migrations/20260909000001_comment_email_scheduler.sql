-- Run the comment dispatcher every ten minutes. The job deliberately keeps
-- its endpoint and shared secret in Vault. If either value is absent, the
-- scheduler returns without making an HTTP request; the Edge Function also
-- fails closed when any of its three email settings is absent.

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

  perform net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/email-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dispatch-secret', dispatch_secret
    ),
    body := '{}'::jsonb
  );
end;
$$;

revoke all on function public.run_comment_email_dispatch() from public;

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
