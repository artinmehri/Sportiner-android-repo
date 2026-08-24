begin;

drop index if exists public.notifications_user_type_destination_uidx;

create unique index notifications_user_type_destination_uidx
  on public.notifications (user_id, type, destination)
  where destination is not null
    and type in ('nearby_game', 'favorite_park_game', 'player_joined');

commit;
