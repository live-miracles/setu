-- Keep every comment email of a request in one Gmail conversation. The
-- dispatcher records the Gmail thread of each sent email and reuses the
-- request's first thread for later ones.
alter table public.email_outbox add column provider_thread_id text;

create index email_outbox_comment_thread_idx
  on public.email_outbox ((payload ->> 'targetId'), sent_at)
  where template = 'comment' and status = 'sent' and provider_thread_id is not null;
