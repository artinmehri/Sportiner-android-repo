-- Add server-owned lifecycle and onboarding events to the existing product_events path.

create or replace function public.emit_canonical_game_event_v1(
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
declare
  v_event_id uuid;
begin
  if p_event_name not in ('game_created', 'game_joined') then
    raise exception 'unsupported canonical game event: %', p_event_name;
  end if;

  if p_event_name = 'game_created' then
    v_event_id := md5('game_created:' || p_game_id::text)::uuid;
  else
    v_event_id := md5('game_joined:' || p_game_id::text || ':' || p_user_id::text)::uuid;
  end if;

  perform public.emit_product_event_v1(
    p_event_name,
    p_user_id,
    null,
    p_public_id,
    p_game_id,
    null,
    null,
    'production',
    'server',
    jsonb_strip_nulls(
      jsonb_build_object('result', p_result_code, 'public_id', p_public_id)
      || coalesce(p_extra, '{}'::jsonb)
    ),
    v_event_id
  );

exception
  when others then
    null;
end;
$$;

revoke all on function public.emit_canonical_game_event_v1(text, uuid, uuid, text, text, jsonb)
from public, anon, authenticated;
grant execute on function public.emit_canonical_game_event_v1(text, uuid, uuid, text, text, jsonb)
to service_role;

create or replace function public.emit_game_created_event_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(new.is_test, false) is false then
    perform public.emit_canonical_game_event_v1(
      'game_created',
      new.id,
      new.host_id,
      new.public_id,
      'created',
      jsonb_build_object('capacity', new.game_capacity, 'type', new.type)
    );
  end if;
  return new;
end;
$$;

create or replace function public.emit_game_joined_event_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_game public.games%rowtype;
begin
  if new.role <> 'member' then
    return new;
  end if;

  select * into v_game from public.games where id = new.game_id;
  if not found or coalesce(v_game.is_test, false) then
    return new;
  end if;

  perform public.emit_canonical_game_event_v1(
    'game_joined',
    v_game.id,
    new.user_id,
    v_game.public_id,
    'joined',
    jsonb_build_object('game_player_id', new.id, 'players_enrolled', v_game.players_enrolled)
  );

  return new;
end;
$$;

drop trigger if exists games_emit_game_created_event on public.games;
create trigger games_emit_game_created_event
after insert on public.games
for each row execute function public.emit_game_created_event_v1();

drop trigger if exists game_players_emit_game_joined_event on public.game_players;
create trigger game_players_emit_game_joined_event
after insert on public.game_players
for each row execute function public.emit_game_joined_event_v1();

create or replace function public.emit_onboarding_events_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_stage integer := 0;
  v_new_stage integer := 0;
  v_version integer := greatest(coalesce(new.onboarding_version, 1), 1);
  v_stage integer;
begin
  if tg_op = 'UPDATE' then
    if old.onboarding_version is distinct from new.onboarding_version then
      v_old_stage := 0;
    else
      v_old_stage := case
        when old.onboarding_stage ~ '^[1-7]$' then old.onboarding_stage::integer
        when old.onboarding_stage = 'Completed' then 8
        else 0
      end;
    end if;
  end if;

  v_new_stage := case
    when new.onboarding_stage ~ '^[1-7]$' then new.onboarding_stage::integer
    when new.onboarding_stage = 'Completed' then 8
    else 0
  end;

  if v_new_stage = 0 or v_new_stage < v_old_stage then
    return new;
  end if;

  if v_old_stage = 0 and v_new_stage < 8 then
    perform public.emit_product_event_v1(
      'onboarding_started', new.id, null, null, null, null, null, 'production', 'server',
      jsonb_build_object('onboarding_version', v_version),
      md5('onboarding_started:' || new.id::text || ':' || v_version::text)::uuid
    );
  end if;

  for v_stage in greatest(v_old_stage + 1, 1)..least(v_new_stage, 7) loop
    perform public.emit_product_event_v1(
      'onboarding_step_completed', new.id, null, null, null, null, null, 'production', 'server',
      jsonb_build_object('stage', v_stage, 'onboarding_version', v_version),
      md5('onboarding_step_completed:' || new.id::text || ':' || v_version::text || ':' || v_stage::text)::uuid
    );
  end loop;

  if tg_op = 'UPDATE' and v_old_stage < 8 and v_new_stage = 8 then
    perform public.emit_product_event_v1(
      'onboarding_completed', new.id, null, null, null, null, null, 'production', 'server',
      jsonb_build_object('onboarding_version', v_version),
      md5('onboarding_completed:' || new.id::text || ':' || v_version::text)::uuid
    );
  end if;

  return new;
end;
$$;

drop trigger if exists users_emit_onboarding_events on public.users;
create trigger users_emit_onboarding_events
after insert or update of onboarding_stage, onboarding_version on public.users
for each row execute function public.emit_onboarding_events_v1();
