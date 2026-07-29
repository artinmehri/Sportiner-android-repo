-- SPO-243 adds durable public game identity and lifecycle state.
-- The current release keeps every game public and immediate-join.


set local search_path = public, auth, extensions, pg_catalog;

create or replace function public.generate_game_public_id()
returns text
language sql
volatile
set search_path = public, extensions, pg_temp
as $$
  select encode(extensions.gen_random_bytes(16), 'hex');
$$;

alter table public.games
  add column if not exists public_id text,
  add column if not exists status text not null default 'scheduled',
  add column if not exists cancelled_at timestamp with time zone,
  add column if not exists cancelled_by uuid,
  add column if not exists completed_at timestamp with time zone,
  add column if not exists share_enabled boolean not null default true,
  add column if not exists is_test boolean not null default false;

alter table public.games
  alter column public_id set default public.generate_game_public_id(),
  alter column status set default 'scheduled',
  alter column share_enabled set default true,
  alter column is_test set default false,
  alter column is_public set default true;

update public.games
set is_public = true
where is_public is distinct from true;

update public.games
set
  status = coalesce(status, 'scheduled'),
  share_enabled = coalesce(share_enabled, true),
  is_test = coalesce(is_test, false),
  game_capacity = greatest(coalesce(game_capacity, 2), 2),
  players_enrolled = least(
    greatest(coalesce(players_enrolled, 1), 1),
    greatest(coalesce(game_capacity, 2), 2)
  );

do $$
declare
  rows_changed integer := 1;
begin
  while rows_changed > 0 loop
    with needs_public_id as (
      select id
      from public.games
      where public_id is null
         or public_id !~ '^[0-9a-f]{32}$'
      limit 500
    )
    update public.games g
    set public_id = public.generate_game_public_id()
    from needs_public_id n
    where g.id = n.id;

    get diagnostics rows_changed = row_count;
  end loop;
end $$;

do $$
declare
  duplicate_count integer;
begin
  select count(*)::integer
  into duplicate_count
  from (
    select public_id
    from public.games
    group by public_id
    having count(*) > 1
  ) duplicates;

  if duplicate_count > 0 then
    raise exception 'games.public_id backfill produced duplicate values';
  end if;
end $$;

alter table public.games
  alter column public_id set not null,
  alter column is_public set not null,
  alter column status set not null,
  alter column share_enabled set not null,
  alter column is_test set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'games_cancelled_by_fkey'
      and conrelid = 'public.games'::regclass
  ) then
    alter table public.games
      add constraint games_cancelled_by_fkey
      foreign key (cancelled_by) references auth.users(id) on delete set null;
  end if;
end $$;

create unique index if not exists games_public_id_key
  on public.games using btree (public_id);
create index if not exists games_status_time_idx
  on public.games using btree (status, "time");
create index if not exists games_public_status_time_idx
  on public.games using btree (is_public, status, "time" desc);
create index if not exists games_is_test_idx
  on public.games using btree (is_test)
  where is_test is true;

alter table public.games
  drop constraint if exists games_public_id_format_check,
  drop constraint if exists games_status_check,
  drop constraint if exists games_current_release_public_check,
  drop constraint if exists games_capacity_check,
  drop constraint if exists games_player_count_check,
  drop constraint if exists games_lifecycle_timestamp_check;

alter table public.games
  add constraint games_public_id_format_check
    check (public_id ~ '^[0-9a-f]{32}$'),
  add constraint games_status_check
    check (status in ('scheduled', 'cancelled', 'completed')),
  add constraint games_current_release_public_check
    check (is_public is true),
  add constraint games_capacity_check
    check (game_capacity is not null and game_capacity between 2 and 64),
  add constraint games_player_count_check
    check (players_enrolled is not null and players_enrolled between 1 and game_capacity),
  add constraint games_lifecycle_timestamp_check
    check (
      (status = 'scheduled' and cancelled_at is null and cancelled_by is null and completed_at is null)
      or (status = 'cancelled' and cancelled_at is not null and completed_at is null)
      or (
        status = 'completed'
        and completed_at is not null
        and cancelled_at is null
        and cancelled_by is null
        and ("time" is null or completed_at >= "time")
      )
    );

create or replace function public.enforce_game_lifecycle()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if new.public_id is distinct from old.public_id then
      raise exception 'games.public_id is immutable';
    end if;

    if new.is_public is distinct from true then
      raise exception 'games.is_public must remain true in the current release';
    end if;

    if old.status <> new.status then
      if old.status <> 'scheduled' then
        raise exception 'cannot transition game from % to %', old.status, new.status;
      end if;

      if new.status not in ('cancelled', 'completed') then
        raise exception 'invalid game status transition from % to %', old.status, new.status;
      end if;
    end if;
  end if;

  if new.status = 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
    new.completed_at := null;
  elsif new.status = 'completed' then
    new.completed_at := coalesce(new.completed_at, now());
    new.cancelled_at := null;
    new.cancelled_by := null;
  else
    new.cancelled_at := null;
    new.cancelled_by := null;
    new.completed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_game_lifecycle_before_write on public.games;
