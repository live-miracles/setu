-- Views an admin has hidden from the navigation and home screen (see
-- supabase/functions/_shared/views.ts). Empty means every view is shown. This
-- is presentation only: nothing in the database or the API reads it.
alter table public.home_content
  add column hidden_views text[] not null default '{}';
