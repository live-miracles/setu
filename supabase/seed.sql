-- Minimal development catalog. `supabase db reset` loads this automatically.
-- Auth profiles are created by the auth trigger after a user signs in; promote
-- the first local user to admin with an explicit SQL update when needed.
insert into public.places (name)
values ('Main Hall'), ('Studio')
on conflict (name) do nothing;

insert into public.inventory_types (name, description, total_quantity)
values
  ('Projector', 'Portable presentation projector', 2),
  ('Microphone', 'Wireless handheld microphone', 4)
on conflict (name) do nothing;

insert into public.shift_types (name, color, default_start_time, default_end_time)
values ('General', '#c84f12', '09:00', '17:00')
on conflict (name) do nothing;

insert into public.program_types (name, color)
values ('Workshop', '#c84f12')
on conflict (name) do nothing;

insert into public.program_languages (name)
values ('English')
on conflict (name) do nothing;

insert into public.session_types (name)
values ('Session')
on conflict (name) do nothing;
