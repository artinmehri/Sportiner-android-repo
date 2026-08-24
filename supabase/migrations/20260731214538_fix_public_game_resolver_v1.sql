create or replace function public.resolve_public_game_v1(
  public_id text,
  share_code text default null
)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_started_at timestamptz := clock_timestamp();
  v_public_id text := lower(trim(coalesce(public_id, '')));
  v_game record;
  v_state text;
  v_latency_ms integer;
begin
  -- share_code is reserved for attribution validation. It must never broaden
  -- which games are visible through this public resolver.
  perform share_code;

  if v_public_id !~ '^[0-9a-f]{32}$' then
    return json_build_object(
      'state', 'invalid',
      'id', null,
      'public_id', null,
      'latency_ms', null,
      'game', null
    );
  end if;

  select g.*, u.name as host_name
    into v_game
  from public.games g
  left join public.users u on u.id = g.host_id
  where g.public_id = v_public_id
    and g.is_public is true
    and g.share_enabled is true
    and g.is_test is false
    and (
      auth.uid() is null
      or g.host_id is null
      or not public.has_blocked_relationship(g.host_id, auth.uid())
    )
  limit 1;

  v_latency_ms := greatest(
    0,
    floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000)::integer
  );

  if not found then
    return json_build_object(
      'state', 'not_found_or_restricted',
      'id', null,
      'public_id', v_public_id,
      'latency_ms', v_latency_ms,
      'game', null
    );
  end if;

  v_state := case
    when v_game.status = 'cancelled' then 'cancelled'
    when v_game.status = 'completed' then 'completed'
    when v_game.status = 'scheduled' and v_game.time <= now() then 'started'
    when coalesce(v_game.players_enrolled, 0) >= coalesce(v_game.game_capacity, 0) then 'full'
    else 'available'
  end;

  return json_build_object(
    'state', v_state,
    'id', v_game.id,
    'public_id', v_game.public_id,
    'latency_ms', v_latency_ms,
    'game', json_build_object(
      'id', v_game.id,
      'title', v_game.title,
      'sport', 'tennis',
      'description', v_game.description,
      'start_time', v_game.time,
      'local_date', case
        when v_game.time is null then null
        else to_char(v_game.time at time zone 'America/Toronto', 'YYYY-MM-DD')
      end,
      'local_time', case
        when v_game.time is null then null
        else to_char(v_game.time at time zone 'America/Toronto', 'HH24:MI')
      end,
      'timezone', 'America/Toronto',
      'location_name', v_game.location_name,
      'approximate_location', 'Toronto',
      'skill_level', v_game.level,
      'player_count', v_game.players_enrolled,
      'capacity', v_game.game_capacity,
      'host_display_name', v_game.host_name,
      'image', v_game.image,
      'is_paid', coalesce(v_game.is_paid, false),
      'payment_amount', v_game.payment_amount,
      'court_type', v_game.court_type,
      'game_type', v_game.type
    )
  );
end;
$function$;

revoke all on function public.resolve_public_game_v1(text, text) from public;
grant execute on function public.resolve_public_game_v1(text, text)
  to anon, authenticated, service_role;