create trigger enforce_game_lifecycle_before_write
  before insert or update on public.games
  for each row
  execute function public.enforce_game_lifecycle();

create or replace function public.is_public_game_visible(
  p_game_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.games g
    where g.id = p_game_id
      and g.is_public is true
      and g.status = 'scheduled'
      and g.share_enabled is true
      and g.is_test is false
      and (
        p_user_id is null
        or g.host_id is null
        or not public.has_blocked_relationship(g.host_id, p_user_id)
      )
  );
$$;

drop function if exists public.get_public_games();

create function public.get_public_games()
returns table (
  public_id text,
  title text,
  description text,
  type text,
  approximate_location_name text,
  game_time timestamp with time zone,
  level text,
  game_capacity smallint,
  is_booked boolean,
  payment_amount integer,
  image text,
  court_type text,
  is_paid boolean,
  players_enrolled integer,
  host_id uuid,
  host_name text,
  host_profile_picture text,
  status text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    g.public_id,
    g.title,
    g.description,
    g.type,
    g.location_name as approximate_location_name,
    g."time" as game_time,
    g.level,
    g.game_capacity,
    g.is_booked,
    g.payment_amount,
    g.image,
    g.court_type,
    g.is_paid,
    g.players_enrolled,
    g.host_id,
    u.name as host_name,
    u.profile_picture as host_profile_picture,
    g.status
  from public.games g
  left join public.users u on u.id = g.host_id
  where g.is_public is true
    and g.status = 'scheduled'
    and g.share_enabled is true
    and g.is_test is false
    and (
      auth.uid() is null
      or g.host_id is null
      or not public.has_blocked_relationship(g.host_id, auth.uid())
    )
  order by g."time" nulls last, g.created_at desc;
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

  update public.games
  set players_enrolled = least(v_game.game_capacity, v_player_count + 1)
  where id = p_game_id;

  return 'joined';
end;
$$;

create or replace function public.transition_game_status(
  p_game_id uuid,
  p_next_status text,
  p_reason text default 'unspecified'
)
returns public.games
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_before public.games%rowtype;
  v_after public.games%rowtype;
  v_reason text := left(coalesce(nullif(trim(p_reason), ''), 'unspecified'), 64);
begin
  if p_next_status not in ('cancelled', 'completed') then
    raise exception 'unsupported game lifecycle target: %', p_next_status;
  end if;

  select *
  into v_before
  from public.games
  where id = p_game_id
  for update;

  if not found then
    raise exception 'game not found';
  end if;

  if v_role <> 'service_role' and (v_user_id is null or v_before.host_id <> v_user_id) then
    raise exception 'not authorized to change game lifecycle';
  end if;

  update public.games
  set
    status = p_next_status,
    cancelled_at = case when p_next_status = 'cancelled' then now() else null end,
    cancelled_by = case when p_next_status = 'cancelled' then v_user_id else null end,
    completed_at = case when p_next_status = 'completed' then now() else null end,
    share_enabled = case when p_next_status = 'cancelled' then false else share_enabled end
  where id = p_game_id
  returning *
  into v_after;

  insert into public.product_events (
    event_name,
    game_id,
    user_id,
    metadata,
    created_at
  )
  values (
    'game_status_changed',
    p_game_id::text,
    v_user_id,
    jsonb_build_object(
      'version', 1,
      'previous_status', v_before.status,
      'next_status', v_after.status,
      'reason', v_reason,
      'public_id', v_after.public_id
    ),
    now()
  );

  return v_after;
end;
$$;

revoke all on function public.generate_game_public_id() from public;
revoke all on function public.enforce_game_lifecycle() from public;
revoke all on function public.join_public_game(uuid) from public;
revoke all on function public.transition_game_status(uuid, text, text) from public;
grant execute on function public.join_public_game(uuid) to authenticated, service_role;
grant execute on function public.transition_game_status(uuid, text, text) to authenticated, service_role;

drop policy if exists "games_select_authenticated_public_or_involved" on public.games;
create policy "games_select_authenticated_public_or_involved"
  on public.games
  for select
  to authenticated
  using (
    host_id = auth.uid()
    or public.is_confirmed_participant(id, auth.uid())
    or public.is_public_game_visible(id, auth.uid())
  );

drop policy if exists "games_insert_public_host" on public.games;
create policy "games_insert_public_host"
  on public.games
  for insert
  to authenticated
  with check (
    host_id = auth.uid()
    and is_public is true
    and status = 'scheduled'
  );

drop policy if exists "games_update_host" on public.games;
create policy "games_update_host"
  on public.games
  for update
  to authenticated
  using (host_id = auth.uid())
  with check (
    host_id = auth.uid()
    and is_public is true
  );

drop policy if exists "game_players_insert_self_public_game" on public.game_players;
create policy "game_players_insert_self_public_game"
  on public.game_players
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_public_game_visible(game_id, auth.uid())
  );

