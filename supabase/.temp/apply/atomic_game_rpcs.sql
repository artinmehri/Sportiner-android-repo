-- Atomic, idempotent create / join / cancel / leave RPCs for public games.
-- Capacity truth is confirmed game_players rows; players_enrolled is a transactional cache.
-- games.is_public remains required true; no request/approval RPCs in this release.


set local search_path = public, auth, extensions, pg_catalog;

-- ---------------------------------------------------------------------------
-- Idempotency ledger
-- ---------------------------------------------------------------------------

create table if not exists public.mutation_idempotency (
  actor_id uuid not null references auth.users (id) on delete cascade,
  operation text not null,
  key uuid not null,
  resource_id uuid null,
  result_code text not null,
  result_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint mutation_idempotency_pkey primary key (actor_id, operation, key),
  constraint mutation_idempotency_operation_check check (
    operation in ('create_game_v1', 'join_game_v1', 'cancel_game_v1', 'leave_game_v1')
  )
);

create index if not exists mutation_idempotency_created_at_idx
  on public.mutation_idempotency using btree (created_at);

alter table public.mutation_idempotency enable row level security;
alter table public.mutation_idempotency force row level security;

drop policy if exists "service_role_full_access_mutation_idempotency" on public.mutation_idempotency;
create policy "service_role_full_access_mutation_idempotency"
  on public.mutation_idempotency
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.mutation_idempotency from public, anon, authenticated;
grant select, insert, update, delete on table public.mutation_idempotency to service_role;

-- ---------------------------------------------------------------------------
-- One chat per game (dedupe legacy duplicates, then unique)
-- ---------------------------------------------------------------------------

do $$
declare
  duplicate_group record;
  keep_chat_id uuid;
begin
  for duplicate_group in
    select game_id
    from public.chat
    where game_id is not null
    group by game_id
    having count(*) > 1
  loop
    select id
    into keep_chat_id
    from public.chat
    where game_id = duplicate_group.game_id
    order by created_at asc nulls last, id asc
    limit 1;

    update public.games
    set chat_id = keep_chat_id
    where id = duplicate_group.game_id
      and (chat_id is distinct from keep_chat_id);

    update public.conversation_members cm
    set chat_id = keep_chat_id
    where cm.game_id = duplicate_group.game_id
      and cm.chat_id is distinct from keep_chat_id
      and not exists (
        select 1
        from public.conversation_members existing
        where existing.id = cm.id
          and existing.chat_id = keep_chat_id
      );

    delete from public.conversation_members cm
    where cm.game_id = duplicate_group.game_id
      and cm.chat_id is distinct from keep_chat_id;

    update public.messages m
    set chat_id = keep_chat_id
    where m.chat_id in (
      select c.id
      from public.chat c
      where c.game_id = duplicate_group.game_id
        and c.id is distinct from keep_chat_id
    );

    delete from public.chat
    where game_id = duplicate_group.game_id
      and id is distinct from keep_chat_id;
  end loop;
end $$;

create unique index if not exists chat_game_id_key
  on public.chat using btree (game_id)
  where game_id is not null;

