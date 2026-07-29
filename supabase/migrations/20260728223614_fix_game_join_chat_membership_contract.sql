-- Keep game participation, cached player counts, and game chat membership in sync.
-- Client applications call the public RPCs below. Internal helpers remain private.

create or replace function public.ensure_game_chat_membership_v1(p_game_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_game public.games%rowtype;
  v_chat_id uuid;
  v_user_level text;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select *
  into v_game
  from public.games
  where id = p_game_id
  for update;

  if not found then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;

  if v_game.host_id is distinct from v_user_id
     and not exists (
       select 1
       from public.game_players gp
       where gp.game_id = v_game.id
         and gp.user_id = v_user_id
     ) then
    raise exception 'not_a_game_member' using errcode = '42501';
  end if;

  select u.level
  into v_user_level
  from public.users u
  where u.id = v_user_id;

  v_chat_id := public.ensure_game_chat(
    v_game,
    coalesce(v_user_level, v_game.level)
  );

  insert into public.conversation_members (
    id,
    chat_id,
    joined_at,
    level,
    game_id,
    color
  )
  values (
    v_user_id,
    v_chat_id,
    now(),
    coalesce(v_user_level, v_game.level),
    v_game.id,
    case when v_game.host_id = v_user_id then '#4ECDC4' else '#45B7D1' end
  )
  on conflict (id, chat_id) do update
  set game_id = excluded.game_id,
      level = coalesce(conversation_members.level, excluded.level);

  return v_chat_id;
end;
$$;

create or replace function public.join_public_game(p_game_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_game public.games%rowtype;
  v_player_count integer;
begin
  if v_user_id is null then
    return 'not_authenticated';
  end if;

  select *
  into v_game
  from public.games
  where id = p_game_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_game.host_id = v_user_id
     or exists (
       select 1
       from public.game_players gp
       where gp.game_id = p_game_id
         and gp.user_id = v_user_id
     ) then
    perform public.ensure_game_chat_membership_v1(p_game_id);
    perform public.sync_players_enrolled(p_game_id);
    return 'already_member';
  end if;

  if v_game.status <> 'scheduled'
     or v_game.is_public is not true
     or v_game.share_enabled is not true
     or v_game.is_test is true then
    return 'not_found';
  end if;

  if v_game.host_id is not null
     and public.has_blocked_relationship(v_game.host_id, v_user_id) then
    return 'not_found';
  end if;

  select count(*)::integer
  into v_player_count
  from public.game_players gp
  where gp.game_id = p_game_id;

  if v_player_count >= v_game.game_capacity then
    return 'full';
  end if;

  insert into public.game_players (game_id, user_id, role, joined_at)
  values (p_game_id, v_user_id, 'member', now())
  on conflict (game_id, user_id) do nothing;

  perform public.sync_players_enrolled(p_game_id);
  perform public.ensure_game_chat_membership_v1(p_game_id);

  return 'joined';
end;
$$;

create or replace function public.leave_game_v1(p_game_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_game public.games%rowtype;
  v_deleted_count integer;
begin
  if v_user_id is null then
    return 'not_authenticated';
  end if;

  select *
  into v_game
  from public.games
  where id = p_game_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_game.host_id = v_user_id then
    return 'host_must_delete';
  end if;

  delete from public.game_players
  where game_id = p_game_id
    and user_id = v_user_id;

  get diagnostics v_deleted_count = row_count;

  delete from public.conversation_members
  where game_id = p_game_id
    and id = v_user_id;

  delete from public.game_requests
  where game_id = p_game_id
    and user_id = v_user_id;

  perform public.sync_players_enrolled(p_game_id);

  return case when v_deleted_count > 0 then 'left' else 'not_member' end;
end;
$$;

create or replace function public.delete_hosted_game_v1(p_game_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_game public.games%rowtype;
  v_chat_ids uuid[];
begin
  if v_user_id is null then
    return 'not_authenticated';
  end if;

  select *
  into v_game
  from public.games
  where id = p_game_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_game.host_id is distinct from v_user_id then
    return 'forbidden';
  end if;

  select coalesce(array_agg(c.id), array[]::uuid[])
  into v_chat_ids
  from public.chat c
  where c.game_id = p_game_id
     or c.id = v_game.chat_id;

  delete from public.game_requests where game_id = p_game_id;
  delete from public.conversation_members where game_id = p_game_id;

  update public.games
  set chat_id = null
  where id = p_game_id;

  if cardinality(v_chat_ids) > 0 then
    delete from public.chat where id = any(v_chat_ids);
  end if;

  delete from public.game_players where game_id = p_game_id;
  delete from public.games where id = p_game_id;

  return 'deleted';
end;
$$;

create or replace function public.reconcile_game_chat_after_player_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_game public.games%rowtype;
  v_chat_id uuid;
  v_user_level text;
begin
  select *
  into v_game
  from public.games
  where id = new.game_id
  for update;

  if not found then
    return new;
  end if;

  select u.level
  into v_user_level
  from public.users u
  where u.id = new.user_id;

  v_chat_id := public.ensure_game_chat(
    v_game,
    coalesce(v_user_level, v_game.level)
  );

  insert into public.conversation_members (
    id,
    chat_id,
    joined_at,
    level,
    game_id,
    color
  )
  values (
    new.user_id,
    v_chat_id,
    coalesce(new.joined_at, now()),
    coalesce(v_user_level, v_game.level),
    new.game_id,
    case when new.role = 'host' then '#4ECDC4' else '#45B7D1' end
  )
  on conflict (id, chat_id) do update
  set game_id = excluded.game_id,
      level = coalesce(conversation_members.level, excluded.level);

  perform public.sync_players_enrolled(new.game_id);
  return new;
end;
$$;

drop trigger if exists reconcile_game_chat_after_player_insert
  on public.game_players;

create trigger reconcile_game_chat_after_player_insert
after insert on public.game_players
for each row
execute function public.reconcile_game_chat_after_player_insert();

-- Repair historical games and participants that were created before the invariant.
do $$
declare
  v_game public.games%rowtype;
  v_chat_id uuid;
begin
  for v_game in select * from public.games loop
    v_chat_id := public.ensure_game_chat(v_game, v_game.level);

    insert into public.conversation_members (
      id,
      chat_id,
      joined_at,
      level,
      game_id,
      color
    )
    select
      gp.user_id,
      v_chat_id,
      gp.joined_at,
      coalesce(u.level, v_game.level),
      gp.game_id,
      case when gp.role = 'host' then '#4ECDC4' else '#45B7D1' end
    from public.game_players gp
    left join public.users u on u.id = gp.user_id
    where gp.game_id = v_game.id
    on conflict (id, chat_id) do update
    set game_id = excluded.game_id,
        level = coalesce(conversation_members.level, excluded.level);

    perform public.sync_players_enrolled(v_game.id);
  end loop;
end;
$$;

-- A public game being visible is not sufficient permission to join its chat.
drop policy if exists "conversation_members_insert_self_for_public_game"
  on public.conversation_members;

create policy "conversation_members_insert_self_for_joined_game"
  on public.conversation_members
  for insert
  to authenticated
  with check (
    id = (select auth.uid())
    and (
      public.is_game_host(game_id, (select auth.uid()))
      or public.is_confirmed_participant(game_id, (select auth.uid()))
    )
  );

-- Only the stable, authorization-checking entry points are client callable.
revoke all on function public.ensure_game_chat(public.games, text)
  from public, anon, authenticated;
revoke all on function public.sync_players_enrolled(uuid)
  from public, anon, authenticated;
revoke all on function public.reconcile_game_chat_after_player_insert()
  from public, anon, authenticated;
revoke all on function public.ensure_game_chat_membership_v1(uuid)
  from public, anon;
revoke all on function public.join_public_game(uuid)
  from public, anon;
revoke all on function public.leave_game_v1(uuid)
  from public, anon;
revoke all on function public.delete_hosted_game_v1(uuid)
  from public, anon;

grant execute on function public.ensure_game_chat_membership_v1(uuid)
  to authenticated, service_role;
grant execute on function public.join_public_game(uuid)
  to authenticated, service_role;
grant execute on function public.leave_game_v1(uuid)
  to authenticated, service_role;
grant execute on function public.delete_hosted_game_v1(uuid)
  to authenticated, service_role;
grant execute on function public.ensure_game_chat(public.games, text)
  to service_role;
grant execute on function public.sync_players_enrolled(uuid)
  to service_role;

comment on function public.ensure_game_chat_membership_v1(uuid) is
  'Returns the game chat and repairs membership for the authenticated host or confirmed participant.';
comment on function public.join_public_game(uuid) is
  'Atomically joins an eligible authenticated user to a public game and its chat.';
comment on function public.leave_game_v1(uuid) is
  'Atomically removes the authenticated non-host player from a game and its chat.';
comment on function public.delete_hosted_game_v1(uuid) is
  'Atomically deletes a game and its chat graph after verifying the authenticated host.';
