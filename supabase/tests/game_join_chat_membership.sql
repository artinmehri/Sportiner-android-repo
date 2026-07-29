\echo 'Game join and chat membership contract tests'

begin;

set local search_path = public, auth, pg_temp;

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

create function pg_temp.assert_throws(query text, label text)
returns void
language plpgsql
as $$
begin
  begin
    execute query;
  exception when others then
    return;
  end;

  raise exception 'Expected statement to fail: %', label;
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
  ('92000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'join-host@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('92000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'join-player@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('92000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'join-outsider@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.users (id, name, accepted_terms, age_group, level)
values
  ('92000000-0000-4000-8000-000000000001', 'Join Host', true, '18-25', 'Intermediate'),
  ('92000000-0000-4000-8000-000000000002', 'Join Player', true, '18-25', 'Intermediate'),
  ('92000000-0000-4000-8000-000000000003', 'Join Outsider', true, '18-25', 'Intermediate')
on conflict (id) do update
set name = excluded.name,
    accepted_terms = excluded.accepted_terms,
    age_group = excluded.age_group,
    level = excluded.level;

select pg_temp.assert_true(
  has_function_privilege(
    'authenticated',
    'public.join_public_game(uuid)',
    'execute'
  ),
  'authenticated users can execute join_public_game'
);

select pg_temp.assert_true(
  not has_function_privilege(
    'anon',
    'public.ensure_game_chat_membership_v1(uuid)',
    'execute'
  ),
  'anonymous users cannot repair game chat membership'
);

select pg_temp.assert_true(
  not has_function_privilege(
    'authenticated',
    'public.ensure_game_chat(public.games,text)',
    'execute'
  ),
  'authenticated users cannot execute the internal chat helper'
);

set local role authenticated;
select pg_temp.set_test_claims('92000000-0000-4000-8000-000000000001');

insert into public.games (
  id,
  host_id,
  title,
  description,
  type,
  time,
  level,
  is_public,
  game_capacity,
  players_enrolled,
  location_name
)
values (
  '92000000-0000-4000-8000-000000000100',
  '92000000-0000-4000-8000-000000000001',
  'Join and chat contract game',
  'Temporary transaction fixture',
  'Group',
  now() + interval '2 days',
  'Intermediate',
  true,
  2,
  1,
  'Cedarvale Park'
);

insert into public.game_players (game_id, user_id, role)
values (
  '92000000-0000-4000-8000-000000000100',
  '92000000-0000-4000-8000-000000000001',
  'host'
);

select pg_temp.assert_count(
  'select * from public.chat where game_id = ''92000000-0000-4000-8000-000000000100''',
  1,
  'host membership creates exactly one game chat'
);

select pg_temp.assert_count(
  'select * from public.conversation_members where game_id = ''92000000-0000-4000-8000-000000000100'' and id = ''92000000-0000-4000-8000-000000000001''',
  1,
  'host is added to game chat'
);

select pg_temp.set_test_claims('92000000-0000-4000-8000-000000000002');

select pg_temp.assert_eq(
  public.join_public_game('92000000-0000-4000-8000-000000000100'),
  'joined',
  'eligible player joins public game'
);

select pg_temp.assert_count(
  'select * from public.game_players where game_id = ''92000000-0000-4000-8000-000000000100'' and user_id = ''92000000-0000-4000-8000-000000000002''',
  1,
  'join inserts player membership'
);

select pg_temp.assert_count(
  'select * from public.conversation_members where game_id = ''92000000-0000-4000-8000-000000000100'' and id = ''92000000-0000-4000-8000-000000000002''',
  1,
  'join inserts chat membership'
);

insert into public.messages (chat_id, sender_id, message)
select c.id, '92000000-0000-4000-8000-000000000002', 'Joined player can message'
from public.chat c
where c.game_id = '92000000-0000-4000-8000-000000000100';

select pg_temp.assert_count(
  'select m.* from public.messages m join public.chat c on c.id = m.chat_id where c.game_id = ''92000000-0000-4000-8000-000000000100'' and m.sender_id = ''92000000-0000-4000-8000-000000000002''',
  1,
  'joined player can insert a message'
);

select pg_temp.assert_eq(
  public.join_public_game('92000000-0000-4000-8000-000000000100'),
  'already_member',
  'repeated join is idempotent'
);

select pg_temp.set_test_claims('92000000-0000-4000-8000-000000000003');

select pg_temp.assert_eq(
  public.join_public_game('92000000-0000-4000-8000-000000000100'),
  'full',
  'capacity is enforced under the game row lock'
);

select pg_temp.assert_throws(
  'select public.ensure_game_chat_membership_v1(''92000000-0000-4000-8000-000000000100'')',
  'non-members cannot join a game chat directly'
);

select pg_temp.set_test_claims('92000000-0000-4000-8000-000000000002');

select pg_temp.assert_eq(
  public.leave_game_v1('92000000-0000-4000-8000-000000000100'),
  'left',
  'player can leave atomically'
);

select pg_temp.assert_count(
  'select * from public.conversation_members where game_id = ''92000000-0000-4000-8000-000000000100'' and id = ''92000000-0000-4000-8000-000000000002''',
  0,
  'leaving removes chat membership'
);

select pg_temp.set_test_claims('92000000-0000-4000-8000-000000000001');

select pg_temp.assert_eq(
  public.delete_hosted_game_v1('92000000-0000-4000-8000-000000000100'),
  'deleted',
  'host can delete the game graph atomically'
);

reset role;

select pg_temp.assert_count(
  'select * from public.games where id = ''92000000-0000-4000-8000-000000000100''',
  0,
  'deleted game is gone'
);

select pg_temp.assert_count(
  'select * from public.chat where game_id = ''92000000-0000-4000-8000-000000000100''',
  0,
  'deleted game chat is gone'
);

rollback;
