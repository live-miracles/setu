-- The display name on outgoing emails, set by an Admin in Other settings. Empty
-- means the dispatcher uses its built-in default. Only the API (service role)
-- writes it, like the rest of home_content, and the email dispatcher reads it
-- with the service role.
alter table public.home_content
  add column email_sender_name text not null default ''
  check (char_length(email_sender_name) <= 60);
