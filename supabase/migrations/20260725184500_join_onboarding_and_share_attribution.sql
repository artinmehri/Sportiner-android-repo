-- SPO-261 follow-up: server-side minimum onboarding for join + accept attributed share codes.

begin;

create or replace function public.user_meets_minimum_onboarding_v1(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = p_user_id
      and (
        coalesce(u.onboarding_stage, '') in ('minimum_complete', 'complete')
        or (
          nullif(btrim(coalesce(u.name, '')), '') is not null
          and nullif(btrim(coalesce(u.age_group, '')), '') is not null
          and nullif(btrim(coalesce(u.level, '')), '') is not null
        )
      )
  );
$$;

revoke all on function public.user_meets_minimum_onboarding_v1(uuid) from public;
grant execute on function public.user_meets_minimum_onboarding_v1(uuid) to authenticated, service_role;

-- Stage may only advance when required profile fields are present.
create or replace function public.enforce_onboarding_stage_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE'
     and NEW.onboarding_stage is distinct from OLD.onboarding_stage
     and NEW.onboarding_stage in ('minimum_complete', 'complete')
     and (
       nullif(btrim(coalesce(NEW.name, '')), '') is null
       or nullif(btrim(coalesce(NEW.age_group, '')), '') is null
       or nullif(btrim(coalesce(NEW.level, '')), '') is null
     ) then
    raise exception using
      errcode = '23514',
      message = 'onboarding_stage requires name, age_group, and level.';
  end if;
  return NEW;
end;
$$;

drop trigger if exists users_enforce_onboarding_stage_fields on public.users;
create trigger users_enforce_onboarding_stage_fields
  before update of onboarding_stage on public.users
  for each row
  execute function public.enforce_onboarding_stage_fields();

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
  v_share_ok boolean := false;
begin
  if v_user_id is null then
    return public.mutation_result('not_authenticated');
  end if;

  if idempotency_key is null then
    return public.mutation_result('ineligible', null, null, null, null, 'idempotency_key');
  end if;

  if not public.user_meets_minimum_onboarding_v1(v_user_id) then
    return public.mutation_result('ineligible', null, null, null, null, 'onboarding');
  end if;

  v_existing := public.read_mutation_idempotency(v_user_id, 'join_game_v1', idempotency_key);
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
    return public.store_mutation_idempotency(v_user_id, 'join_game_v1', idempotency_key, null, v_result);
  end if;

  if v_share is not null then
    if v_share = v_game.public_id then
      v_share_ok := true;
    elsif v_share ~ '^[A-Za-z0-9_-]{16,128}$' then
      select exists (
        select 1
        from public.game_share_links gsl
        where gsl.share_code = v_share
          and gsl.game_id = v_game.id
          and gsl.revoked_at is null
          and (gsl.expires_at is null or gsl.expires_at > now())
      ) into v_share_ok;
    end if;

    if not v_share_ok then
      v_result := public.mutation_result('not_found');
      return public.store_mutation_idempotency(v_user_id, 'join_game_v1', idempotency_key, v_game.id, v_result);
    end if;
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
      'share_code_validated', v_share is not null and v_share_ok,
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

revoke all on function public.join_game_v1(text, uuid, text) from public;
grant execute on function public.join_game_v1(text, uuid, text) to authenticated, service_role;

commit;
