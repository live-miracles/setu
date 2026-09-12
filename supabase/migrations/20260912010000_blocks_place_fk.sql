-- blocks.place stored a place id as free text with no foreign key, using ''
-- as a sentinel for "applies to all places". A renamed id was fine (it's an
-- id, not a name) but a deleted place left the block pointing at nothing,
-- and nothing caught a typo'd id. table is empty in every environment, so
-- this replaces the column outright rather than backfilling it.
alter table public.blocks drop column place;
alter table public.blocks add column place_id uuid references public.places(id) on delete restrict;
