-- Favorite-park notification eligibility + duplicate protection.

begin;

-- Production notify workers already use these columns; ensure they exist locally.
alter table public.notifications
  add column if not exists destination text,
  add column if not exists push_sent boolean not null default false,
  add column if not exists pushed_at timestamptz;

comment on column public.notifications.destination is
  'Stable event key used for idempotent notification creation (not a client route).';

-- One nearby/favorite-park notification per user per game/event key.
create unique index if not exists notifications_user_type_destination_uidx
  on public.notifications (user_id, type, destination)
  where destination is not null
    and type in ('nearby_game', 'favorite_park_game');

create index if not exists notifications_nearby_daily_push_idx
  on public.notifications (user_id, pushed_at desc)
  where type = 'nearby_game'
    and push_sent = true;

commit;
