\echo 'Server-side UGC text moderation tests'

begin;

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

create function pg_temp.assert_rejected(query text, label text)
returns void
language plpgsql
as $$
begin
  begin
    execute query;
  exception
    when sqlstate 'P0001' then
      if sqlerrm = 'ugc_text_rejected' then
        return;
      end if;
      raise exception 'Unexpected rejection for %: %', label, sqlerrm;
  end;

  raise exception 'Expected UGC rejection: %', label;
end;
$$;

select pg_temp.assert_true(
  (
    select count(*) = 4
    from pg_catalog.pg_trigger
    where tgname = 'enforce_ugc_text_before_write'
      and tgrelid in (
        'public.users'::regclass,
        'public.games'::regclass,
        'public.messages'::regclass,
        'public.chat'::regclass
      )
      and not tgisinternal
  ),
  'all protected UGC tables have the moderation trigger'
);

select pg_temp.assert_true(
  not has_function_privilege(
    'authenticated',
    'private.enforce_ugc_text()',
    'execute'
  ),
  'authenticated clients cannot invoke the trigger function directly'
);

create temporary table users (
  name text,
  age_group text,
  level text,
  city text,
  favorite_park text
);
create trigger enforce_ugc_text_before_write
before insert or update on pg_temp.users
for each row execute function private.enforce_ugc_text();

create temporary table games (
  title text,
  description text,
  type text,
  level text,
  location_name text,
  court_type text
);
create trigger enforce_ugc_text_before_write
before insert or update on pg_temp.games
for each row execute function private.enforce_ugc_text();

create temporary table messages (message text);
create trigger enforce_ugc_text_before_write
before insert or update on pg_temp.messages
for each row execute function private.enforce_ugc_text();

create temporary table chat (name text, last_message text);
create trigger enforce_ugc_text_before_write
before insert or update on pg_temp.chat
for each row execute function private.enforce_ugc_text();

insert into pg_temp.messages (message)
values
  ('Great rally. Want to play doubles Saturday?'),
  ('Let''s kill it on the court today.'),
  ('Photo');

insert into pg_temp.users (name, age_group, level, city, favorite_park)
values ('Alex Martin', '18-25', 'Intermediate', 'Toronto', 'Cedarvale Park');

insert into pg_temp.games (title, description, type, level, location_name, court_type)
values (
  'Saturday doubles',
  'Looking for intermediate doubles at Cedarvale.',
  'Group',
  'Intermediate',
  'Cedarvale Park',
  'Public'
);

select pg_temp.assert_rejected(
  $$insert into pg_temp.messages (message) values ('Go kill yourself')$$,
  'clearly objectionable message'
);

select pg_temp.assert_rejected(
  $$insert into pg_temp.messages (message) values ('k1ll.y0ur$elf')$$,
  'obfuscated prohibited phrase'
);

select pg_temp.assert_rejected(
  $$insert into pg_temp.messages (message) values ('go die go die go die')$$,
  'repeated abusive text'
);

select pg_temp.assert_rejected(
  $$insert into pg_temp.users (name) values ('k1ll y0urself')$$,
  'objectionable profile name'
);

select pg_temp.assert_rejected(
  $$insert into pg_temp.games (title, description) values ('Saturday tennis', 'I will kill you')$$,
  'objectionable game description'
);

insert into pg_temp.chat (name, last_message)
values ('Saturday doubles', 'See you at the court');

select pg_temp.assert_rejected(
  $$update pg_temp.chat set last_message = 'I will stab you'$$,
  'direct chat preview bypass'
);

select pg_temp.assert_true(
  (select count(*) = 3 from pg_temp.messages),
  'rejected messages were not inserted'
);

rollback;
