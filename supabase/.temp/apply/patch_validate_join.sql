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

  -- Skill remains informational in this release: historical user.level values are
  -- lowercase while game.level uses title case, and prior join paths never gated on skill.
  return null;
end;
$$;
