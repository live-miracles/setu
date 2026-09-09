-- The UI supports "Other" as a program type for requests whose title is
-- entered manually. Keep it in the catalog so program_requests' foreign key
-- accepts that special option.
insert into public.program_types (name, color)
values ('Other', '')
on conflict (name) do nothing;
