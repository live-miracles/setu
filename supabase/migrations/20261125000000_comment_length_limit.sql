-- The API caps a comment at 4000 characters and an action note at the same, but
-- a signed-in user can also insert a comment straight through the Data API. Cap
-- the stored message there too. The limit leaves room for the activity text that
-- is put in front of an action note. NOT VALID checks every new row without
-- scanning or rejecting the rows already stored.
alter table public.comments
  add constraint comments_message_length check (length(message) <= 5000) not valid;
