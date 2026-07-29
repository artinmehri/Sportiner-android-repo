
begin;

set local search_path = public, auth, extensions, pg_temp;

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

create function pg_temp.assert_count(query text, expected integer, label text)
returns void
language plpgsql
as $$
declare
  actual integer;
begin
  execute format('select count(*)::integer from (%s) as assertion_query', query)
    into actual;

  if actual <> expected then
    raise exception 'Assertion failed: %, expected %, got %', label, expected, actual;
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
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('82000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'atomic-host@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('82000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'atomic-player@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('82000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'atomic-player-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.users (id, name, accepted_terms, age_group, level)
values
  ('82000000-0000-4000-8000-000000000001', 'Atomic Host', true, '18-25', 'Intermediate'),
  ('82000000-0000-4000-8000-000000000002', 'Atomic Player', true, '18-25', 'Intermediate'),
  ('82000000-0000-4000-8000-000000000003', 'Atomic Player B', true, '18-25', 'Intermediate')
on conflict (id) do update
set
  name = excluded.name,
  accepted_terms = excluded.accepted_terms,
  age_group = excluded.age_group,
  level = excluded.level;

set local role authenticated;
select pg_temp.set_test_claims('82000000-0000-4000-8000-000000000001');

select pg_temp.assert_eq(
  public.create_game_v1(
    jsonb_build_object(
      'title', 'Atomic create game',
      'description', 'RPC create fixture',
      'type', 'Group',
      'level', 'Intermediate',
      'time', (now() + interval '2 days')::text,
      'location_name', 'Cedarvale Park',
      'game_capacity', 2,
      'is_booked', false,
      'is_paid', false,
      'court_type', 'Public',
      'image', 'https://example.test/game.jpg'
    ),
    '83000000-0000-4000-8000-000000000001'::uuid
  ) ->> 'code',
  'created',
  'create_game_v1 creates game'
);

select pg_temp.assert_eq(
  public.create_game_v1(
    jsonb_build_object(
      'title', 'Should not duplicate',
      'description', 'ignored',
      'type', 'Group',
      'level', 'Intermediate',
      'time', (now() + interval '2 days')::text,
      'game_capacity', 2
    ),
    '83000000-0000-4000-8000-000000000001'::uuid
  ) ->> 'code',
  'created',
  'create_game_v1 idempotent replay returns created'
);

select pg_temp.assert_count(
  'select * from public.games where host_id = ''82000000-0000-4000-8000-000000000001'' and title = ''Atomic create game''',
  1,
  'idempotent create does not duplicate games'
);

select pg_temp.assert_count(
  'select gp.* from public.game_players gp join public.games g on g.id = gp.game_id where g.title = ''Atomic create game'' and gp.role = ''host''',
  1,
  'create includes host membership'
);

select pg_temp.assert_count(
  'select c.* from public.chat c join public.games g on g.chat_id = c.id where g.title = ''Atomic create game''',
  1,
  'create attaches chat atomically'
);

reset role;

select pg_temp.assert_count(
  'select * from public.product_events where event_name = ''game_created'' and user_id = ''82000000-0000-4000-8000-000000000001''',
  1,
  'create emits one game_created event across replay'
);

do $$
declare
  v_public_id text;
  v_game_id uuid;
  v_join jsonb;
  v_join_replay jsonb;
  v_full jsonb;
  v_leave jsonb;
  v_cancel jsonb;
  v_blocked jsonb;
  v_enrolled integer;
begin
  select public_id, id
  into v_public_id, v_game_id
  from public.games
  where title = 'Atomic create game'
  limit 1;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', '82000000-0000-4000-8000-000000000002', 'role', 'authenticated')::text,
    true
  );

  v_join := public.join_game_v1(
    v_public_id,
    '83000000-0000-4000-8000-000000000011'::uuid,
    v_public_id
  );
  if v_join ->> 'code' is distinct from 'joined' then
    raise exception 'join expected joined, got %', v_join;
  end if;

  v_join_replay := public.join_game_v1(
    v_public_id,
    '83000000-0000-4000-8000-000000000011'::uuid,
    v_public_id
  );
  if v_join_replay ->> 'code' is distinct from 'joined' then
    raise exception 'join replay expected joined, got %', v_join_replay;
  end if;

  perform set_config('role', 'none', true);
  reset role;

  if (
    select count(*) from public.product_events
    where event_name = 'game_join_completed'
      and game_id = v_game_id::text
  ) <> 1 then
    raise exception 'join must emit one game_join_completed event';
  end if;

  select players_enrolled into v_enrolled from public.games where id = v_game_id;
  if v_enrolled <> 2 then
    raise exception 'players_enrolled should be 2 after join, got %', v_enrolled;
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  perform set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000003', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', '82000000-0000-4000-8000-000000000003', 'role', 'authenticated')::text,
    true
  );

  v_full := public.join_game_v1(
    v_public_id,
    '83000000-0000-4000-8000-000000000012'::uuid,
    null
  );
  if v_full ->> 'code' is distinct from 'full' then
    raise exception 'concurrent last-spot contention expected full, got %', v_full;
  end if;

  -- Leave opens one spot and recalculates cache
  perform set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', '82000000-0000-4000-8000-000000000002', 'role', 'authenticated')::text,
    true
  );

  v_leave := public.leave_game_v1(
    v_public_id,
    '83000000-0000-4000-8000-000000000021'::uuid
  );
  if v_leave ->> 'code' is distinct from 'left' then
    raise exception 'leave expected left, got %', v_leave;
  end if;

  select players_enrolled into v_enrolled from public.games where id = v_game_id;
  if v_enrolled <> 1 then
    raise exception 'players_enrolled after leave should be 1, got %', v_enrolled;
  end if;

  if exists (
    select 1 from public.game_requests where game_id = v_game_id
  ) then
    raise exception 'join/leave must never create game_requests rows';
  end if;

  perform set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000001', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', '82000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text,
    true
  );

  v_cancel := public.cancel_game_v1(
    v_public_id,
    '83000000-0000-4000-8000-000000000031'::uuid
  );
  if v_cancel ->> 'code' is distinct from 'cancelled' then
    raise exception 'cancel expected cancelled, got %', v_cancel;
  end if;

  perform set_config('role', 'none', true);
  reset role;

  if (
    select count(*) from public.product_events
    where event_name = 'game_cancelled' and game_id = v_game_id::text
  ) <> 1 then
    raise exception 'cancel must emit one game_cancelled event';
  end if;

  -- Preserve roster after cancel
  if (
    select count(*) from public.game_players where game_id = v_game_id
  ) < 1 then
    raise exception 'cancel must preserve lifecycle roster rows';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000003', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', '82000000-0000-4000-8000-000000000003', 'role', 'authenticated')::text,
    true
  );

  v_blocked := public.join_game_v1(
    v_public_id,
    '83000000-0000-4000-8000-000000000014'::uuid,
    null
  );
  if v_blocked ->> 'code' is distinct from 'cancelled' then
    raise exception 'join after cancel expected cancelled, got %', v_blocked;
  end if;
end $$;

reset role;

rollback;

