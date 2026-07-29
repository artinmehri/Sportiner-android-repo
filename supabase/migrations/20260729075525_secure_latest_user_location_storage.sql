create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to service_role;

create table if not exists private.user_latest_locations (
  user_id uuid primary key
    references public.users(id)
    on delete cascade,
  location public.geography(Point, 4326) not null,
  accuracy_meters double precision not null
    check (accuracy_meters between 0 and 2000),
  source text not null
    check (
      source in (
        'onboarding',
        'app_open',
        'app_foreground',
        'nearby_games',
        'create_game',
        'join_game'
      )
    ),
  updated_at timestamptz not null default clock_timestamp()
);

comment on table private.user_latest_locations is
  'One private latest-known foreground location per consenting user.';
comment on column private.user_latest_locations.location is
  'PostGIS geography point in SRID 4326. Longitude is X and latitude is Y.';
comment on column private.user_latest_locations.updated_at is
  'Server timestamp for the most recent accepted foreground location report.';

alter table private.user_latest_locations enable row level security;
alter table private.user_latest_locations force row level security;

revoke all on private.user_latest_locations from public, anon, authenticated;
grant select, insert, update, delete on private.user_latest_locations to service_role;

create index if not exists user_latest_locations_location_gix
  on private.user_latest_locations using gist (location);

create index if not exists user_latest_locations_updated_at_idx
  on private.user_latest_locations (updated_at desc);

-- Preserve any location rows written between the first migration and this hardening pass.
insert into private.user_latest_locations (
  user_id,
  location,
  accuracy_meters,
  source,
  updated_at
)
select
  id,
  latest_location,
  latest_location_accuracy_meters,
  latest_location_source,
  latest_location_updated_at
from public.users
where latest_location is not null
on conflict (user_id) do update
set
  location = excluded.location,
  accuracy_meters = excluded.accuracy_meters,
  source = excluded.source,
  updated_at = excluded.updated_at;

create or replace function public.upsert_latest_user_location_v1(
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated_at timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_latitude is null or p_latitude not between -90 and 90 then
    raise exception 'Latitude must be between -90 and 90' using errcode = '22023';
  end if;

  if p_longitude is null or p_longitude not between -180 and 180 then
    raise exception 'Longitude must be between -180 and 180' using errcode = '22023';
  end if;

  if p_latitude = 0 and p_longitude = 0 then
    raise exception 'Zero coordinates are not accepted' using errcode = '22023';
  end if;

  if p_accuracy_meters is null or p_accuracy_meters not between 0 and 2000 then
    raise exception 'Location accuracy must be between 0 and 2000 meters'
      using errcode = '22023';
  end if;

  if p_source is null or p_source not in (
    'onboarding',
    'app_open',
    'app_foreground',
    'nearby_games',
    'create_game',
    'join_game'
  ) then
    raise exception 'Unsupported location source' using errcode = '22023';
  end if;

  if not exists (select 1 from public.users where id = v_user_id) then
    raise exception 'User profile not found' using errcode = 'P0002';
  end if;

  insert into private.user_latest_locations (
    user_id,
    location,
    accuracy_meters,
    source,
    updated_at
  )
  values (
    v_user_id,
    public.st_setsrid(
      public.st_makepoint(p_longitude, p_latitude),
      4326
    )::public.geography,
    p_accuracy_meters,
    p_source,
    v_updated_at
  )
  on conflict (user_id) do update
  set
    location = excluded.location,
    accuracy_meters = excluded.accuracy_meters,
    source = excluded.source,
    updated_at = excluded.updated_at;

  return jsonb_build_object(
    'success', true,
    'updatedAt', v_updated_at
  );
end;
$$;

create or replace function public.clear_latest_user_location_v1()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := auth.uid();
  v_deleted_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  delete from private.user_latest_locations
  where user_id = v_user_id;

  get diagnostics v_deleted_count = row_count;

  return jsonb_build_object(
    'success', true,
    'cleared', v_deleted_count > 0
  );
end;
$$;

create or replace function public.get_nearby_users_for_game_v1(
  p_game_id uuid,
  p_radius_meters integer default 5000,
  p_max_age_hours integer default 24
)
returns table (
  user_id uuid,
  distance_meters double precision,
  accuracy_meters double precision,
  source text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if p_radius_meters not between 100 and 50000 then
    raise exception 'Radius must be between 100 and 50000 meters'
      using errcode = '22023';
  end if;

  if p_max_age_hours not between 1 and 168 then
    raise exception 'Maximum location age must be between 1 and 168 hours'
      using errcode = '22023';
  end if;

  return query
  select
    latest.user_id,
    public.st_distance(latest.location, game.location_cords) as distance_meters,
    latest.accuracy_meters,
    latest.source,
    latest.updated_at
  from public.games as game
  join private.user_latest_locations as latest
    on latest.user_id <> game.host_id
  where game.id = p_game_id
    and game.location_cords is not null
    and latest.updated_at >= clock_timestamp() - make_interval(hours => p_max_age_hours)
    and public.st_dwithin(latest.location, game.location_cords, p_radius_meters)
    and not exists (
      select 1
      from public.game_players as player
      where player.game_id = game.id
        and player.user_id = latest.user_id
    )
  order by latest.location <-> game.location_cords;
end;
$$;

revoke all on function public.upsert_latest_user_location_v1(
  double precision,
  double precision,
  double precision,
  text
) from public, anon;
revoke all on function public.clear_latest_user_location_v1() from public, anon;
revoke all on function public.get_nearby_users_for_game_v1(
  uuid,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.upsert_latest_user_location_v1(
  double precision,
  double precision,
  double precision,
  text
) to authenticated;
grant execute on function public.clear_latest_user_location_v1() to authenticated;
grant execute on function public.get_nearby_users_for_game_v1(
  uuid,
  integer,
  integer
) to service_role;

drop index if exists public.users_latest_location_gix;
drop index if exists public.users_latest_location_updated_at_idx;

alter table public.users
  drop column if exists latest_location,
  drop column if exists latest_location_accuracy_meters,
  drop column if exists latest_location_source,
  drop column if exists latest_location_updated_at;

-- Restore the existing profile-table contract for already-installed app versions.
grant select, insert, update on public.users to authenticated;

notify pgrst, 'reload schema';
