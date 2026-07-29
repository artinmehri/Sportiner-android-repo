
begin;

set local search_path = public, auth, extensions, pg_temp;

create function pg_temp.assert_eq(actual text, expected text, label text)
returns void
language plpgsql
as $$
begin
  if actual is distinct from expected then
    raise exception 'Assertion failed: %, expected %, got %', label, expected, actual;
  end if;
end;
$$;

create function pg_temp.assert_true(value boolean, label text)
returns void
language plpgsql
as $$
begin
  if value is not true then
    raise exception 'Assertion failed: %', label;
  end if;
end;
$$;

create function pg_temp.set_test_claims(user_id uuid, jwt_role text default 'authenticated')
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(user_id::text, ''), true);
  perform set_config('request.jwt.claim.role', jwt_role, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', user_id, 'role', jwt_role)::text,
    true
  );
end;
$$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('84000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'resolve-host@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('84000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'resolve-player@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.users (id, name, accepted_terms, age_group, level)
values
  ('84000000-0000-4000-8000-000000000001', 'Resolver Host Name', true, '18-25', 'Beginner'),
  ('84000000-0000-4000-8000-000000000002', 'Resolver Player', true, '18-25', 'Beginner')
on conflict (id) do update
set name = excluded.name,
    accepted_terms = excluded.accepted_terms,
    age_group = excluded.age_group,
    level = excluded.level;

insert into public.games (
  id, host_id, title, description, type, time, level, location_name,
  game_capacity, players_enrolled, is_public, status, share_enabled, is_test, image
)
values (
  '85000000-0000-4000-8000-000000000001',
  '84000000-0000-4000-8000-000000000001',
  'Resolver Available Game',
  'Public resolver fixture',
  'Group',
  now() + interval '2 days',
  'Beginner',
  'Cedarvale Park',
  4,
  1,
  true,
  'scheduled',
  true,
  false,
  'https://example.test/resolve.jpg'
);

insert into public.game_players (game_id, user_id, role)
values (
  '85000000-0000-4000-8000-000000000001',
  '84000000-0000-4000-8000-000000000001',
  'host'
);

-- Anonymous public resolve
reset role;
do $$
declare
  v_public_id text;
  v_result jsonb;
begin
  select public_id into v_public_id
  from public.games
  where id = '85000000-0000-4000-8000-000000000001';

  v_result := public.resolve_public_game_v1(v_public_id, null);
  if v_result ->> 'state' is distinct from 'available' then
    raise exception 'anon resolve expected available, got %', v_result;
  end if;

  if v_result ? 'viewer' then
    raise exception 'public resolve must not include viewer block';
  end if;

  if (v_result -> 'game') ? 'game_id'
     or (v_result -> 'game') ? 'chat_id'
     or (v_result -> 'game') ? 'host_id'
     or (v_result -> 'game') ? 'coordinates_wkt' then
    raise exception 'public projection leaked private fields: %', v_result -> 'game';
  end if;

  if (v_result -> 'game' ->> 'host_first_name') is distinct from 'Resolver' then
    raise exception 'host first name expected Resolver, got %', v_result -> 'game' ->> 'host_first_name';
  end if;

  -- Bad share code is indistinguishable from missing.
  v_result := public.resolve_public_game_v1(v_public_id, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  if v_result ->> 'state' is distinct from 'not_found_or_restricted' then
    raise exception 'bad share code should be restricted, got %', v_result;
  end if;

  v_result := public.resolve_public_game_v1('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', null);
  if v_result ->> 'state' is distinct from 'not_found_or_restricted' then
    raise exception 'missing game should be restricted, got %', v_result;
  end if;
end $$;

-- Authenticated viewer resolve
set local role authenticated;
select pg_temp.set_test_claims('84000000-0000-4000-8000-000000000002');

do $$
declare
  v_public_id text;
  v_result jsonb;
begin
  select public_id into v_public_id
  from public.games
  where id = '85000000-0000-4000-8000-000000000001';

  v_result := public.resolve_game_for_viewer_v1(v_public_id, v_public_id);
  if v_result ->> 'state' is distinct from 'available' then
    raise exception 'viewer resolve expected available, got %', v_result;
  end if;

  if (v_result -> 'viewer' ->> 'game_id') is distinct from '85000000-0000-4000-8000-000000000001' then
    raise exception 'viewer should receive internal game id';
  end if;

  if (v_result -> 'viewer' -> 'join_eligibility' ->> 'mode') is distinct from 'immediate' then
    raise exception 'join mode must be immediate';
  end if;

  if (v_result -> 'viewer' -> 'join_eligibility' ->> 'can_join') is distinct from 'true' then
    raise exception 'eligible viewer should can_join';
  end if;
end $$;

reset role;

-- Cancelled state
update public.games
set status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = '84000000-0000-4000-8000-000000000001',
    share_enabled = false
where id = '85000000-0000-4000-8000-000000000001';

do $$
declare
  v_public_id text;
  v_result jsonb;
begin
  select public_id into v_public_id
  from public.games
  where id = '85000000-0000-4000-8000-000000000001';

  -- share_enabled false => restricted/not found for public link validity
  v_result := public.resolve_public_game_v1(v_public_id, null);
  if v_result ->> 'state' not in ('cancelled', 'not_found_or_restricted') then
    raise exception 'cancelled game unexpected state %', v_result;
  end if;
end $$;

-- Kill switch
update public.growth_flags
set enabled = false
where key = 'growth_public_links';

select pg_temp.assert_eq(
  public.resolve_public_game_v1('cccccccccccccccccccccccccccccccc', null) ->> 'state',
  'maintenance',
  'kill switch returns maintenance'
);

update public.growth_flags
set enabled = true
where key = 'growth_public_links';

rollback;

