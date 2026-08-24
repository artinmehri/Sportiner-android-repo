-- Tracks when the recipient's device confirmed it received the push.
-- The column already exists on the hosted project; this keeps local
-- databases in sync.
alter table public.notifications
  add column if not exists delivered_at timestamptz;