create index if not exists games_status_scheduled_time_idx
  on public.games using btree (status, "time")
  where status = 'scheduled';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.sync_players_enrolled(p_game_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_capacity integer;
  v_status text;
  v_cached integer;
begin
  select count(*)::integer
  into v_count
  from public.game_players
  where game_id = p_game_id;

  select game_capacity, status
  into v_capacity, v_status
  from public.games
  where id = p_game_id;

  v_count := greatest(coalesce(v_count, 0), 0);
  if v_capacity is not null then
    v_count := least(v_count, v_capacity);
  end if;

  -- Compatibility: games_player_count_check requires players_enrolled >= 1.
  -- Prefer real roster count; only clamp empty scheduled rosters to 1.
  v_cached := case
    when v_count = 0 and v_status = 'scheduled' then 1
    when v_count = 0 then 1
    else v_count
  end;

  update public.games
  set players_enrolled = v_cached
  where id = p_game_id;

  return v_cached;
end;
$$;

create or replace function public.ensure_game_chat(
  p_game public.games,
  p_host_level text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_chat_id uuid;
  v_chat_type text;
  v_now timestamptz := now();
begin
  if p_game.chat_id is not null then
    select id into v_chat_id from public.chat where id = p_game.chat_id;
    if v_chat_id is not null then
      return v_chat_id;
    end if;
  end if;

  select id
  into v_chat_id
  from public.chat
  where game_id = p_game.id
  order by created_at asc nulls last, id asc
  limit 1;

  if v_chat_id is null then
    v_chat_type := case when p_game.type = '1v1' then 'private' else 'group' end;

    insert into public.chat (
      type,
      name,
      photo,
      game_id,
      created_at,
      updated_at
    )
    values (
      v_chat_type,
      p_game.title,
      p_game.image,
      p_game.id,
      v_now,
      v_now
    )
    returning id into v_chat_id;
  end if;

  update public.games
  set chat_id = v_chat_id
  where id = p_game.id
    and chat_id is distinct from v_chat_id;

  if p_game.host_id is not null then
    insert into public.conversation_members (
      id,
      chat_id,
      joined_at,
      level,
      game_id,
      color
    )
    values (
      p_game.host_id,
      v_chat_id,
      v_now,
      p_host_level,
      p_game.id,
      '#4ECDC4'
    )
    on conflict (id, chat_id) do update
    set game_id = excluded.game_id;
  end if;

  return v_chat_id;
end;
$$;

create or replace function public.resolve_game_for_mutation(p_game_ref text)
returns public.games
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_game public.games%rowtype;
  v_ref text := nullif(trim(coalesce(p_game_ref, '')), '');
begin
  if v_ref is null then
    return null;
  end if;

  if v_ref ~ '^[0-9a-f]{32}$' then
    select * into v_game from public.games where public_id = v_ref;
    return v_game;
  end if;

  if v_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select * into v_game from public.games where id = v_ref::uuid;
    return v_game;
  end if;

  return null;
end;
$$;

create or replace function public.mutation_result(
  p_code text,
  p_resource_id uuid default null,
  p_public_id text default null,
  p_chat_id uuid default null,
  p_players_enrolled integer default null,
  p_reason text default null
)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_strip_nulls(
    jsonb_build_object(
      'code', p_code,
      'resource_id', p_resource_id,
      'public_id', p_public_id,
      'chat_id', p_chat_id,
      'players_enrolled', p_players_enrolled,
      'reason', p_reason
    )
  );
$$;

create or replace function public.read_mutation_idempotency(
  p_actor_id uuid,
  p_operation text,
  p_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.mutation_idempotency%rowtype;
begin
  select *
  into v_row
  from public.mutation_idempotency
  where actor_id = p_actor_id
    and operation = p_operation
    and key = p_key;

  if not found then
    return null;
  end if;

  return v_row.result_payload;
end;
$$;

create or replace function public.store_mutation_idempotency(
  p_actor_id uuid,
  p_operation text,
  p_key uuid,
  p_resource_id uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.mutation_idempotency (
    actor_id,
    operation,
    key,
    resource_id,
    result_code,
    result_payload,
    created_at
  )
  values (
    p_actor_id,
    p_operation,
    p_key,
    p_resource_id,
    coalesce(p_result ->> 'code', 'unknown'),
    p_result,
    now()
  )
  on conflict (actor_id, operation, key) do nothing;

  return coalesce(
    public.read_mutation_idempotency(p_actor_id, p_operation, p_key),
    p_result
  );
end;
$$;

create or replace function public.emit_game_mutation_event(
  p_event_name text,
  p_game_id uuid,
  p_user_id uuid,
  p_public_id text,
  p_result_code text,
  p_extra jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.product_events (
    event_name,
    game_id,
    user_id,
    metadata,
    created_at
  )
  values (
    p_event_name,
    p_game_id::text,
    p_user_id,
    jsonb_strip_nulls(
      jsonb_build_object(
        'version', 1,
        'result', p_result_code,
        'public_id', p_public_id
      ) || coalesce(p_extra, '{}'::jsonb)
    ),
    now()
  );
end;
$$;

create or replace function public.validate_join_eligibility(
  p_user_id uuid,
  p_game public.games
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_age_group text;
  v_user_level text;
begin
  if p_user_id is null then
    return 'not_authenticated';
  end if;

  if p_game.id is null then
    return 'not_found';
  end if;

  if p_game.status = 'cancelled' then
    return 'cancelled';
  end if;

  if p_game.status <> 'scheduled'
     or p_game.is_public is not true
     or p_game.share_enabled is not true
     or p_game.is_test is true then
    return 'not_found';
  end if;

  if p_game.host_id is not null
     and public.has_blocked_relationship(p_game.host_id, p_user_id) then
    return 'not_found';
  end if;

  if p_game."time" is not null and now() > p_game."time" then
    return 'ineligible:started';
  end if;

  select u.age_group, u.level
  into v_age_group, v_user_level
  from public.users u
  where u.id = p_user_id;

  if v_age_group is null or btrim(v_age_group) = '' then
    return 'ineligible:age';
  end if;

  if p_game.level in ('Beginner', 'Intermediate', 'Advanced')
     and v_user_level is not null
     and btrim(v_user_level) <> ''
     and v_user_level is distinct from p_game.level then
    return 'ineligible:skill';
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_game_v1
-- ---------------------------------------------------------------------------

create or replace function public.create_game_v1(
  payload jsonb,
  idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing jsonb;
  v_title text;
  v_description text;
  v_type text;
  v_level text;
  v_location_name text;
  v_location_cords text;
  v_time timestamptz;
  v_capacity integer;
  v_is_booked boolean;
  v_is_paid boolean;
  v_payment_amount integer;
  v_image text;
  v_court_type text;
  v_game public.games%rowtype;
  v_chat_id uuid;
  v_result jsonb;
begin
  if v_user_id is null then
    return public.mutation_result('not_authenticated');
  end if;

  if idempotency_key is null then
    return public.mutation_result('ineligible', null, null, null, null, 'idempotency_key');
  end if;

  v_existing := public.read_mutation_idempotency(v_user_id, 'create_game_v1', idempotency_key);
  if v_existing is not null then
    return v_existing;
  end if;

  v_title := nullif(trim(coalesce(payload ->> 'title', '')), '');
  v_description := coalesce(payload ->> 'description', '');
  v_type := coalesce(nullif(trim(coalesce(payload ->> 'type', '')), ''), 'Group');
  v_level := nullif(trim(coalesce(payload ->> 'level', '')), '');
  v_location_name := nullif(trim(coalesce(payload ->> 'location_name', '')), '');
  v_location_cords := nullif(trim(coalesce(payload ->> 'location_cords', '')), '');
  v_image := nullif(trim(coalesce(payload ->> 'image', '')), '');
  v_court_type := coalesce(nullif(trim(coalesce(payload ->> 'court_type', '')), ''), 'Public');
  v_is_booked := coalesce((payload ->> 'is_booked')::boolean, false);
  v_is_paid := coalesce((payload ->> 'is_paid')::boolean, false);

  begin
    v_time := (payload ->> 'time')::timestamptz;
  exception when others then
    v_time := null;
  end;

  begin
    v_capacity := (payload ->> 'game_capacity')::integer;
  exception when others then
    v_capacity := null;
  end;

  begin
    v_payment_amount := (payload ->> 'payment_amount')::integer;
  exception when others then
    v_payment_amount := null;
  end;

  if v_title is null or v_level is null or v_time is null then
    return public.mutation_result('ineligible', null, null, null, null, 'payload');
  end if;

  if v_type = '1v1' then
    v_capacity := 2;
  else
    v_capacity := greatest(2, least(coalesce(v_capacity, 2), 64));
  end if;

  if not v_is_paid then
    v_payment_amount := null;
  elsif v_payment_amount is null or v_payment_amount <= 0 then
    v_payment_amount := null;
    v_is_paid := false;
  end if;

  insert into public.games (
    host_id,
    title,
    description,
    type,
    location_cords,
    time,
    location_name,
    level,
    is_public,
    game_capacity,
    is_booked,
    payment_amount,
    image,
    court_type,
    is_paid,
    players_enrolled,
    status,
    share_enabled,
    is_test
  )
  values (
    v_user_id,
    v_title,
    v_description,
    v_type,
    case
      when v_location_cords is null then null
      else public.ST_GeogFromText('SRID=4326;' || v_location_cords)
    end,
    v_time,
    v_location_name,
    v_level,
    true,
    v_capacity,
    v_is_booked,
    v_payment_amount,
    v_image,
    v_court_type,
    v_is_paid,
    1,
    'scheduled',
    true,
    false
  )
  returning * into v_game;

  insert into public.game_players (game_id, user_id, role, joined_at)
  values (v_game.id, v_user_id, 'host', now());

  v_chat_id := public.ensure_game_chat(v_game, v_level);

  select * into v_game from public.games where id = v_game.id;

  v_result := public.mutation_result(
    'created',
    v_game.id,
    v_game.public_id,
    v_chat_id,
    1,
    null
  );

  perform public.emit_game_mutation_event(
    'game_created',
    v_game.id,
    v_user_id,
    v_game.public_id,
    'created',
    jsonb_build_object('capacity', v_capacity, 'type', v_type)
  );

  return public.store_mutation_idempotency(
    v_user_id,
    'create_game_v1',
    idempotency_key,
    v_game.id,
    v_result
  );
exception
  when unique_violation then
    v_existing := public.read_mutation_idempotency(v_user_id, 'create_game_v1', idempotency_key);
    if v_existing is not null then
      return v_existing;
    end if;
    raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- join_game_v1
-- ---------------------------------------------------------------------------

create or replace function public.join_game_v1(
  public_id text,
  idempotency_key uuid,
  share_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing jsonb;
  v_game public.games%rowtype;
  v_eligibility text;
  v_player_count integer;
  v_chat_id uuid;
  v_enrolled integer;
  v_result jsonb;
  v_share text := nullif(trim(coalesce(share_code, '')), '');
  v_user_level text;
  v_inserted_id uuid;
  v_game_ref text := nullif(trim(coalesce(public_id, '')), '');
begin
  if v_user_id is null then
    return public.mutation_result('not_authenticated');
  end if;

  if idempotency_key is null then
    return public.mutation_result('ineligible', null, null, null, null, 'idempotency_key');
  end if;

  v_existing := public.read_mutation_idempotency(v_user_id, 'join_game_v1', idempotency_key);
  if v_existing is not null then
    return v_existing;
  end if;

  if v_share is not null
     and v_share is distinct from v_game_ref
     and v_share !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    -- share_code aliases public_id in this release; allow uuid refs without share_code
    if v_game_ref ~ '^[0-9a-f]{32}$' and v_share is distinct from v_game_ref then
      return public.mutation_result('not_found');
    end if;
  end if;

  select *
  into v_game
  from public.games g
  where (
    (v_game_ref ~ '^[0-9a-f]{32}$' and g.public_id = v_game_ref)
    or (
      v_game_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and g.id = v_game_ref::uuid
    )
  )
  for update;

  if not found then
    v_result := public.mutation_result('not_found');
    return public.store_mutation_idempotency(v_user_id, 'join_game_v1', idempotency_key, null, v_result);
  end if;

  if v_share is not null
     and v_share ~ '^[0-9a-f]{32}$'
     and v_share is distinct from v_game.public_id then
    v_result := public.mutation_result('not_found');
    return public.store_mutation_idempotency(v_user_id, 'join_game_v1', idempotency_key, v_game.id, v_result);
  end if;

  if v_game.host_id = v_user_id
     or exists (
       select 1
       from public.game_players gp
       where gp.game_id = v_game.id
         and gp.user_id = v_user_id
     ) then
    v_chat_id := public.ensure_game_chat(v_game, v_game.level);
    v_enrolled := public.sync_players_enrolled(v_game.id);
    v_result := public.mutation_result(
      'already_member',
      v_game.id,
      v_game.public_id,
      v_chat_id,
      v_enrolled,
      null
    );
    return public.store_mutation_idempotency(v_user_id, 'join_game_v1', idempotency_key, v_game.id, v_result);
  end if;

  v_eligibility := public.validate_join_eligibility(v_user_id, v_game);
  if v_eligibility is not null then
    if v_eligibility like 'ineligible:%' then
      v_result := public.mutation_result(
        'ineligible',
        v_game.id,
        v_game.public_id,
        null,
        v_game.players_enrolled,
        split_part(v_eligibility, ':', 2)
      );
    else
      v_result := public.mutation_result(
        v_eligibility,
        v_game.id,
        v_game.public_id,
        null,
        v_game.players_enrolled,
        null
      );
    end if;
    return public.store_mutation_idempotency(v_user_id, 'join_game_v1', idempotency_key, v_game.id, v_result);
  end if;

  select count(*)::integer
  into v_player_count
  from public.game_players
  where game_id = v_game.id;

  if v_player_count >= v_game.game_capacity then
    v_result := public.mutation_result(
      'full',
      v_game.id,
      v_game.public_id,
      null,
      v_player_count,
      null
    );
    return public.store_mutation_idempotency(v_user_id, 'join_game_v1', idempotency_key, v_game.id, v_result);
  end if;

  insert into public.game_players (game_id, user_id, role, joined_at)
  values (v_game.id, v_user_id, 'member', now())
  on conflict (game_id, user_id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    v_result := public.mutation_result(
      'already_member',
      v_game.id,
      v_game.public_id,
      public.ensure_game_chat(v_game, v_game.level),
      public.sync_players_enrolled(v_game.id),
      null
    );
    return public.store_mutation_idempotency(v_user_id, 'join_game_v1', idempotency_key, v_game.id, v_result);
  end if;

  v_enrolled := public.sync_players_enrolled(v_game.id);

  select u.level into v_user_level from public.users u where u.id = v_user_id;
  v_chat_id := public.ensure_game_chat(v_game, coalesce(v_user_level, v_game.level));

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
    v_user_level,
    v_game.id,
    '#45B7D1'
  )
  on conflict (id, chat_id) do update
  set game_id = excluded.game_id;

  v_result := public.mutation_result(
    'joined',
    v_game.id,
    v_game.public_id,
    v_chat_id,
    v_enrolled,
    null
  );

  perform public.emit_game_mutation_event(
    'game_join_completed',
    v_game.id,
    v_user_id,
    v_game.public_id,
    'joined',
    jsonb_build_object(
      'share_code_validated', v_share is not null,
      'players_enrolled', v_enrolled
    )
  );

  return public.store_mutation_idempotency(
    v_user_id,
    'join_game_v1',
    idempotency_key,
    v_game.id,
    v_result
  );
exception
  when unique_violation then
    v_existing := public.read_mutation_idempotency(v_user_id, 'join_game_v1', idempotency_key);
    if v_existing is not null then
      return v_existing;
    end if;
    raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_game_v1
-- ---------------------------------------------------------------------------

create or replace function public.cancel_game_v1(
  public_id text,
  idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_existing jsonb;
  v_game public.games%rowtype;
  v_after public.games%rowtype;
  v_result jsonb;
  v_game_ref text := nullif(trim(coalesce(public_id, '')), '');
begin
  if v_user_id is null and v_role <> 'service_role' then
    return public.mutation_result('not_authenticated');
  end if;

  if idempotency_key is null then
    return public.mutation_result('ineligible', null, null, null, null, 'idempotency_key');
  end if;

  if v_user_id is not null then
    v_existing := public.read_mutation_idempotency(v_user_id, 'cancel_game_v1', idempotency_key);
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  select *
  into v_game
  from public.games g
  where (
    (v_game_ref ~ '^[0-9a-f]{32}$' and g.public_id = v_game_ref)
    or (
      v_game_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and g.id = v_game_ref::uuid
    )
  )
  for update;

  if not found then
    v_result := public.mutation_result('not_found');
    if v_user_id is not null then
      return public.store_mutation_idempotency(v_user_id, 'cancel_game_v1', idempotency_key, null, v_result);
    end if;
    return v_result;
  end if;

  if v_role <> 'service_role' and (v_user_id is null or v_game.host_id <> v_user_id) then
    v_result := public.mutation_result('unauthorized', v_game.id, v_game.public_id);
    return public.store_mutation_idempotency(v_user_id, 'cancel_game_v1', idempotency_key, v_game.id, v_result);
  end if;

  if v_game.status = 'cancelled' then
    v_result := public.mutation_result(
      'already_cancelled',
      v_game.id,
      v_game.public_id,
      v_game.chat_id,
      v_game.players_enrolled,
      null
    );
    return public.store_mutation_idempotency(v_user_id, 'cancel_game_v1', idempotency_key, v_game.id, v_result);
  end if;

  if v_game.status <> 'scheduled' then
    v_result := public.mutation_result(
      'ineligible',
      v_game.id,
      v_game.public_id,
      v_game.chat_id,
      v_game.players_enrolled,
      'status'
    );
    return public.store_mutation_idempotency(v_user_id, 'cancel_game_v1', idempotency_key, v_game.id, v_result);
  end if;

  update public.games
  set
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = v_user_id,
    completed_at = null,
    share_enabled = false
  where id = v_game.id
  returning * into v_after;

  v_result := public.mutation_result(
    'cancelled',
    v_after.id,
    v_after.public_id,
    v_after.chat_id,
    v_after.players_enrolled,
    null
  );

  perform public.emit_game_mutation_event(
    'game_cancelled',
    v_after.id,
    v_user_id,
    v_after.public_id,
    'cancelled',
    jsonb_build_object('reason', 'host_cancelled')
  );

  return public.store_mutation_idempotency(
    v_user_id,
    'cancel_game_v1',
    idempotency_key,
    v_after.id,
    v_result
  );
exception
  when unique_violation then
    v_existing := public.read_mutation_idempotency(v_user_id, 'cancel_game_v1', idempotency_key);
    if v_existing is not null then
      return v_existing;
    end if;
    raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- leave_game_v1 (capacity cache integrity for non-host leave)
-- ---------------------------------------------------------------------------

create or replace function public.leave_game_v1(
  public_id text,
  idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing jsonb;
  v_game public.games%rowtype;
  v_enrolled integer;
  v_result jsonb;
  v_deleted integer;
  v_game_ref text := nullif(trim(coalesce(public_id, '')), '');
begin
  if v_user_id is null then
    return public.mutation_result('not_authenticated');
  end if;

  if idempotency_key is null then
    return public.mutation_result('ineligible', null, null, null, null, 'idempotency_key');
  end if;

  v_existing := public.read_mutation_idempotency(v_user_id, 'leave_game_v1', idempotency_key);
  if v_existing is not null then
    return v_existing;
  end if;

  select *
  into v_game
  from public.games g
  where (
    (v_game_ref ~ '^[0-9a-f]{32}$' and g.public_id = v_game_ref)
    or (
      v_game_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and g.id = v_game_ref::uuid
    )
  )
  for update;

  if not found then
    v_result := public.mutation_result('not_found');
    return public.store_mutation_idempotency(v_user_id, 'leave_game_v1', idempotency_key, null, v_result);
  end if;

  if v_game.host_id = v_user_id then
    v_result := public.mutation_result(
      'ineligible',
      v_game.id,
      v_game.public_id,
      v_game.chat_id,
      v_game.players_enrolled,
      'host'
    );
    return public.store_mutation_idempotency(v_user_id, 'leave_game_v1', idempotency_key, v_game.id, v_result);
  end if;

  delete from public.game_players
  where game_id = v_game.id
    and user_id = v_user_id;

  get diagnostics v_deleted = row_count;

  if v_game.chat_id is not null then
    delete from public.conversation_members
    where chat_id = v_game.chat_id
      and id = v_user_id;
  end if;

  v_enrolled := public.sync_players_enrolled(v_game.id);

  if v_deleted = 0 then
    v_result := public.mutation_result(
      'not_member',
      v_game.id,
      v_game.public_id,
      v_game.chat_id,
      v_enrolled,
      null
    );
  else
    v_result := public.mutation_result(
      'left',
      v_game.id,
      v_game.public_id,
      v_game.chat_id,
      v_enrolled,
      null
    );
  end if;

  return public.store_mutation_idempotency(
    v_user_id,
    'leave_game_v1',
    idempotency_key,
    v_game.id,
    v_result
  );
exception
  when unique_violation then
    v_existing := public.read_mutation_idempotency(v_user_id, 'leave_game_v1', idempotency_key);
    if v_existing is not null then
      return v_existing;
    end if;
    raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.sync_players_enrolled(uuid) from public;
revoke all on function public.ensure_game_chat(public.games, text) from public;
revoke all on function public.resolve_game_for_mutation(text) from public;
revoke all on function public.mutation_result(text, uuid, text, uuid, integer, text) from public;
revoke all on function public.read_mutation_idempotency(uuid, text, uuid) from public;
revoke all on function public.store_mutation_idempotency(uuid, text, uuid, uuid, jsonb) from public;
revoke all on function public.emit_game_mutation_event(text, uuid, uuid, text, text, jsonb) from public;
revoke all on function public.validate_join_eligibility(uuid, public.games) from public;
revoke all on function public.create_game_v1(jsonb, uuid) from public;
revoke all on function public.join_game_v1(text, uuid, text) from public;
revoke all on function public.cancel_game_v1(text, uuid) from public;
revoke all on function public.leave_game_v1(text, uuid) from public;

grant execute on function public.create_game_v1(jsonb, uuid) to authenticated, service_role;
grant execute on function public.join_game_v1(text, uuid, text) to authenticated, service_role;
grant execute on function public.cancel_game_v1(text, uuid) to authenticated, service_role;
grant execute on function public.leave_game_v1(text, uuid) to authenticated, service_role;

