-- The order an admin chose for the views in the menu and the board switches (see
-- supabase/functions/_shared/views.ts). Empty means the default order. Like
-- hidden_views this is presentation only: nothing in the database or the API
-- reads it.
alter table public.home_content
  add column view_order text[] not null default '{}';
