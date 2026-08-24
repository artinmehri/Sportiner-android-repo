-- Expose expired as a distinct internal resolution state without replacing the public resolver.

create or replace function public.game_resolution_state(p_game games)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if p_game.id is null then return 'not_found_or_restricted'; end if;
  if p_game.status = 'cancelled' then return 'cancelled'; end if;
  if p_game.status = 'completed' then return 'completed'; end if;
  if p_game.status = 'expired' then return 'expired'; end if;

  if p_game.status <> 'scheduled'
     or p_game.is_public is not true
     or p_game.share_enabled is not true
     or p_game.is_test is true then
    return 'not_found_or_restricted';
  end if;

  if p_game."time" is not null and now() > p_game."time" then return 'started'; end if;

  select count(*)::integer into v_count
  from public.game_players gp where gp.game_id = p_game.id;

  if v_count >= coalesce(p_game.game_capacity, 0) then return 'full'; end if;
  return 'available';
end;
$$;
