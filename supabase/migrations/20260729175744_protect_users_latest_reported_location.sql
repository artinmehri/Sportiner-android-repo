alter table public.users
  add column if not exists latest_reported_location
  public.geography(Point, 4326);

alter table public.users
  alter column latest_reported_location
  type public.geography(Point, 4326)
  using latest_reported_location::public.geography(Point, 4326);

comment on column public.users.latest_reported_location is
  'Latest accepted foreground location. Restricted from app roles and maintained through upsert_latest_user_location_v1.';

create index if not exists users_latest_reported_location_gix
  on public.users using gist (latest_reported_location);

-- RLS protects rows, not individual columns. Remove broad table privileges and
-- restore only the profile columns that the authenticated mobile app needs.
revoke select, insert, update on public.users from authenticated;

grant select (
  id,
  created_at,
  name,
  profile_picture,
  email,
  age_group,
  level,
  availability,
  city,
  last_active_at,
  elo,
  "gamesPlayed",
  reliability_score,
  updated_at,
  accepted_terms,
  onboarding_version,
  onboarding_stage,
  onboarding_completed_at,
  favorite_park
) on public.users to authenticated;

grant insert (
  id,
  created_at,
  name,
  profile_picture,
  email,
  age_group,
  level,
  availability,
  city,
  last_active_at,
  elo,
  "gamesPlayed",
  reliability_score,
  updated_at,
  accepted_terms,
  onboarding_version,
  onboarding_stage,
  onboarding_completed_at,
  favorite_park
) on public.users to authenticated;

grant update (
  name,
  profile_picture,
  email,
  age_group,
  level,
  availability,
  city,
  last_active_at,
  elo,
  "gamesPlayed",
  reliability_score,
  updated_at,
  accepted_terms,
  onboarding_version,
  onboarding_stage,
  onboarding_completed_at,
  favorite_park
) on public.users to authenticated;

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
  v_location public.geography(Point, 4326);
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

  v_location := public.st_setsrid(
    public.st_makepoint(p_longitude, p_latitude),
    4326
  )::public.geography(Point, 4326);

  insert into private.user_latest_locations (
    user_id,
    location,
    accuracy_meters,
    source,
    updated_at
  )
  values (
    v_user_id,
    v_location,
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

  update public.users
  set latest_reported_location = v_location
  where id = v_user_id;

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

  update public.users
  set latest_reported_location = null
  where id = v_user_id;

  return jsonb_build_object(
    'success', true,
    'cleared', v_deleted_count > 0
  );
end;
$$;

revoke all on function public.upsert_latest_user_location_v1(
  double precision,
  double precision,
  double precision,
  text
) from public, anon;
revoke all on function public.clear_latest_user_location_v1() from public, anon;

grant execute on function public.upsert_latest_user_location_v1(
  double precision,
  double precision,
  double precision,
  text
) to authenticated;
grant execute on function public.clear_latest_user_location_v1() to authenticated;

notify pgrst, 'reload schema';
