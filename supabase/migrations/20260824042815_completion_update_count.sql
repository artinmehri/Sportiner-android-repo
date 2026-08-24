-- Keep the processor's diagnostic count cumulative across all games in a run.

create or replace function private.process_game_completion_v1(p_backfill boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_game public.games%rowtype;
  v_end_time timestamptz;
  v_participant_count integer;
  v_completed integer := 0;
  v_expired integer := 0;
  v_games_played_updates integer := 0;
  v_user_updates integer;
begin
  -- ponytail: row-at-a-time game lock, batch locking only when game volume requires it.
  for v_game in
    select *
    from public.games
    where status = 'scheduled'
      and coalesce(is_test, false) is false
      and "time" is not null
      and "time" + make_interval(mins => duration_minutes) <= now()
    order by "time", id
    for update skip locked
  loop
    v_end_time := v_game."time" + make_interval(mins => v_game.duration_minutes);

    select count(*)::integer into v_participant_count
    from (
      select v_game.host_id as user_id
      union
      select gp.user_id
      from public.game_players gp
      where gp.game_id = v_game.id and gp.role = 'member'
    ) participants
    where user_id is not null;

    if v_participant_count >= 2 then
      update public.games
      set status = 'completed', completed_at = v_end_time
      where id = v_game.id;

      update public.users u
      set "gamesPlayed" = coalesce(u."gamesPlayed", 0) + 1,
          updated_at = now()
      where u.id in (
        select v_game.host_id
        union
        select gp.user_id
        from public.game_players gp
        where gp.game_id = v_game.id and gp.role = 'member'
      );
      get diagnostics v_user_updates = row_count;
      v_games_played_updates := v_games_played_updates + v_user_updates;

      perform public.emit_product_event_v1(
        'game_completed', null, null, v_game.public_id, v_game.id, null, null,
        'production', 'server',
        jsonb_build_object(
          'participant_count', v_participant_count,
          'completion_basis', 'authoritative_end_time_and_current_members',
          'effective_end_time', v_end_time,
          'backfill', p_backfill,
          'end_time_basis', case when p_backfill then 'historical_games_time_plus_two_hours' else 'authoritative_duration_minutes' end
        ),
        md5('game_completed:' || v_game.id::text)::uuid
      );
      v_completed := v_completed + 1;
    else
      update public.games
      set status = 'expired', share_enabled = false
      where id = v_game.id;
      v_expired := v_expired + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'completed_games', v_completed,
    'expired_games', v_expired,
    'games_played_user_updates', v_games_played_updates
  );
end;
$$;

revoke all on function private.process_game_completion_v1(boolean) from public, anon, authenticated;
grant execute on function private.process_game_completion_v1(boolean) to service_role;
