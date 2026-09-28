-- Keep the text of an unrecognised ?ch= tag next to channel_hint = 'unknown'.
--
-- channel_hint only says a tag was present but not one we publish. channel_raw
-- records what it actually said (e.g. 'tiktok'), so untracked tags can be seen
-- and promoted to real channels.
--
-- The value is visitor-typed. The edge functions reduce it to lowercase letters,
-- digits, dash and underscore and cap it at 64 characters before writing, and
-- product-event writes it only when channel_hint is 'unknown'. The check below
-- enforces the length cap at the DB boundary as well.
--
-- Nullable, no default, no backfill: existing rows never kept the raw text.
-- No index: it is a group-by attribute, not a filter key.

alter table public.product_events
  add column if not exists channel_raw text;

alter table public.product_events
  drop constraint if exists product_events_channel_raw_length_check;
alter table public.product_events
  add constraint product_events_channel_raw_length_check
    check (channel_raw is null or char_length(channel_raw) <= 64);

comment on column public.product_events.channel_raw is
  'Sanitized ?ch= text for an unrecognised tag (lowercase letters, digits, dash, underscore; max 64 chars). Set only when channel_hint = ''unknown''; null otherwise, and null when nothing safe was left after sanitizing.';
