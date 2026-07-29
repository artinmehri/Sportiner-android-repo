alter table public.users
  add column if not exists latest_location public.geography(Point, 4326),
  add column if not exists latest_location_accuracy_meters double precision,
  add column if not exists latest_location_source text,
  add column if not exists latest_location_updated_at timestamptz;

comment on column public.users.latest_location is
  'Latest foreground location reported by the consenting user. Backend-only raw coordinate.';
comment on column public.users.latest_location_accuracy_meters is
  'Horizontal accuracy, in meters, reported by the device for latest_location.';
comment on column public.users.latest_location_source is
  'App lifecycle or user action that caused the latest foreground location refresh.';
comment on column public.users.latest_location_updated_at is
  'Server timestamp for the most recent accepted foreground location report.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_latest_location_accuracy_valid'
  ) then
    alter table public.users
      add constraint users_latest_location_accuracy_valid
      check (
        latest_location_accuracy_meters is null
        or latest_location_accuracy_meters between 0 and 2000
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_latest_location_source_valid'
  ) then
    alter table public.users
      add constraint users_latest_location_source_valid
      check (
        latest_location_source is null
        or latest_location_source in (
          'onboarding',
          'app_open',
          'app_foreground',
          'nearby_games',
          'create_game',
          'join_game'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_latest_location_fields_consistent'
  ) then
    alter table public.users
      add constraint users_latest_location_fields_consistent
      check (
        (
          latest_location is null
          and latest_location_accuracy_meters is null
          and latest_location_source is null
          and latest_location_updated_at is null
        )
        or (
          latest_location is not null
          and latest_location_accuracy_meters is not null
          and latest_location_source is not null
          and latest_location_updated_at is not null
        )
      );
  end if;
end;
$$;

create index if not exists users_latest_location_gix
  on public.users using gist (latest_location)
  where latest_location is not null;

create index if not exists users_latest_location_updated_at_idx
  on public.users (latest_location_updated_at desc)
  where latest_location is not null;

create or replace function public.upsert_latest_user_location_v1(
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
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

  update public.users
  set
    latest_location = public.st_setsrid(
      public.st_makepoint(p_longitude, p_latitude),
      4326
    )::public.geography,
    latest_location_accuracy_meters = p_accuracy_meters,
    latest_location_source = p_source,
    latest_location_updated_at = v_updated_at
  where id = v_user_id;

  if not found then
    raise exception 'User profile not found' using errcode = 'P0002';
  end if;

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
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.users
  set
    latest_location = null,
    latest_location_accuracy_meters = null,
    latest_location_source = null,
    latest_location_updated_at = null
  where id = v_user_id;

  return jsonb_build_object(
    'success', true,
    'cleared', found
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

-- The users table is profile-readable by authenticated users. RLS only filters rows,
-- so column grants are required to keep raw coordinates out of ordinary clients.
revoke select, insert, update on public.users from authenticated;

do $$
declare
  v_safe_columns text;
begin
  select string_agg(format('%I', attribute.attname), ', ' order by attribute.attnum)
  into v_safe_columns
  from pg_attribute as attribute
  where attribute.attrelid = 'public.users'::regclass
    and attribute.attnum > 0
    and not attribute.attisdropped
    and attribute.attname not in (
      'latest_location',
      'latest_location_accuracy_meters',
      'latest_location_source',
      'latest_location_updated_at'
    );

  execute format(
    'grant select (%s) on public.users to authenticated',
    v_safe_columns
  );
  execute format(
    'grant insert (%s) on public.users to authenticated',
    v_safe_columns
  );
  execute format(
    'grant update (%s) on public.users to authenticated',
    v_safe_columns
  );
end;
$$;

notify pgrst, 'reload schema';
