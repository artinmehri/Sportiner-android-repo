create or replace function private.enforce_ugc_text()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  candidate text;
  candidates text[] := array[]::text[];
  normalized text;
  compact text;
begin
  if tg_table_name = 'users' then
    if tg_op = 'INSERT' then
      candidates := array[new.name, new.age_group, new.level, new.city, new.favorite_park];
    else
      if new.name is distinct from old.name then
        candidates := array_append(candidates, new.name);
      end if;
      if new.age_group is distinct from old.age_group then
        candidates := array_append(candidates, new.age_group);
      end if;
      if new.level is distinct from old.level then
        candidates := array_append(candidates, new.level);
      end if;
      if new.city is distinct from old.city then
        candidates := array_append(candidates, new.city);
      end if;
      if new.favorite_park is distinct from old.favorite_park then
        candidates := array_append(candidates, new.favorite_park);
      end if;
    end if;
  elsif tg_table_name = 'games' then
    if tg_op = 'INSERT' then
      candidates := array[
        new.title,
        new.description,
        new.type,
        new.level,
        new.location_name,
        new.court_type
      ];
    else
      if new.title is distinct from old.title then
        candidates := array_append(candidates, new.title);
      end if;
      if new.description is distinct from old.description then
        candidates := array_append(candidates, new.description);
      end if;
      if new.type is distinct from old.type then
        candidates := array_append(candidates, new.type);
      end if;
      if new.level is distinct from old.level then
        candidates := array_append(candidates, new.level);
      end if;
      if new.location_name is distinct from old.location_name then
        candidates := array_append(candidates, new.location_name);
      end if;
      if new.court_type is distinct from old.court_type then
        candidates := array_append(candidates, new.court_type);
      end if;
    end if;
  elsif tg_table_name = 'messages' then
    if tg_op = 'INSERT' then
      candidates := array[new.message];
    elsif new.message is distinct from old.message then
      candidates := array_append(candidates, new.message);
    end if;
  elsif tg_table_name = 'chat' then
    if tg_op = 'INSERT' then
      candidates := array[new.name, new.last_message];
    else
      if new.name is distinct from old.name then
        candidates := array_append(candidates, new.name);
      end if;
      if new.last_message is distinct from old.last_message then
        candidates := array_append(candidates, new.last_message);
      end if;
    end if;
  end if;

  foreach candidate in array candidates loop
    if candidate is null or btrim(candidate) = '' then
      continue;
    end if;

    normalized := ' ' || btrim(
      pg_catalog.regexp_replace(
        pg_catalog.translate(
          pg_catalog.lower(candidate),
          '013457@$!|',
          'oieastasii'
        ),
        '[^a-z0-9]+',
        ' ',
        'g'
      )
    ) || ' ';
    compact := pg_catalog.regexp_replace(normalized, '[^a-z0-9]+', '', 'g');
    compact := pg_catalog.regexp_replace(compact, '(.)\1{2,}', '\1\1', 'g');

    if compact ~ '(killyourself|gokillyourself|godie|iwillkillyou|imgoingtokillyou|iwanttokillyou|iwillshootyou|imgoingtoshootyou|iwillstabyou|imgoingtostabyou|iwillbeatyouup|iwillrapeyou|imgoingtorapeyou|rapeyou|sendnudes|sendnakedpics|childporn|childpornography|fuckyou|youareworthless|youareanidiot|youreanidiot|stupidbitch)'
      or normalized ~ ' (kys|n+i+g+g+(e+r+|a+)|f+a+g+(g+o+t+)?|r+e+t+a+r+d+e+d+)s? '
    then
      raise exception using
        errcode = 'P0001',
        message = 'ugc_text_rejected';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function private.enforce_ugc_text() from public, anon, authenticated;

drop trigger if exists enforce_ugc_text_before_write on public.users;
create trigger enforce_ugc_text_before_write
before insert or update on public.users
for each row execute function private.enforce_ugc_text();

drop trigger if exists enforce_ugc_text_before_write on public.games;
create trigger enforce_ugc_text_before_write
before insert or update on public.games
for each row execute function private.enforce_ugc_text();

drop trigger if exists enforce_ugc_text_before_write on public.messages;
create trigger enforce_ugc_text_before_write
before insert or update on public.messages
for each row execute function private.enforce_ugc_text();

drop trigger if exists enforce_ugc_text_before_write on public.chat;
create trigger enforce_ugc_text_before_write
before insert or update on public.chat
for each row execute function private.enforce_ugc_text();

comment on function private.enforce_ugc_text() is
  'Rejects high-confidence objectionable text before protected UGC rows are written.';
