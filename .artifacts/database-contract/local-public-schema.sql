


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."acquisition_attribution_enabled"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (select enabled from public.growth_flags where key = 'acquisition_attribution'),
    true
  );
$$;


ALTER FUNCTION "public"."acquisition_attribution_enabled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."alias_analytics_identity_v1"("p_anonymous_id" "uuid", "p_source" "text" DEFAULT 'app'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_source text := coalesce(nullif(trim(p_source), ''), 'app');
  v_existing public.analytics_identity_links%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if p_anonymous_id is null then
    raise exception using errcode = '22023', message = 'anonymous_id is required.';
  end if;

  if v_source not in ('app', 'web', 'alias_rpc') then
    v_source := 'app';
  end if;

  select * into v_existing
  from public.analytics_identity_links
  where anonymous_id = p_anonymous_id
  for update;

  if found then
    if v_existing.user_id is not null and v_existing.user_id is distinct from v_user_id then
      raise exception using errcode = '23505', message = 'anonymous_id is already linked.';
    end if;

    if v_existing.user_id = v_user_id then
      return jsonb_build_object(
        'ok', true,
        'anonymous_id', p_anonymous_id,
        'user_id', v_user_id,
        'already_linked', true
      );
    end if;

    update public.analytics_identity_links
    set user_id = v_user_id,
        linked_at = now(),
        source = v_source
    where anonymous_id = p_anonymous_id;
  else
    -- Prevent a second anonymous_id binding for the same user (one active alias chain).
    if exists (
      select 1
      from public.analytics_identity_links
      where user_id = v_user_id
    ) then
      raise exception using errcode = '23505', message = 'user already has an anonymous alias.';
    end if;

    insert into public.analytics_identity_links (
      anonymous_id, user_id, linked_at, source
    ) values (
      p_anonymous_id, v_user_id, now(), v_source
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'anonymous_id', p_anonymous_id,
    'user_id', v_user_id,
    'already_linked', false
  );
end;
$$;


ALTER FUNCTION "public"."alias_analytics_identity_v1"("p_anonymous_id" "uuid", "p_source" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analytics_ingestion_enabled"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (select enabled from public.growth_flags where key = 'analytics_ingestion'),
    true
  );
$$;


ALTER FUNCTION "public"."analytics_ingestion_enabled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approximate_area_label"("p_location_name" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select case
    when nullif(btrim(coalesce(p_location_name, '')), '') is null then 'Toronto'
    else 'Toronto'
  end;
$$;


ALTER FUNCTION "public"."approximate_area_label"("p_location_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_chat"("p_chat_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(p_user_id is not null and exists (
    select 1
    from public.chat c
    where c.id = p_chat_id
      and (
        public.is_conversation_member(c.id, p_user_id)
        or public.is_game_host(c.game_id, p_user_id)
      )
      and not exists (
        select 1
        from public.conversation_members cm
        where cm.chat_id = c.id
          and cm.id <> p_user_id
          and public.has_blocked_relationship(cm.id, p_user_id)
      )
  ), false);
$$;


ALTER FUNCTION "public"."can_access_chat"("p_chat_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_game_v1"("public_id" "text", "idempotency_key" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."cancel_game_v1"("public_id" "text", "idempotency_key" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_game_v1"("payload" "jsonb", "idempotency_key" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."create_game_v1"("payload" "jsonb", "idempotency_key" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_or_get_game_share_link_v1"("p_game_public_id" "text", "p_surface" "text", "p_campaign_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'extensions'
    AS $_$
declare
  v_user_id uuid := auth.uid();
  v_game public.games%rowtype;
  v_surface text := lower(trim(coalesce(p_surface, '')));
  v_campaign text := nullif(trim(coalesce(p_campaign_id, '')), '');
  v_link public.game_share_links%rowtype;
  v_is_member boolean := false;
  v_attempts integer := 0;
  v_code text;
  v_url text;
  v_link_count integer;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;

  if not public.game_sharing_enabled() then
    return jsonb_build_object('ok', false, 'code', 'sharing_disabled');
  end if;

  if p_game_public_id is null or p_game_public_id !~ '^[a-f0-9]{32}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_public_id');
  end if;

  if v_surface not in (
    'game_detail', 'creation_success', 'native_sheet', 'copy', 'profile', 'suggestion', 'push'
  ) then
    return jsonb_build_object('ok', false, 'code', 'invalid_surface');
  end if;

  if v_campaign is not null and length(v_campaign) > 80 then
    return jsonb_build_object('ok', false, 'code', 'invalid_campaign');
  end if;

  select * into v_game
  from public.games g
  where g.public_id = p_game_public_id
  for share;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found_or_restricted');
  end if;

  if coalesce(v_game.is_public, false) is not true
     or v_game.status is distinct from 'scheduled'
     or coalesce(v_game.share_enabled, true) is not true
     or coalesce(v_game.is_test, false) is true then
    return jsonb_build_object('ok', false, 'code', 'not_shareable');
  end if;

  v_is_member := v_game.host_id = v_user_id
    or exists (
      select 1
      from public.game_players gp
      where gp.game_id = v_game.id
        and gp.user_id = v_user_id
    );

  if not v_is_member then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  -- Cap total links per user/game (default + campaigns).
  select count(*)::int into v_link_count
  from public.game_share_links
  where game_id = v_game.id
    and created_by = v_user_id
    and revoked_at is null;

  -- Reuse active default when no campaign.
  if v_campaign is null then
    select * into v_link
    from public.game_share_links
    where game_id = v_game.id
      and created_by = v_user_id
      and surface = v_surface
      and campaign_id is null
      and revoked_at is null
    limit 1;

    if found then
      v_url := 'https://sportiner.com/g/' || v_game.public_id || '?s=' || v_link.share_code;
      return jsonb_build_object(
        'ok', true,
        'code', 'reused',
        'link_id', v_link.id,
        'share_code', v_link.share_code,
        'public_id', v_game.public_id,
        'url', v_url,
        'surface', v_link.surface,
        'campaign_id', null
      );
    end if;
  end if;

  if v_link_count >= 25 then
    return jsonb_build_object('ok', false, 'code', 'link_cap_reached');
  end if;

  loop
    v_attempts := v_attempts + 1;
    v_code := public.generate_game_share_code();
    begin
      insert into public.game_share_links (
        share_code, game_id, created_by, surface, campaign_id, metadata
      ) values (
        v_code,
        v_game.id,
        v_user_id,
        v_surface,
        v_campaign,
        jsonb_build_object('version', 1)
      )
      returning * into v_link;
      exit;
    exception
      when unique_violation then
        if v_attempts >= 5 then
          return jsonb_build_object('ok', false, 'code', 'code_collision');
        end if;
    end;
  end loop;

  v_url := 'https://sportiner.com/g/' || v_game.public_id || '?s=' || v_link.share_code;

  return jsonb_build_object(
    'ok', true,
    'code', 'created',
    'link_id', v_link.id,
    'share_code', v_link.share_code,
    'public_id', v_game.public_id,
    'url', v_url,
    'surface', v_link.surface,
    'campaign_id', v_link.campaign_id
  );
end;
$_$;


ALTER FUNCTION "public"."create_or_get_game_share_link_v1"("p_game_public_id" "text", "p_surface" "text", "p_campaign_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deactivate_push_token_v1"("p_installation_id" "text" DEFAULT NULL::"text", "p_expo_push_token" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_installation_id text := nullif(trim(coalesce(p_installation_id, '')), '');
  v_token text := nullif(trim(coalesce(p_expo_push_token, '')), '');
  v_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if v_installation_id is null and v_token is null then
    raise exception using errcode = '22023', message = 'installation_id or expo push token is required.';
  end if;

  update public.push_devices
  set active = false,
      permission_granted = false,
      permission_status = case
        when permission_status = 'denied' then permission_status
        else 'unknown'
      end,
      deactivated_at = coalesce(deactivated_at, now()),
      last_seen_at = now()
  where user_id = v_user_id
    and active = true
    and (
      (v_installation_id is not null and installation_id = v_installation_id)
      or (v_token is not null and expo_push_token = v_token)
    );

  get diagnostics v_count = row_count;

  return jsonb_build_object('deactivated', v_count);
end;
$$;


ALTER FUNCTION "public"."deactivate_push_token_v1"("p_installation_id" "text", "p_expo_push_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."emit_game_mutation_event"("p_event_name" "text", "p_game_id" "uuid", "p_user_id" "uuid", "p_public_id" "text", "p_result_code" "text", "p_extra" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
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
      jsonb_build_object(
        'result', p_result_code,
        'public_id', p_public_id
      ) || coalesce(p_extra, '{}'::jsonb)
    ),
    null
  );

  if p_event_name = 'game_join_completed' and p_result_code = 'joined' then
    perform public.maybe_emit_shared_game_join_completed_v1(
      p_user_id,
      p_game_id,
      p_public_id,
      coalesce(p_extra, '{}'::jsonb) || jsonb_build_object('join_mode', 'explicit')
    );
  end if;
exception
  when others then
    null;
end;
$$;


ALTER FUNCTION "public"."emit_game_mutation_event"("p_event_name" "text", "p_game_id" "uuid", "p_user_id" "uuid", "p_public_id" "text", "p_result_code" "text", "p_extra" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."emit_product_event_v1"("p_event_name" "text", "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_anonymous_id" "uuid" DEFAULT NULL::"uuid", "p_public_id" "text" DEFAULT NULL::"text", "p_resolved_game_id" "uuid" DEFAULT NULL::"uuid", "p_link_id" "uuid" DEFAULT NULL::"uuid", "p_session_id" "text" DEFAULT NULL::"text", "p_environment" "text" DEFAULT 'production'::"text", "p_platform" "text" DEFAULT 'server'::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_event_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.analytics_ingestion_enabled() then
    return;
  end if;

  insert into public.product_events (
    event_id,
    event_name,
    event_version,
    anonymous_id,
    user_id,
    game_id,
    resolved_game_id,
    link_id,
    session_id,
    platform,
    environment,
    metadata,
    occurred_at,
    received_at,
    created_at
  )
  values (
    coalesce(p_event_id, gen_random_uuid()),
    p_event_name,
    1,
    p_anonymous_id,
    p_user_id,
    left(coalesce(p_public_id, p_resolved_game_id::text, ''), 160),
    p_resolved_game_id,
    p_link_id,
    left(coalesce(p_session_id, ''), 160),
    p_platform,
    case
      when p_environment in ('development', 'preview', 'production') then p_environment
      else 'production'
    end,
    coalesce(p_metadata, '{}'::jsonb),
    now(),
    now(),
    now()
  )
  on conflict (event_id) do nothing;
exception
  when others then
    null;
end;
$$;


ALTER FUNCTION "public"."emit_product_event_v1"("p_event_name" "text", "p_user_id" "uuid", "p_anonymous_id" "uuid", "p_public_id" "text", "p_resolved_game_id" "uuid", "p_link_id" "uuid", "p_session_id" "text", "p_environment" "text", "p_platform" "text", "p_metadata" "jsonb", "p_event_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_game_lifecycle"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."enforce_game_lifecycle"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_onboarding_stage_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if NEW.onboarding_stage in ('minimum_complete', 'complete')
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


ALTER FUNCTION "public"."enforce_onboarding_stage_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_game_public_id"() RETURNS "text"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
  select encode(extensions.gen_random_bytes(16), 'hex');
$$;


ALTER FUNCTION "public"."generate_game_public_id"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."games" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "host_id" "uuid" DEFAULT "extensions"."gen_random_uuid"(),
    "title" "text",
    "description" "text",
    "type" "text",
    "location_cords" "public"."geography",
    "time" timestamp with time zone,
    "level" "text",
    "is_public" boolean DEFAULT true NOT NULL,
    "game_capacity" smallint,
    "is_booked" boolean,
    "payment_amount" integer,
    "chat_id" "uuid",
    "image" "text" DEFAULT 'https://plus.unsplash.com/premium_photo-1666913667023-4bfd0f6cff0a?q=80&w=987&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'::"text",
    "court_type" "text",
    "location_name" "text",
    "is_paid" boolean,
    "players_enrolled" integer,
    "public_id" "text" DEFAULT "public"."generate_game_public_id"() NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "cancelled_at" timestamp with time zone,
    "cancelled_by" "uuid",
    "completed_at" timestamp with time zone,
    "share_enabled" boolean DEFAULT true NOT NULL,
    "is_test" boolean DEFAULT false NOT NULL,
    CONSTRAINT "games_capacity_check" CHECK ((("game_capacity" IS NOT NULL) AND (("game_capacity" >= 2) AND ("game_capacity" <= 64)))),
    CONSTRAINT "games_current_release_public_check" CHECK (("is_public" IS TRUE)),
    CONSTRAINT "games_lifecycle_timestamp_check" CHECK (((("status" = 'scheduled'::"text") AND ("cancelled_at" IS NULL) AND ("cancelled_by" IS NULL) AND ("completed_at" IS NULL)) OR (("status" = 'cancelled'::"text") AND ("cancelled_at" IS NOT NULL) AND ("completed_at" IS NULL)) OR (("status" = 'completed'::"text") AND ("completed_at" IS NOT NULL) AND ("cancelled_at" IS NULL) AND ("cancelled_by" IS NULL) AND (("time" IS NULL) OR ("completed_at" >= "time"))))),
    CONSTRAINT "games_player_count_check" CHECK ((("players_enrolled" IS NOT NULL) AND (("players_enrolled" >= 1) AND ("players_enrolled" <= "game_capacity")))),
    CONSTRAINT "games_public_id_format_check" CHECK (("public_id" ~ '^[0-9a-f]{32}$'::"text")),
    CONSTRAINT "games_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'cancelled'::"text", 'completed'::"text"])))
);

ALTER TABLE ONLY "public"."games" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."games" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_game_chat"("p_game" "public"."games", "p_host_level" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."ensure_game_chat"("p_game" "public"."games", "p_host_level" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "user_id" "uuid" NOT NULL,
    "chat_messages" boolean DEFAULT true NOT NULL,
    "message_previews" boolean DEFAULT false NOT NULL,
    "game_reminders" boolean DEFAULT true NOT NULL,
    "host_updates" boolean DEFAULT true NOT NULL,
    "nearby_games" boolean DEFAULT false NOT NULL,
    "favourite_park_games" boolean DEFAULT false NOT NULL,
    "marketing_updates" boolean DEFAULT false NOT NULL,
    "radius_meters" integer DEFAULT 5000 NOT NULL,
    "quiet_hours_enabled" boolean DEFAULT true NOT NULL,
    "quiet_start" time without time zone DEFAULT '21:00:00'::time without time zone NOT NULL,
    "quiet_end" time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    "timezone" "text" DEFAULT 'UTC'::"text" NOT NULL,
    "primer_state" "text" DEFAULT 'not_shown'::"text" NOT NULL,
    "primer_last_shown_at" timestamp with time zone,
    "primer_snooze_until" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notification_preferences_primer_state_check" CHECK (("primer_state" = ANY (ARRAY['not_shown'::"text", 'shown'::"text", 'accepted'::"text", 'dismissed'::"text", 'snoozed'::"text"]))),
    CONSTRAINT "notification_preferences_radius_meters_check" CHECK (("radius_meters" = ANY (ARRAY[2000, 5000, 10000])))
);

ALTER TABLE ONLY "public"."notification_preferences" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


COMMENT ON TABLE "public"."notification_preferences" IS 'SPO-264 product-level notification controls. OS permission is separate; discovery/marketing default off.';



CREATE OR REPLACE FUNCTION "public"."ensure_notification_preferences_row"("p_user_id" "uuid") RETURNS "public"."notification_preferences"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.notification_preferences%rowtype;
begin
  insert into public.notification_preferences (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select * into v_row
  from public.notification_preferences
  where user_id = p_user_id;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."ensure_notification_preferences_row"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."game_resolution_state"("p_game" "public"."games") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_count integer;
begin
  if p_game.id is null then
    return 'not_found_or_restricted';
  end if;

  if p_game.status = 'cancelled' then
    return 'cancelled';
  end if;

  if p_game.status = 'completed' then
    return 'completed';
  end if;

  if p_game.status <> 'scheduled'
     or p_game.is_public is not true
     or p_game.share_enabled is not true
     or p_game.is_test is true then
    return 'not_found_or_restricted';
  end if;

  if p_game."time" is not null and now() > p_game."time" then
    return 'started';
  end if;

  select count(*)::integer
  into v_count
  from public.game_players gp
  where gp.game_id = p_game.id;

  if v_count >= coalesce(p_game.game_capacity, 0) then
    return 'full';
  end if;

  return 'available';
end;
$$;


ALTER FUNCTION "public"."game_resolution_state"("p_game" "public"."games") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."game_sharing_enabled"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (select enabled from public.growth_flags where key = 'game_sharing'),
    true
  );
$$;


ALTER FUNCTION "public"."game_sharing_enabled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_game_share_code"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_code text;
begin
  -- 128-bit URL-safe token (32 hex chars).
  v_code := encode(gen_random_bytes(16), 'hex');
  return v_code;
end;
$$;


ALTER FUNCTION "public"."generate_game_share_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_analytics_dashboard_firebase_v1"("p_range_days" integer DEFAULT 7, "p_park" "text" DEFAULT 'all'::"text", "p_level" "text" DEFAULT 'all'::"text", "p_game_type" "text" DEFAULT 'all'::"text", "p_segment" "text" DEFAULT 'all'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'extensions'
    AS $_$
declare
  v_founder_user_ids uuid[] := array['6f536ad7-ed4d-436f-ac0b-c83e2bbea881']::uuid[];
  v_owner_email text := 'artinmehri7777@gmail.com';
  v_days integer := least(greatest(coalesce(p_range_days, 7), 1), 90);
  v_from timestamptz := now() - make_interval(days => least(greatest(coalesce(p_range_days, 7), 1), 90));
  v_base jsonb;
  v_user_ids uuid[] := array[]::uuid[];
  v_game_ids uuid[] := array[]::uuid[];
  v_metrics jsonb;
  v_trend jsonb;
  v_funnel jsonb;
  v_parks jsonb;
  v_games jsonb;
  v_hourly jsonb;
  v_quality jsonb;
  v_remaining_quality jsonb;
  v_map_parks jsonb;
  v_map_games jsonb;
  v_map_activity jsonb;
  v_patched_coverage jsonb;
  v_accounts numeric := 0;
  v_accepted numeric := 0;
  v_hosts numeric := 0;
  v_players numeric := 0;
  v_relevant_impressions numeric := 0;
  v_game_views numeric := 0;
  v_join_starts numeric := 0;
  v_reciprocal_responses numeric := 0;
  v_product_events numeric := 0;
  v_location_events numeric := 0;
  v_completed_outcomes numeric := 0;
  v_previous_outcomes numeric := 0;
  v_founder_games_excluded integer := 0;
  v_suppressed_cells integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service authentication is required.';
  end if;

  perform set_config('request.jwt.claim.sub', '6f536ad7-ed4d-436f-ac0b-c83e2bbea881', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', '6f536ad7-ed4d-436f-ac0b-c83e2bbea881',
      'role', 'authenticated',
      'aal', 'aal2'
    )::text,
    true
  );

  v_base := public.get_analytics_dashboard_v1(
    v_days,
    coalesce(p_park, 'all'),
    coalesce(p_level, 'all'),
    coalesce(p_game_type, 'all'),
    coalesce(p_segment, 'all')
  );

  select coalesce(array_agg(u.id), array[]::uuid[]) into v_user_ids
  from public.users u
  where not (u.id = any(v_founder_user_ids))
    and (coalesce(p_level, 'all') = 'all' or lower(coalesce(u.level, '')) = lower(p_level))
    and (
      coalesce(p_segment, 'all') = 'all'
      or (p_segment = 'accepted-terms' and u.accepted_terms is true)
      or (p_segment = 'new-users' and u.created_at >= v_from)
      or (p_segment = 'game-hosts' and exists (
        select 1 from public.games gh
        where gh.host_id = u.id and not (gh.host_id = any(v_founder_user_ids))
      ))
      or (p_segment = 'game-players' and exists (
        select 1 from public.game_players gpp
        where gpp.user_id = u.id and not (gpp.user_id = any(v_founder_user_ids))
      ))
    );

  select coalesce(array_agg(g.id), array[]::uuid[]) into v_game_ids
  from public.games g
  left join lateral (
    select ap.slug
    from public.analytics_parks ap
    where g.location_cords is not null
    order by st_distance(ap.location, g.location_cords)
    limit 1
  ) park on true
  where not (g.host_id = any(v_founder_user_ids))
    and (coalesce(p_park, 'all') = 'all' or park.slug = p_park)
    and (coalesce(p_level, 'all') = 'all' or lower(coalesce(g.level, '')) = lower(p_level))
    and (coalesce(p_game_type, 'all') = 'all' or lower(coalesce(g.type, '')) = lower(p_game_type))
    and (
      coalesce(p_segment, 'all') = 'all'
      or g.host_id = any(v_user_ids)
      or exists (
        select 1 from public.game_players sgp
        where sgp.game_id = g.id
          and sgp.user_id = any(v_user_ids)
          and not (sgp.user_id = any(v_founder_user_ids))
      )
    );

  select count(*)::integer into v_founder_games_excluded
  from public.games g
  left join lateral (
    select ap.slug
    from public.analytics_parks ap
    where g.location_cords is not null
    order by st_distance(ap.location, g.location_cords)
    limit 1
  ) park on true
  where g.host_id = any(v_founder_user_ids)
    and (g.created_at >= v_from or g.time >= v_from)
    and (coalesce(p_park, 'all') = 'all' or park.slug = p_park)
    and (coalesce(p_level, 'all') = 'all' or lower(coalesce(g.level, '')) = lower(p_level))
    and (coalesce(p_game_type, 'all') = 'all' or lower(coalesce(g.type, '')) = lower(p_game_type));

  with fill_stats as (
    select
      coalesce(sum(least(roster.count, greatest(coalesce(g.game_capacity, 2), 1))), 0)::numeric as filled,
      coalesce(sum(greatest(coalesce(g.game_capacity, 2), 1)), 0)::numeric as capacity
    from public.games g
    left join lateral (
      select count(*)::integer as count
      from public.game_players gp
      where gp.game_id = g.id
        and not (gp.user_id = any(v_founder_user_ids))
    ) roster on true
    where g.id = any(v_game_ids) and g.time >= now()
  )
  select jsonb_build_array(
    jsonb_build_object(
      'key', 'new-users', 'label', 'New accounts',
      'value', (select count(*) from public.users where id = any(v_user_ids) and created_at >= v_from),
      'format', 'number', 'detail', 'COUNT(users) WHERE created_at >= range_start AND user_id != founder',
      'severity', 'healthy', 'quality', 'measured'
    ),
    jsonb_build_object(
      'key', 'games-created', 'label', 'Real games created',
      'value', (select count(*) from public.games where id = any(v_game_ids) and created_at >= v_from),
      'format', 'number', 'detail', 'COUNT(games) WHERE created_at >= range_start AND host_id != founder',
      'severity', case when (select count(*) from public.games where id = any(v_game_ids) and created_at >= v_from) > 0 then 'healthy' else 'attention' end,
      'quality', 'measured'
    ),
    jsonb_build_object(
      'key', 'player-commitments', 'label', 'Roster joins',
      'value', (
        select count(*)
        from public.game_players
        where game_id = any(v_game_ids)
          and joined_at >= v_from
          and not (user_id = any(v_founder_user_ids))
      ),
      'format', 'number', 'detail', 'COUNT(game_players) WHERE joined_at >= range_start AND founder users/games excluded',
      'severity', 'info', 'quality', 'measured'
    ),
    jsonb_build_object(
      'key', 'upcoming-fill-rate', 'label', 'Upcoming fill rate',
      'value', (select case when capacity > 0 then round(filled / capacity * 100, 1) else 0 end from fill_stats),
      'format', 'percent', 'detail', 'SUM(least(non_founder_roster_count, capacity)) / SUM(capacity) for non-founder games WHERE time >= now()',
      'severity', case
        when (select capacity > 0 and filled / capacity >= 0.65 from fill_stats) then 'healthy'
        when (select capacity > 0 from fill_stats) then 'attention'
        else 'critical'
      end,
      'quality', 'measured'
    )
  ) into v_metrics;

  with days as (
    select generate_series(v_from::date, current_date, interval '1 day')::date as day
  ),
  user_counts as (
    select created_at::date as day, count(*)::integer as count
    from public.users where id = any(v_user_ids) and created_at >= v_from group by 1
  ),
  game_counts as (
    select created_at::date as day, count(*)::integer as count
    from public.games where id = any(v_game_ids) and created_at >= v_from group by 1
  ),
  join_counts as (
    select joined_at::date as day, count(*)::integer as count
    from public.game_players
    where game_id = any(v_game_ids)
      and joined_at >= v_from
      and not (user_id = any(v_founder_user_ids))
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', to_char(d.day, 'YYYY-MM-DD'),
    'newUsers', coalesce(uc.count, 0),
    'gamesCreated', coalesce(gc.count, 0),
    'commitments', coalesce(jc.count, 0)
  ) order by d.day), '[]'::jsonb)
  into v_trend
  from days d
  left join user_counts uc on uc.day = d.day
  left join game_counts gc on gc.day = d.day
  left join join_counts jc on jc.day = d.day;

  select
    count(*) filter (where id = any(v_user_ids) and created_at >= v_from)::numeric,
    count(*) filter (where id = any(v_user_ids) and created_at >= v_from and accepted_terms is true)::numeric
  into v_accounts, v_accepted
  from public.users;

  select count(distinct host_id)::numeric into v_hosts
  from public.games
  where id = any(v_game_ids) and created_at >= v_from;

  select count(distinct user_id)::numeric into v_players
  from public.game_players
  where game_id = any(v_game_ids)
    and joined_at >= v_from
    and not (user_id = any(v_founder_user_ids));

  select
    count(*) filter (where event_name = 'relevant_game_impression')::numeric,
    count(*) filter (where event_name = 'game_viewed')::numeric,
    count(*) filter (where event_name = 'join_started')::numeric,
    count(*) filter (where event_name in ('request_approved', 'chat_opened_from_game'))::numeric,
    count(*)::numeric,
    count(*) filter (
      where event_name = 'location_permission'
        and coalesce(metadata ->> 'locationCaptured', 'false') = 'true'
        and (metadata ->> 'latitude') ~ '^-?[0-9]+(\.[0-9]+)?$'
        and (metadata ->> 'longitude') ~ '^-?[0-9]+(\.[0-9]+)?$'
    )::numeric
  into
    v_relevant_impressions,
    v_game_views,
    v_join_starts,
    v_reciprocal_responses,
    v_product_events,
    v_location_events
  from public.product_events pe
  where pe.created_at >= v_from
    and (pe.user_id is null or not (pe.user_id = any(v_founder_user_ids)))
    and coalesce(lower(pe.user_email), '') <> v_owner_email
    and (coalesce(p_park, 'all') = 'all' or pe.park_slug = p_park)
    and (coalesce(p_level, 'all') = 'all' or lower(coalesce(pe.metadata ->> 'level', '')) = lower(p_level))
    and (coalesce(p_game_type, 'all') = 'all' or lower(coalesce(pe.metadata ->> 'gameType', '')) = lower(p_game_type));

  select count(*)::numeric into v_completed_outcomes
  from public.game_outcomes go
  join public.games g on g.id = go.game_id
  where g.id = any(v_game_ids)
    and not (g.host_id = any(v_founder_user_ids))
    and (go.user_id is null or not (go.user_id = any(v_founder_user_ids)))
    and go.status = 'completed'
    and go.is_historical = false
    and go.confirmed_at >= v_from;

  select count(*)::numeric into v_previous_outcomes
  from public.game_outcomes go
  join public.games g on g.id = go.game_id
  where g.id = any(v_game_ids)
    and not (g.host_id = any(v_founder_user_ids))
    and (go.user_id is null or not (go.user_id = any(v_founder_user_ids)))
    and go.status = 'completed'
    and go.is_historical = false
    and go.confirmed_at >= v_from - make_interval(days => v_days)
    and go.confirmed_at < v_from;

  v_funnel := jsonb_build_array(
    jsonb_build_object('label', 'New accounts', 'count', v_accounts, 'rate', case when v_accounts > 0 then 100 else 0 end, 'quality', 'measured'),
    jsonb_build_object('label', 'Accepted terms', 'count', v_accepted, 'rate', case when v_accounts > 0 then round(v_accepted / v_accounts * 100, 1) else 0 end, 'quality', 'measured'),
    jsonb_build_object('label', 'Relevant game impression', 'count', v_relevant_impressions, 'rate', case when v_accepted > 0 then round(v_relevant_impressions / v_accepted * 100, 1) else 0 end, 'quality', 'measured'),
    jsonb_build_object('label', 'Game detail view', 'count', v_game_views, 'rate', case when v_relevant_impressions > 0 then round(v_game_views / v_relevant_impressions * 100, 1) else 0 end, 'quality', 'measured'),
    jsonb_build_object('label', 'Join started', 'count', v_join_starts, 'rate', case when v_game_views > 0 then round(v_join_starts / v_game_views * 100, 1) else 0 end, 'quality', 'measured'),
    jsonb_build_object('label', 'Hosted a real game', 'count', v_hosts, 'rate', case when v_accounts > 0 then round(v_hosts / v_accounts * 100, 1) else 0 end, 'quality', 'measured'),
    jsonb_build_object('label', 'Joined a roster', 'count', v_players, 'rate', case when greatest(v_join_starts, v_accounts) > 0 then round(v_players / greatest(v_join_starts, v_accounts) * 100, 1) else 0 end, 'quality', 'measured'),
    jsonb_build_object('label', 'Reciprocal response', 'count', v_reciprocal_responses, 'rate', case when v_players > 0 then round(v_reciprocal_responses / v_players * 100, 1) else 0 end, 'quality', 'measured'),
    jsonb_build_object('label', 'Verified game outcome', 'count', v_completed_outcomes, 'rate', case when v_players > 0 then round(v_completed_outcomes / v_players * 100, 1) else 0 end, 'quality', 'measured')
  );

  with game_park as (
    select
      g.id, g.time, g.game_capacity,
      park.id as park_id,
      roster.count as roster_count,
      roster.recent_players,
      requests.count as request_count
    from public.games g
    join lateral (
      select ap.id from public.analytics_parks ap
      where g.location_cords is not null
      order by st_distance(ap.location, g.location_cords) limit 1
    ) park on true
    left join lateral (
      select count(*)::integer as count,
             count(distinct user_id) filter (where joined_at >= v_from)::integer as recent_players
      from public.game_players gp
      where gp.game_id = g.id
        and not (gp.user_id = any(v_founder_user_ids))
    ) roster on true
    left join lateral (
      select count(*) filter (where created_at::timestamptz >= v_from)::integer as count
      from public.game_requests gr where gr.game_id = g.id
    ) requests on true
    where g.id = any(v_game_ids)
  ),
  park_stats as (
    select
      ap.id, ap.slug, ap.name, ap.launch_status,
      st_x(ap.location::geometry) as longitude,
      st_y(ap.location::geometry) as latitude,
      count(gp.id) filter (where gp.time >= now())::integer as upcoming_games,
      coalesce(sum(gp.recent_players), 0)::integer as active_players,
      coalesce(sum(gp.request_count), 0)::integer as pending_requests,
      coalesce(round(100.0 * sum(least(gp.roster_count, greatest(coalesce(gp.game_capacity, 2), 1))) filter (where gp.time >= now())
        / nullif(sum(greatest(coalesce(gp.game_capacity, 2), 1)) filter (where gp.time >= now()), 0), 1), 0) as fill_rate
    from public.analytics_parks ap
    left join game_park gp on gp.park_id = ap.id
    where coalesce(p_park, 'all') = 'all' or ap.slug = p_park
    group by ap.id, ap.slug, ap.name, ap.launch_status, ap.location
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'slug', slug, 'name', name,
    'longitude', longitude, 'latitude', latitude,
    'launchStatus', launch_status,
    'activePlayers', active_players,
    'upcomingGames', upcoming_games,
    'fillRate', fill_rate,
    'commitments', pending_requests,
    'status', case
      when upcoming_games >= 3 and active_players >= 3 then 'healthy'
      when upcoming_games > 0 or active_players > 0 then 'attention'
      else 'critical'
    end
  ) order by name), '[]'::jsonb)
  into v_parks from park_stats;

  with scoped_games as (
    select
      g.*,
      park.name as park_name,
      roster.count as roster_count,
      requests.count as request_count,
      verified.count as verified_count
    from public.games g
    left join lateral (
      select ap.name from public.analytics_parks ap
      where g.location_cords is not null
      order by st_distance(ap.location, g.location_cords) limit 1
    ) park on true
    left join lateral (
      select count(*)::integer as count
      from public.game_players gp
      where gp.game_id = g.id
        and not (gp.user_id = any(v_founder_user_ids))
    ) roster on true
    left join lateral (select count(*)::integer as count from public.game_requests gr where gr.game_id = g.id) requests on true
    left join lateral (
      select count(*)::integer as count
      from public.game_players gv
      where gv.game_id = g.id
        and gv.game_verified is true
        and not (gv.user_id = any(v_founder_user_ids))
    ) verified on true
    where g.id = any(v_game_ids) and (g.created_at >= v_from or g.time >= v_from)
    order by g.time desc nulls last limit 100
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'shortId', upper(left(id::text, 8)),
    'park', coalesce(park_name, 'Unmapped'),
    'scheduledAt', time,
    'createdAt', created_at,
    'type', coalesce(type, 'unspecified'),
    'level', coalesce(level, 'unspecified'),
    'capacity', greatest(coalesce(game_capacity, 2), 1),
    'roster', coalesce(roster_count, 0),
    'commitments', coalesce(request_count, 0),
    'status', case when time >= now() then 'Scheduled' when verified_count > 0 then 'Roster verified' else 'Past - outcome not tracked' end,
    'longitude', case when location_cords is not null then st_x(location_cords::geometry) else null end,
    'latitude', case when location_cords is not null then st_y(location_cords::geometry) else null end
  ) order by time desc nulls last), '[]'::jsonb)
  into v_games from scoped_games;

  with hours as (select generate_series(0, 23)::integer as hour),
  games_by_hour as (
    select extract(hour from created_at at time zone 'America/Toronto')::integer as hour, count(*)::integer as count
    from public.games where id = any(v_game_ids) and created_at >= v_from group by 1
  ),
  joins_by_hour as (
    select extract(hour from joined_at at time zone 'America/Toronto')::integer as hour, count(*)::integer as count
    from public.game_players
    where game_id = any(v_game_ids)
      and joined_at >= v_from
      and not (user_id = any(v_founder_user_ids))
    group by 1
  )
  select jsonb_agg(jsonb_build_object('hour', h.hour, 'games', coalesce(g.count, 0), 'joins', coalesce(j.count, 0)) order by h.hour)
  into v_hourly
  from hours h
  left join games_by_hour g on g.hour = h.hour
  left join joins_by_hour j on j.hour = h.hour;

  with raw_signals as (
    select ap.id, ap.name, ap.location, gp.user_id::text as signal_id, 'roster-commitments'::text as signal_type
    from public.analytics_parks ap
    join public.games g on g.id = any(v_game_ids) and g.location_cords is not null
      and ap.id = (select nearest.id from public.analytics_parks nearest order by st_distance(nearest.location, g.location_cords) limit 1)
    join public.game_players gp on gp.game_id = g.id and gp.joined_at >= v_from
    where not (gp.user_id = any(v_founder_user_ids))
      and (coalesce(p_park, 'all') = 'all' or ap.slug = p_park)
    union all
    select ap.id, ap.name, ap.location,
      coalesce(pe.user_id::text, pe.firebase_uid, pe.session_id, pe.id::text) as signal_id,
      'app-open-location'::text as signal_type
    from public.product_events pe
    join lateral (
      select st_setsrid(st_makepoint(raw.longitude::double precision, raw.latitude::double precision), 4326)::geography as location
      from (
        select pe.metadata ->> 'longitude' as longitude, pe.metadata ->> 'latitude' as latitude
      ) raw
      where raw.latitude ~ '^-?[0-9]+(\.[0-9]+)?$'
        and raw.longitude ~ '^-?[0-9]+(\.[0-9]+)?$'
    ) point on true
    join lateral (
      select ap.*
      from public.analytics_parks ap
      order by st_distance(ap.location, point.location)
      limit 1
    ) ap on true
    where pe.created_at >= v_from
      and pe.event_name = 'location_permission'
      and coalesce(pe.metadata ->> 'locationCaptured', 'false') = 'true'
      and (pe.metadata ->> 'latitude') ~ '^-?[0-9]+(\.[0-9]+)?$'
      and (pe.metadata ->> 'longitude') ~ '^-?[0-9]+(\.[0-9]+)?$'
      and (pe.user_id is null or not (pe.user_id = any(v_founder_user_ids)))
      and coalesce(lower(pe.user_email), '') <> v_owner_email
      and (coalesce(p_park, 'all') = 'all' or ap.slug = p_park)
  ),
  park_signals as (
    select id, name, location,
      count(distinct signal_id)::integer as user_count,
      bool_or(signal_type = 'app-open-location') as has_location
    from raw_signals
    group by id, name, location
  )
  select
    jsonb_build_object(
      'type', 'FeatureCollection',
      'features', coalesce(jsonb_agg(jsonb_build_object(
        'type', 'Feature',
        'geometry', jsonb_build_object('type', 'Point', 'coordinates', jsonb_build_array(st_x(location::geometry), st_y(location::geometry))),
        'properties', jsonb_build_object(
          'park', name,
          'count', user_count,
          'signalType', case when has_location then 'app-open-location' else 'roster-commitments' end
        )
      )) filter (where user_count >= 3), '[]'::jsonb)
    ),
    count(*) filter (where user_count > 0 and user_count < 3)::integer
  into v_map_activity, v_suppressed_cells
  from park_signals;

  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(jsonb_build_object(
      'type', 'Feature',
      'geometry', jsonb_build_object('type', 'Point', 'coordinates', jsonb_build_array(st_x(ap.location::geometry), st_y(ap.location::geometry))),
      'properties', jsonb_build_object(
        'id', ap.id, 'slug', ap.slug, 'name', ap.name,
        'upcomingGames', coalesce(stats.upcoming_games, 0),
        'activePlayers', coalesce(stats.active_players, 0),
        'status', case when coalesce(stats.upcoming_games, 0) >= 3 and coalesce(stats.active_players, 0) >= 3 then 'healthy' when coalesce(stats.upcoming_games, 0) > 0 or coalesce(stats.active_players, 0) > 0 then 'attention' else 'critical' end
      )
    ) order by ap.name), '[]'::jsonb)
  ) into v_map_parks
  from public.analytics_parks ap
  left join lateral (
    select count(distinct g.id) filter (where g.time >= now())::integer as upcoming_games,
           count(distinct gp.user_id) filter (where gp.joined_at >= v_from and not (gp.user_id = any(v_founder_user_ids)))::integer as active_players
    from public.games g
    left join public.game_players gp on gp.game_id = g.id
    where g.id = any(v_game_ids) and g.location_cords is not null
      and ap.id = (select nearest.id from public.analytics_parks nearest order by st_distance(nearest.location, g.location_cords) limit 1)
  ) stats on true
  where coalesce(p_park, 'all') = 'all' or ap.slug = p_park;

  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(jsonb_build_object(
      'type', 'Feature',
      'geometry', jsonb_build_object('type', 'Point', 'coordinates', jsonb_build_array(st_x(g.location_cords::geometry), st_y(g.location_cords::geometry))),
      'properties', jsonb_build_object(
        'id', g.id, 'shortId', upper(left(g.id::text, 8)),
        'remaining', greatest(coalesce(g.game_capacity, 2) - roster.count, 0),
        'scheduledAt', g.time
      )
    )), '[]'::jsonb)
  ) into v_map_games
  from public.games g
  left join lateral (
    select count(*)::integer as count
    from public.game_players gp
    where gp.game_id = g.id
      and not (gp.user_id = any(v_founder_user_ids))
  ) roster on true
  where g.id = any(v_game_ids) and g.location_cords is not null and g.time >= now();

  select coalesce(jsonb_agg(item), '[]'::jsonb) into v_remaining_quality
  from jsonb_array_elements(coalesce(v_base -> 'dataQuality', '[]'::jsonb)) as item
  where item ->> 'key' not in ('product-events', 'game-outcomes', 'location-consent', 'founder-seeded-games');

  v_quality := jsonb_build_array(
    jsonb_build_object(
      'key', 'product-events',
      'title', 'Mobile product event stream is live',
      'detail', 'Supabase-authenticated mobile app events and owner web events write to product_events; founder account activity is excluded from real marketplace signal.',
      'count', v_product_events,
      'severity', case when v_product_events > 0 then 'healthy' else 'attention' end
    ),
    jsonb_build_object(
      'key', 'game-outcomes',
      'title', case when v_completed_outcomes > 0 then 'Verified real game outcomes are measured' else 'No confirmed real game outcomes in this window' end,
      'detail', case
        when v_completed_outcomes > 0 then 'Confirmed game_outcomes rows power the north star after excluding founder-hosted seed games.'
        else 'The game_outcomes table exists, but this scope has no confirmed non-founder completion rows yet. Do not infer completed play from scheduled founder games.'
      end,
      'count', v_completed_outcomes,
      'severity', case when v_completed_outcomes > 0 then 'healthy' else 'attention' end
    ),
    jsonb_build_object(
      'key', 'location-consent',
      'title', case when v_location_events > 0 then 'Consented app-open location is streaming' else 'No consented app-open locations yet' end,
      'detail', 'The mobile app records rounded foreground coordinates only after location permission is granted. Map cells stay suppressed until at least three users produce signals near a park.',
      'count', v_location_events,
      'severity', case when v_location_events > 0 then 'healthy' else 'attention' end
    ),
    jsonb_build_object(
      'key', 'founder-seeded-games',
      'title', 'Founder-hosted seed games are excluded',
      'detail', 'Games hosted by the owner/admin account are kept in Supabase but removed from mission, funnel, map, park, roster, and games-monitor counts.',
      'count', v_founder_games_excluded,
      'severity', 'info'
    )
  ) || v_remaining_quality;

  v_patched_coverage := coalesce(v_base -> 'coverage', '{}'::jsonb) || jsonb_build_object(
    'productEvents', v_product_events > 0,
    'verifiedOutcomes', true,
    'consentedLocation', v_location_events > 0,
    'activeNowReliable', v_product_events > 0,
    'founderGamesExcluded', true
  );

  v_base := jsonb_set(v_base, '{version}', to_jsonb('1.2 mobile-truth'::text), true);
  v_base := jsonb_set(v_base, '{coverage}', v_patched_coverage, true);
  v_base := jsonb_set(v_base, '{metrics}', v_metrics, true);
  v_base := jsonb_set(v_base, '{trend}', v_trend, true);
  v_base := jsonb_set(v_base, '{funnel}', v_funnel, true);
  v_base := jsonb_set(v_base, '{parks}', v_parks, true);
  v_base := jsonb_set(v_base, '{games}', v_games, true);
  v_base := jsonb_set(v_base, '{hourlyActivity}', v_hourly, true);
  v_base := jsonb_set(v_base, '{dataQuality}', v_quality, true);
  v_base := jsonb_set(v_base, '{map}', jsonb_build_object(
    'parks', v_map_parks,
    'games', v_map_games,
    'activityCells', coalesce(v_map_activity, jsonb_build_object('type', 'FeatureCollection', 'features', '[]'::jsonb)),
    'suppressedCells', v_suppressed_cells
  ), true);
  v_base := jsonb_set(
    v_base,
    '{missionMetric}',
    jsonb_build_object(
      'key', 'completed-player-game-participations',
      'label', 'Completed real game participations',
      'value', v_completed_outcomes,
      'displayValue', v_completed_outcomes::integer::text,
      'quality', 'measured',
      'detail', case
        when v_completed_outcomes > 0 then 'Confirmed non-founder completion rows are present and powering the north star.'
        else 'No confirmed non-founder player-game participations were recorded in this filter window.'
      end,
      'formula', 'COUNT(game_outcomes) WHERE status = completed AND is_historical = false AND confirmed_at >= range_start AND games.host_id != founder',
      'comparison', case
        when v_previous_outcomes > 0 then concat(
          case when v_completed_outcomes - v_previous_outcomes >= 0 then '+' else '' end,
          round((v_completed_outcomes - v_previous_outcomes) / v_previous_outcomes * 100, 1)::text,
          '% vs previous period'
        )
        else 'No prior-period baseline yet'
      end,
      'target', 'Pilot gate: 8 completed real games/week at the active park',
      'forecast', 'Forecast waits for at least two clean measured periods.',
      'supportingMetrics', jsonb_build_array(
        concat('Completed real participations: ', v_completed_outcomes::integer),
        concat('Previous period: ', v_previous_outcomes::integer),
        concat('Founder seed games excluded: ', v_founder_games_excluded),
        'coverage.verifiedOutcomes = true',
        'coverage.productEvents = true'
      ),
      'actionAnchor', case when v_completed_outcomes > 0 then 'retention-intelligence' else 'games-monitor' end
    ),
    true
  );

  return v_base;
end;
$_$;


ALTER FUNCTION "public"."get_analytics_dashboard_firebase_v1"("p_range_days" integer, "p_park" "text", "p_level" "text", "p_game_type" "text", "p_segment" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_analytics_dashboard_v1"("p_range_days" integer DEFAULT 7, "p_park" "text" DEFAULT 'all'::"text", "p_level" "text" DEFAULT 'all'::"text", "p_game_type" "text" DEFAULT 'all'::"text", "p_segment" "text" DEFAULT 'all'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'extensions'
    AS $$
declare
  v_admin_id uuid := auth.uid();
  v_role text;
  v_aal text := coalesce(auth.jwt() ->> 'aal', 'aal1');
  v_days integer := least(greatest(coalesce(p_range_days, 7), 1), 90);
  v_from timestamptz;
  v_user_ids uuid[] := array[]::uuid[];
  v_game_ids uuid[] := array[]::uuid[];
  v_metrics jsonb;
  v_trend jsonb;
  v_funnel jsonb;
  v_parks jsonb;
  v_games jsonb;
  v_hourly jsonb;
  v_quality jsonb;
  v_map_parks jsonb;
  v_map_games jsonb;
  v_map_activity jsonb;
  v_suppressed_cells integer := 0;
  v_no_rls integer := 0;
  v_roster_mismatches integer := 0;
  v_missing_coordinates integer := 0;
  v_stale_activity integer := 0;
begin
  if v_admin_id is null then
    raise exception using errcode = '42501', message = 'Analytics authentication is required.';
  end if;

  select role into v_role
  from public.admin_users
  where user_id = v_admin_id and active = true;

  if v_role is null then
    raise exception using errcode = '42501', message = 'This account is not authorized for analytics.';
  end if;

  if v_aal <> 'aal2' then
    raise exception using errcode = '42501', message = 'Multi-factor verification is required.';
  end if;

  v_from := now() - make_interval(days => v_days);

  insert into public.admin_audit_log (admin_user_id, action, metadata)
  values (v_admin_id, 'analytics.dashboard.view', jsonb_build_object(
    'rangeDays', v_days,
    'park', coalesce(p_park, 'all'),
    'level', coalesce(p_level, 'all'),
    'gameType', coalesce(p_game_type, 'all'),
    'segment', coalesce(p_segment, 'all')
  ));

  select coalesce(array_agg(u.id), array[]::uuid[]) into v_user_ids
  from public.users u
  where (coalesce(p_level, 'all') = 'all' or lower(coalesce(u.level, '')) = lower(p_level))
    and (
      coalesce(p_segment, 'all') = 'all'
      or (p_segment = 'accepted-terms' and u.accepted_terms is true)
      or (p_segment = 'new-users' and u.created_at >= v_from)
      or (p_segment = 'game-hosts' and exists (select 1 from public.games gh where gh.host_id = u.id))
      or (p_segment = 'game-players' and exists (select 1 from public.game_players gpp where gpp.user_id = u.id))
    );

  select coalesce(array_agg(g.id), array[]::uuid[]) into v_game_ids
  from public.games g
  left join lateral (
    select ap.slug
    from public.analytics_parks ap
    where g.location_cords is not null
    order by st_distance(ap.location, g.location_cords)
    limit 1
  ) park on true
  where (coalesce(p_park, 'all') = 'all' or park.slug = p_park)
    and (coalesce(p_level, 'all') = 'all' or lower(coalesce(g.level, '')) = lower(p_level))
    and (coalesce(p_game_type, 'all') = 'all' or lower(coalesce(g.type, '')) = lower(p_game_type))
    and (
      coalesce(p_segment, 'all') = 'all'
      or g.host_id = any(v_user_ids)
      or exists (select 1 from public.game_players sgp where sgp.game_id = g.id and sgp.user_id = any(v_user_ids))
    );

  with fill_stats as (
    select
      coalesce(sum(least(roster.count, greatest(coalesce(g.game_capacity, 2), 1))), 0)::numeric as filled,
      coalesce(sum(greatest(coalesce(g.game_capacity, 2), 1)), 0)::numeric as capacity
    from public.games g
    left join lateral (
      select count(*)::integer as count from public.game_players gp where gp.game_id = g.id
    ) roster on true
    where g.id = any(v_game_ids) and g.time >= now()
  )
  select jsonb_build_array(
    jsonb_build_object(
      'key', 'new-users', 'label', 'New accounts',
      'value', (select count(*) from public.users where id = any(v_user_ids) and created_at >= v_from),
      'format', 'number', 'detail', format('Created in the last %s days', v_days), 'severity', 'healthy'
    ),
    jsonb_build_object(
      'key', 'games-created', 'label', 'Games created',
      'value', (select count(*) from public.games where id = any(v_game_ids) and created_at >= v_from),
      'format', 'number', 'detail', 'Measured game records in the selected window',
      'severity', case when (select count(*) from public.games where id = any(v_game_ids) and created_at >= v_from) > 0 then 'healthy' else 'attention' end
    ),
    jsonb_build_object(
      'key', 'player-commitments', 'label', 'Roster commitments',
      'value', (select count(*) from public.game_players where game_id = any(v_game_ids) and joined_at >= v_from),
      'format', 'number', 'detail', 'Roster joins, including hosts', 'severity', 'info'
    ),
    jsonb_build_object(
      'key', 'upcoming-fill-rate', 'label', 'Upcoming fill rate',
      'value', (select case when capacity > 0 then round(filled / capacity * 100, 1) else 0 end from fill_stats),
      'format', 'percent', 'detail', 'Actual roster rows divided by available capacity',
      'severity', case
        when (select capacity > 0 and filled / capacity >= 0.65 from fill_stats) then 'healthy'
        when (select capacity > 0 from fill_stats) then 'attention'
        else 'critical'
      end
    )
  ) into v_metrics;

  with days as (
    select generate_series(v_from::date, current_date, interval '1 day')::date as day
  ),
  user_counts as (
    select created_at::date as day, count(*)::integer as count
    from public.users where id = any(v_user_ids) and created_at >= v_from group by 1
  ),
  game_counts as (
    select created_at::date as day, count(*)::integer as count
    from public.games where id = any(v_game_ids) and created_at >= v_from group by 1
  ),
  join_counts as (
    select joined_at::date as day, count(*)::integer as count
    from public.game_players where game_id = any(v_game_ids) and joined_at >= v_from group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', to_char(d.day, 'YYYY-MM-DD'),
    'newUsers', coalesce(uc.count, 0),
    'gamesCreated', coalesce(gc.count, 0),
    'commitments', coalesce(jc.count, 0)
  ) order by d.day), '[]'::jsonb)
  into v_trend
  from days d
  left join user_counts uc on uc.day = d.day
  left join game_counts gc on gc.day = d.day
  left join join_counts jc on jc.day = d.day;

  with totals as (
    select
      (select count(*) from public.users where id = any(v_user_ids) and created_at >= v_from)::numeric as accounts,
      (select count(*) from public.users where id = any(v_user_ids) and created_at >= v_from and accepted_terms is true)::numeric as accepted,
      (select count(distinct host_id) from public.games where id = any(v_game_ids) and created_at >= v_from)::numeric as hosts,
      (select count(distinct user_id) from public.game_players where game_id = any(v_game_ids) and joined_at >= v_from)::numeric as players
  )
  select jsonb_build_array(
    jsonb_build_object('label', 'New accounts', 'count', accounts, 'rate', case when accounts > 0 then 100 else 0 end, 'quality', 'measured'),
    jsonb_build_object('label', 'Accepted terms', 'count', accepted, 'rate', case when accounts > 0 then round(accepted / accounts * 100, 1) else 0 end, 'quality', 'measured'),
    jsonb_build_object('label', 'Hosted a game', 'count', hosts, 'rate', case when accounts > 0 then round(hosts / accounts * 100, 1) else 0 end, 'quality', 'measured'),
    jsonb_build_object('label', 'Joined a roster', 'count', players, 'rate', case when accounts > 0 then round(players / accounts * 100, 1) else 0 end, 'quality', 'measured'),
    jsonb_build_object('label', 'Verified game outcome', 'count', 0, 'rate', 0, 'quality', 'unavailable')
  ) into v_funnel from totals;

  with game_park as (
    select
      g.id, g.time, g.game_capacity,
      park.id as park_id,
      roster.count as roster_count,
      roster.recent_players,
      requests.count as request_count
    from public.games g
    join lateral (
      select ap.id from public.analytics_parks ap
      where g.location_cords is not null
      order by st_distance(ap.location, g.location_cords) limit 1
    ) park on true
    left join lateral (
      select count(*)::integer as count,
             count(distinct user_id) filter (where joined_at >= v_from)::integer as recent_players
      from public.game_players gp where gp.game_id = g.id
    ) roster on true
    left join lateral (
      select count(*) filter (where created_at::timestamptz >= v_from)::integer as count
      from public.game_requests gr where gr.game_id = g.id
    ) requests on true
    where g.id = any(v_game_ids)
  ),
  park_stats as (
    select
      ap.id, ap.slug, ap.name, ap.launch_status,
      st_x(ap.location::geometry) as longitude,
      st_y(ap.location::geometry) as latitude,
      count(gp.id) filter (where gp.time >= now())::integer as upcoming_games,
      coalesce(sum(gp.recent_players), 0)::integer as active_players,
      coalesce(sum(gp.request_count), 0)::integer as commitments,
      coalesce(round(100.0 * sum(least(gp.roster_count, greatest(coalesce(gp.game_capacity, 2), 1))) filter (where gp.time >= now())
        / nullif(sum(greatest(coalesce(gp.game_capacity, 2), 1)) filter (where gp.time >= now()), 0), 1), 0) as fill_rate
    from public.analytics_parks ap
    left join game_park gp on gp.park_id = ap.id
    where coalesce(p_park, 'all') = 'all' or ap.slug = p_park
    group by ap.id, ap.slug, ap.name, ap.launch_status, ap.location
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'slug', slug, 'name', name,
    'longitude', longitude, 'latitude', latitude,
    'launchStatus', launch_status,
    'activePlayers', active_players,
    'upcomingGames', upcoming_games,
    'fillRate', fill_rate,
    'commitments', commitments,
    'status', case
      when upcoming_games >= 3 and active_players >= 3 then 'healthy'
      when upcoming_games > 0 or active_players > 0 then 'attention'
      else 'critical'
    end
  ) order by name), '[]'::jsonb)
  into v_parks from park_stats;

  with scoped_games as (
    select
      g.*,
      park.name as park_name,
      roster.count as roster_count,
      requests.count as request_count,
      verified.count as verified_count
    from public.games g
    left join lateral (
      select ap.name from public.analytics_parks ap
      where g.location_cords is not null
      order by st_distance(ap.location, g.location_cords) limit 1
    ) park on true
    left join lateral (select count(*)::integer as count from public.game_players gp where gp.game_id = g.id) roster on true
    left join lateral (select count(*)::integer as count from public.game_requests gr where gr.game_id = g.id) requests on true
    left join lateral (select count(*)::integer as count from public.game_players gv where gv.game_id = g.id and gv.game_verified is true) verified on true
    where g.id = any(v_game_ids) and (g.created_at >= v_from or g.time >= v_from)
    order by g.time desc nulls last limit 100
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'shortId', upper(left(id::text, 8)),
    'park', coalesce(park_name, 'Unmapped'),
    'scheduledAt', time,
    'createdAt', created_at,
    'type', coalesce(type, 'unspecified'),
    'level', coalesce(level, 'unspecified'),
    'capacity', greatest(coalesce(game_capacity, 2), 1),
    'roster', coalesce(roster_count, 0),
    'commitments', coalesce(request_count, 0),
    'status', case when time >= now() then 'Scheduled' when verified_count > 0 then 'Roster verified' else 'Past - outcome not tracked' end,
    'longitude', case when location_cords is not null then st_x(location_cords::geometry) else null end,
    'latitude', case when location_cords is not null then st_y(location_cords::geometry) else null end
  ) order by time desc nulls last), '[]'::jsonb)
  into v_games from scoped_games;

  with hours as (select generate_series(0, 23)::integer as hour),
  games_by_hour as (
    select extract(hour from created_at at time zone 'America/Toronto')::integer as hour, count(*)::integer as count
    from public.games where id = any(v_game_ids) and created_at >= v_from group by 1
  ),
  joins_by_hour as (
    select extract(hour from joined_at at time zone 'America/Toronto')::integer as hour, count(*)::integer as count
    from public.game_players where game_id = any(v_game_ids) and joined_at >= v_from group by 1
  )
  select jsonb_agg(jsonb_build_object('hour', h.hour, 'games', coalesce(g.count, 0), 'joins', coalesce(j.count, 0)) order by h.hour)
  into v_hourly
  from hours h
  left join games_by_hour g on g.hour = h.hour
  left join joins_by_hour j on j.hour = h.hour;

  with park_signals as (
    select ap.id, ap.name, ap.location, count(distinct gp.user_id)::integer as user_count
    from public.analytics_parks ap
    join public.games g on g.id = any(v_game_ids) and g.location_cords is not null
      and ap.id = (select nearest.id from public.analytics_parks nearest order by st_distance(nearest.location, g.location_cords) limit 1)
    join public.game_players gp on gp.game_id = g.id and gp.joined_at >= v_from
    where coalesce(p_park, 'all') = 'all' or ap.slug = p_park
    group by ap.id, ap.name, ap.location
  )
  select
    jsonb_build_object(
      'type', 'FeatureCollection',
      'features', coalesce(jsonb_agg(jsonb_build_object(
        'type', 'Feature',
        'geometry', jsonb_build_object('type', 'Point', 'coordinates', jsonb_build_array(st_x(location::geometry), st_y(location::geometry))),
        'properties', jsonb_build_object('park', name, 'count', user_count, 'signalType', 'roster-commitments')
      )) filter (where user_count >= 3), '[]'::jsonb)
    ),
    count(*) filter (where user_count > 0 and user_count < 3)::integer
  into v_map_activity, v_suppressed_cells
  from park_signals;

  select count(*)::integer into v_no_rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('users', 'games', 'game_players', 'game_requests')
    and c.relrowsecurity is false;

  select count(*)::integer into v_roster_mismatches
  from public.games g
  where coalesce(g.players_enrolled, 0) <> (select count(*) from public.game_players gp where gp.game_id = g.id);

  select count(*)::integer into v_missing_coordinates from public.games where location_cords is null;
  select count(*)::integer into v_stale_activity from public.users where last_active_at is null or last_active_at < now() - interval '30 days';

  v_quality := jsonb_build_array(
    jsonb_build_object('key', 'product-events', 'title', 'Browsing activity is not instrumented', 'detail', 'No consented product_events stream exists, so scrolling and active-now metrics are intentionally unavailable.', 'count', null, 'severity', 'attention'),
    jsonb_build_object('key', 'game-outcomes', 'title', 'Verified game outcomes are not modeled', 'detail', 'Past scheduled games are not counted as completed without a dedicated outcome event.', 'count', null, 'severity', 'critical'),
    jsonb_build_object('key', 'location-consent', 'title', 'Live user location is disabled', 'detail', 'The map shows public game locations and groups roster signals only when at least three users are present.', 'count', v_suppressed_cells, 'severity', 'info'),
    jsonb_build_object('key', 'core-rls', 'title', 'Core table RLS requires a separate security pass', 'detail', 'The analytics RPC is owner-restricted, but existing mobile tables should be audited before changing their policies.', 'count', v_no_rls, 'severity', case when v_no_rls > 0 then 'critical' else 'healthy' end),
    jsonb_build_object('key', 'roster-counter', 'title', 'Stored roster counters disagree with roster rows', 'detail', 'Dashboard fill metrics use actual game_players rows instead of the denormalized players_enrolled value.', 'count', v_roster_mismatches, 'severity', case when v_roster_mismatches > 0 then 'attention' else 'healthy' end),
    jsonb_build_object('key', 'coordinates', 'title', 'Games missing coordinates', 'detail', 'Unmapped games remain in the table but cannot appear on the sector map.', 'count', v_missing_coordinates, 'severity', case when v_missing_coordinates > 0 then 'attention' else 'healthy' end),
    jsonb_build_object('key', 'last-active', 'title', 'Last-active signal is incomplete', 'detail', 'The current last_active_at field is not treated as a reliable active-now source.', 'count', v_stale_activity, 'severity', 'attention')
  );

  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(jsonb_build_object(
      'type', 'Feature',
      'geometry', jsonb_build_object('type', 'Point', 'coordinates', jsonb_build_array(st_x(ap.location::geometry), st_y(ap.location::geometry))),
      'properties', jsonb_build_object(
        'id', ap.id, 'slug', ap.slug, 'name', ap.name,
        'upcomingGames', coalesce(stats.upcoming_games, 0),
        'activePlayers', coalesce(stats.active_players, 0),
        'status', case when coalesce(stats.upcoming_games, 0) >= 3 and coalesce(stats.active_players, 0) >= 3 then 'healthy' when coalesce(stats.upcoming_games, 0) > 0 or coalesce(stats.active_players, 0) > 0 then 'attention' else 'critical' end
      )
    ) order by ap.name), '[]'::jsonb)
  ) into v_map_parks
  from public.analytics_parks ap
  left join lateral (
    select count(distinct g.id) filter (where g.time >= now())::integer as upcoming_games,
           count(distinct gp.user_id) filter (where gp.joined_at >= v_from)::integer as active_players
    from public.games g
    left join public.game_players gp on gp.game_id = g.id
    where g.id = any(v_game_ids) and g.location_cords is not null
      and ap.id = (select nearest.id from public.analytics_parks nearest order by st_distance(nearest.location, g.location_cords) limit 1)
  ) stats on true
  where coalesce(p_park, 'all') = 'all' or ap.slug = p_park;

  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(jsonb_build_object(
      'type', 'Feature',
      'geometry', jsonb_build_object('type', 'Point', 'coordinates', jsonb_build_array(st_x(g.location_cords::geometry), st_y(g.location_cords::geometry))),
      'properties', jsonb_build_object(
        'id', g.id, 'shortId', upper(left(g.id::text, 8)),
        'remaining', greatest(coalesce(g.game_capacity, 2) - roster.count, 0),
        'scheduledAt', g.time
      )
    )), '[]'::jsonb)
  ) into v_map_games
  from public.games g
  left join lateral (select count(*)::integer as count from public.game_players gp where gp.game_id = g.id) roster on true
  where g.id = any(v_game_ids) and g.location_cords is not null and g.time >= now();

  return jsonb_build_object(
    'version', '1.0',
    'generatedAt', now(),
    'timezone', 'America/Toronto',
    'admin', jsonb_build_object('role', v_role, 'aal', v_aal),
    'filters', jsonb_build_object('rangeDays', v_days, 'park', coalesce(p_park, 'all'), 'level', coalesce(p_level, 'all'), 'gameType', coalesce(p_game_type, 'all'), 'segment', coalesce(p_segment, 'all')),
    'metrics', v_metrics,
    'trend', v_trend,
    'funnel', v_funnel,
    'parks', v_parks,
    'games', v_games,
    'hourlyActivity', v_hourly,
    'dataQuality', v_quality,
    'map', jsonb_build_object(
      'parks', v_map_parks,
      'games', v_map_games,
      'activityCells', coalesce(v_map_activity, jsonb_build_object('type', 'FeatureCollection', 'features', '[]'::jsonb)),
      'suppressedCells', v_suppressed_cells
    ),
    'coverage', jsonb_build_object('productEvents', false, 'verifiedOutcomes', false, 'consentedLocation', false, 'activeNowReliable', false)
  );
end;
$$;


ALTER FUNCTION "public"."get_analytics_dashboard_v1"("p_range_days" integer, "p_park" "text", "p_level" "text", "p_game_type" "text", "p_segment" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_notification_preferences_v1"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_row public.notification_preferences%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  v_row := public.ensure_notification_preferences_row(v_user_id);

  return jsonb_build_object(
    'user_id', v_row.user_id,
    'chat_messages', v_row.chat_messages,
    'message_previews', v_row.message_previews,
    'game_reminders', v_row.game_reminders,
    'host_updates', v_row.host_updates,
    'nearby_games', v_row.nearby_games,
    'favourite_park_games', v_row.favourite_park_games,
    'marketing_updates', v_row.marketing_updates,
    'radius_meters', v_row.radius_meters,
    'quiet_hours_enabled', v_row.quiet_hours_enabled,
    'quiet_start', v_row.quiet_start,
    'quiet_end', v_row.quiet_end,
    'timezone', v_row.timezone,
    'primer_state', v_row.primer_state,
    'primer_last_shown_at', v_row.primer_last_shown_at,
    'primer_snooze_until', v_row.primer_snooze_until,
    'updated_at', v_row.updated_at
  );
end;
$$;


ALTER FUNCTION "public"."get_notification_preferences_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_games"() RETURNS TABLE("public_id" "text", "title" "text", "description" "text", "type" "text", "approximate_location_name" "text", "game_time" timestamp with time zone, "level" "text", "game_capacity" smallint, "is_booked" boolean, "payment_amount" integer, "image" "text", "court_type" "text", "is_paid" boolean, "players_enrolled" integer, "host_id" "uuid", "host_name" "text", "host_profile_picture" "text", "status" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."get_public_games"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."growth_public_links_enabled"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(
    (
      select enabled
      from public.growth_flags
      where key = 'growth_public_links'
    ),
    true
  );
$$;


ALTER FUNCTION "public"."growth_public_links_enabled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_blocked_relationship"("p_left_user_id" "uuid", "p_right_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(p_left_user_id is not null and p_right_user_id is not null and exists (
    select 1
    from public.blocked_users bu
    where (bu.blocker_id = p_left_user_id and bu.blocked_id = p_right_user_id)
       or (bu.blocker_id = p_right_user_id and bu.blocked_id = p_left_user_id)
  ), false);
$$;


ALTER FUNCTION "public"."has_blocked_relationship"("p_left_user_id" "uuid", "p_right_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."host_first_name"("p_name" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select nullif(
    split_part(btrim(coalesce(p_name, '')), ' ', 1),
    ''
  );
$$;


ALTER FUNCTION "public"."host_first_name"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_players"("game_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  update games
  set players_enrolled = coalesce(players_enrolled, 0) + 1
  where id = game_id;
end;
$$;


ALTER FUNCTION "public"."increment_players"("game_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_confirmed_participant"("p_game_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(p_user_id is not null and exists (
    select 1
    from public.game_players gp
    where gp.game_id = p_game_id
      and gp.user_id = p_user_id
  ), false);
$$;


ALTER FUNCTION "public"."is_confirmed_participant"("p_game_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_conversation_member"("p_chat_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(p_user_id is not null and exists (
    select 1
    from public.conversation_members cm
    where cm.chat_id = p_chat_id
      and cm.id = p_user_id
  ), false);
$$;


ALTER FUNCTION "public"."is_conversation_member"("p_chat_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_game_host"("p_game_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(p_user_id is not null and exists (
    select 1
    from public.games g
    where g.id = p_game_id
      and g.host_id = p_user_id
  ), false);
$$;


ALTER FUNCTION "public"."is_game_host"("p_game_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_public_game_visible"("p_game_id" "uuid", "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."is_public_game_visible"("p_game_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_game_v1"("public_id" "text", "idempotency_key" "uuid", "share_code" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."join_game_v1"("public_id" "text", "idempotency_key" "uuid", "share_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_public_game"("p_game_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."join_public_game"("p_game_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."leave_game_v1"("public_id" "text", "idempotency_key" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."leave_game_v1"("public_id" "text", "idempotency_key" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_game_resolution"("p_event_name" "text", "p_public_id" "text", "p_state" "text", "p_latency_ms" integer, "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_extra" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  perform public.emit_product_event_v1(
    p_event_name,
    p_user_id,
    null,
    p_public_id,
    null,
    null,
    null,
    'production',
    'server',
    jsonb_strip_nulls(
      jsonb_build_object(
        'state', p_state,
        'latency_ms', p_latency_ms,
        'public_id', p_public_id,
        'resolution_state', p_state
      ) || coalesce(p_extra, '{}'::jsonb)
    ),
    null
  );
exception
  when others then
    null;
end;
$$;


ALTER FUNCTION "public"."log_game_resolution"("p_event_name" "text", "p_public_id" "text", "p_state" "text", "p_latency_ms" integer, "p_user_id" "uuid", "p_extra" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."maybe_emit_shared_game_join_completed_v1"("p_user_id" "uuid", "p_game_id" "uuid", "p_public_id" "text", "p_extra" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_attr public.acquisition_attribution_events%rowtype;
  v_link_game uuid;
begin
  if p_user_id is null or p_game_id is null then
    return;
  end if;

  select a.* into v_attr
  from public.acquisition_attribution_events a
  where a.user_id = p_user_id
    and a.link_id is not null
    and a.occurred_at > now() - interval '30 days'
  order by a.occurred_at desc
  limit 1;

  if not found then
    select a.* into v_attr
    from public.acquisition_attribution_events a
    inner join public.analytics_identity_links ail
      on ail.anonymous_id = a.anonymous_id
    where ail.user_id = p_user_id
      and a.link_id is not null
      and a.occurred_at > now() - interval '30 days'
    order by a.occurred_at desc
    limit 1;
  end if;

  if not found then
    return;
  end if;

  select gsl.game_id into v_link_game
  from public.game_share_links gsl
  where gsl.id = v_attr.link_id;

  if v_link_game is distinct from p_game_id then
    return;
  end if;

  -- Join after start / terminal status is outside the reporting window.
  if exists (
    select 1
    from public.games g
    where g.id = p_game_id
      and (
        g.status in ('completed', 'cancelled')
        or (g.time is not null and g.time <= now())
      )
  ) then
    return;
  end if;

  perform public.emit_product_event_v1(
    'shared_game_join_completed',
    p_user_id,
    v_attr.anonymous_id,
    p_public_id,
    p_game_id,
    v_attr.link_id,
    null,
    'production',
    'server',
    jsonb_strip_nulls(
      jsonb_build_object(
        'join_mode', coalesce(p_extra->>'join_mode', 'explicit'),
        'spots_before', p_extra->'players_enrolled',
        'game_public_id', p_public_id
      )
    ),
    null
  );
exception
  when others then
    null;
end;
$$;


ALTER FUNCTION "public"."maybe_emit_shared_game_join_completed_v1"("p_user_id" "uuid", "p_game_id" "uuid", "p_public_id" "text", "p_extra" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mutation_result"("p_code" "text", "p_resource_id" "uuid" DEFAULT NULL::"uuid", "p_public_id" "text" DEFAULT NULL::"text", "p_chat_id" "uuid" DEFAULT NULL::"uuid", "p_players_enrolled" integer DEFAULT NULL::integer, "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."mutation_result"("p_code" "text", "p_resource_id" "uuid", "p_public_id" "text", "p_chat_id" "uuid", "p_players_enrolled" integer, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_push_permission_status"("p_status" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case
    when lower(coalesce(trim(p_status), '')) in ('granted', 'denied', 'provisional', 'undetermined')
      then lower(trim(p_status))
    else 'unknown'
  end;
$$;


ALTER FUNCTION "public"."normalize_push_permission_status"("p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."public_game_projection"("p_game" "public"."games") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_host_name text;
  v_count integer;
  v_time timestamptz := p_game."time";
begin
  select u.name into v_host_name
  from public.users u
  where u.id = p_game.host_id;

  select count(*)::integer
  into v_count
  from public.game_players gp
  where gp.game_id = p_game.id;

  return jsonb_strip_nulls(
    jsonb_build_object(
      'title', p_game.title,
      'sport', 'tennis',
      'local_date', case when v_time is null then null else to_char(v_time at time zone 'America/Toronto', 'YYYY-MM-DD') end,
      'local_time', case when v_time is null then null else to_char(v_time at time zone 'America/Toronto', 'HH24:MI') end,
      'timezone', 'America/Toronto',
      'park_name', nullif(btrim(coalesce(p_game.location_name, '')), ''),
      'approximate_area', public.approximate_area_label(p_game.location_name),
      'skill_display', coalesce(nullif(btrim(coalesce(p_game.level, '')), ''), 'Open'),
      'confirmed_count', greatest(coalesce(v_count, 0), 0),
      'capacity', p_game.game_capacity,
      'host_first_name', public.host_first_name(v_host_name),
      'image', p_game.image,
      'is_paid', coalesce(p_game.is_paid, false),
      'payment_amount', p_game.payment_amount,
      'court_type', p_game.court_type,
      'game_type', p_game.type,
      'description', left(coalesce(p_game.description, ''), 280)
    )
  );
end;
$$;


ALTER FUNCTION "public"."public_game_projection"("p_game" "public"."games") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."read_mutation_idempotency"("p_actor_id" "uuid", "p_operation" "text", "p_key" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."read_mutation_idempotency"("p_actor_id" "uuid", "p_operation" "text", "p_key" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_acquisition_attribution_v1"("p_anonymous_id" "uuid", "p_public_id" "text", "p_share_code" "text" DEFAULT NULL::"text", "p_provider" "text" DEFAULT 'canonical_link'::"text", "p_match_type" "text" DEFAULT 'universal_link'::"text", "p_touch_type" "text" DEFAULT 'recovery'::"text", "p_confidence" "text" DEFAULT 'medium'::"text", "p_idempotency_key" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_user_id uuid := auth.uid();
  v_public_id text := lower(nullif(trim(coalesce(p_public_id, '')), ''));
  v_share text := nullif(trim(coalesce(p_share_code, '')), '');
  v_provider text := coalesce(nullif(trim(p_provider), ''), 'canonical_link');
  v_match_type text := coalesce(nullif(trim(p_match_type), ''), 'universal_link');
  v_touch_type text := coalesce(nullif(trim(p_touch_type), ''), 'recovery');
  v_confidence text := coalesce(nullif(trim(p_confidence), ''), 'medium');
  v_idem text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_game public.games%rowtype;
  v_link_id uuid := null;
  v_meta jsonb := '{}'::jsonb;
  v_existing public.acquisition_attribution_events%rowtype;
  v_row public.acquisition_attribution_events%rowtype;
begin
  if not public.acquisition_attribution_enabled() then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'kill_switch');
  end if;

  if p_anonymous_id is null then
    raise exception using errcode = '22023', message = 'anonymous_id is required.';
  end if;

  if v_public_id is null or v_public_id !~ '^[0-9a-f]{32}$' then
    raise exception using errcode = '22023', message = 'public_id is required.';
  end if;

  if v_provider not in ('branch', 'canonical_link', 'manual', 'unknown') then
    v_provider := 'unknown';
  end if;
  if v_match_type not in (
    'nativelink', 'universal_link', 'custom_scheme', 'manual_fallback', 'none', 'error'
  ) then
    v_match_type := 'none';
  end if;
  if v_touch_type not in ('first', 'last', 'install', 'signup', 'recovery') then
    v_touch_type := 'recovery';
  end if;
  if v_confidence not in ('high', 'medium', 'low') then
    v_confidence := 'medium';
  end if;

  if v_idem is null then
    v_idem := encode(
      sha256(
        convert_to(
          p_anonymous_id::text || '|' || v_public_id || '|' || coalesce(v_share, '') || '|' ||
            v_touch_type || '|' || v_match_type || '|' || to_char(now(), 'YYYY-MM-DD'),
          'UTF8'
        )
      ),
      'hex'
    );
  end if;

  select * into v_existing
  from public.acquisition_attribution_events
  where idempotency_key = v_idem;

  if found then
    return jsonb_build_object(
      'ok', true,
      'already_recorded', true,
      'id', v_existing.id,
      'link_id', v_existing.link_id,
      'match_type', v_existing.match_type,
      'confidence', v_existing.confidence
    );
  end if;

  select * into v_game
  from public.games g
  where g.public_id = v_public_id
  limit 1;

  if v_game.id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'game_not_found',
      'code', 'game_not_found'
    );
  end if;

  if v_share is not null then
    if v_share !~ '^[A-Za-z0-9_-]{16,128}$' then
      return jsonb_build_object(
        'ok', false,
        'error', 'invalid_share_code',
        'code', 'invalid_share_code'
      );
    end if;

    select gsl.id into v_link_id
    from public.game_share_links gsl
    where gsl.share_code = v_share
      and gsl.game_id = v_game.id
      and gsl.revoked_at is null
      and (gsl.expires_at is null or gsl.expires_at > now())
    limit 1;

    if v_link_id is null then
      return jsonb_build_object(
        'ok', false,
        'error', 'share_code_invalid',
        'code', 'share_code_invalid'
      );
    end if;
  end if;

  -- Allowlisted metadata only — never persist raw provider payloads.
  if p_metadata is not null and jsonb_typeof(p_metadata) = 'object' then
    v_meta := jsonb_strip_nulls(
      jsonb_build_object(
        'game_public_id', v_public_id,
        'touch_hint', left(coalesce(p_metadata->>'touch_hint', ''), 64),
        'source_surface', left(coalesce(p_metadata->>'source_surface', ''), 64)
      )
    );
  else
    v_meta := jsonb_build_object('game_public_id', v_public_id);
  end if;

  -- Do not rebind attribution when anonymous_id is already linked to another user.
  if v_user_id is not null then
    if exists (
      select 1
      from public.analytics_identity_links ail
      where ail.anonymous_id = p_anonymous_id
        and ail.user_id is not null
        and ail.user_id is distinct from v_user_id
    ) then
      return jsonb_build_object(
        'ok', false,
        'error', 'anonymous_id_conflict',
        'code', 'anonymous_id_conflict'
      );
    end if;
  end if;

  insert into public.acquisition_attribution_events (
    anonymous_id,
    user_id,
    link_id,
    provider,
    match_type,
    touch_type,
    occurred_at,
    confidence,
    metadata,
    idempotency_key
  ) values (
    p_anonymous_id,
    v_user_id,
    v_link_id,
    v_provider,
    v_match_type,
    v_touch_type,
    now(),
    v_confidence,
    v_meta,
    v_idem
  )
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'already_recorded', false,
    'id', v_row.id,
    'link_id', v_row.link_id,
    'match_type', v_row.match_type,
    'confidence', v_row.confidence,
    'user_attached', v_row.user_id is not null
  );
exception
  when unique_violation then
    select * into v_existing
    from public.acquisition_attribution_events
    where idempotency_key = v_idem;
    return jsonb_build_object(
      'ok', true,
      'already_recorded', true,
      'id', v_existing.id,
      'link_id', v_existing.link_id,
      'match_type', v_existing.match_type,
      'confidence', v_existing.confidence
    );
end;
$_$;


ALTER FUNCTION "public"."record_acquisition_attribution_v1"("p_anonymous_id" "uuid", "p_public_id" "text", "p_share_code" "text", "p_provider" "text", "p_match_type" "text", "p_touch_type" "text", "p_confidence" "text", "p_idempotency_key" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_push_token_v1"("p_expo_push_token" "text", "p_installation_id" "text", "p_platform" "text", "p_permission_status" "text" DEFAULT 'granted'::"text", "p_permission_granted" boolean DEFAULT true, "p_device_name" "text" DEFAULT NULL::"text", "p_app_version" "text" DEFAULT NULL::"text", "p_native_build_version" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_user_id uuid := auth.uid();
  v_token text := trim(coalesce(p_expo_push_token, ''));
  v_installation_id text := trim(coalesce(p_installation_id, ''));
  v_platform text := lower(trim(coalesce(p_platform, '')));
  v_status text := public.normalize_push_permission_status(p_permission_status);
  v_row public.push_devices%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if v_platform not in ('ios', 'android') then
    raise exception using errcode = '22023', message = 'platform must be ios or android.';
  end if;

  if char_length(v_installation_id) < 16 or char_length(v_installation_id) > 128 then
    raise exception using errcode = '22023', message = 'installation_id length is invalid.';
  end if;

  if char_length(v_token) < 20
    or char_length(v_token) > 220
    or v_token !~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$'
  then
    raise exception using errcode = '22023', message = 'expo push token is invalid.';
  end if;

  -- If this OS token moved accounts on the same device, stop sending to the old owner.
  update public.push_devices
  set active = false,
      permission_granted = false,
      deactivated_at = coalesce(deactivated_at, now()),
      last_seen_at = now()
  where expo_push_token = v_token
    and user_id <> v_user_id
    and active = true;

  insert into public.push_devices (
    user_id,
    installation_id,
    platform,
    expo_push_token,
    permission_status,
    permission_granted,
    device_name,
    app_version,
    native_build_version,
    active,
    last_registered_at,
    last_seen_at,
    deactivated_at
  )
  values (
    v_user_id,
    v_installation_id,
    v_platform,
    v_token,
    v_status,
    coalesce(p_permission_granted, v_status in ('granted', 'provisional')),
    nullif(left(trim(coalesce(p_device_name, '')), 120), ''),
    nullif(left(trim(coalesce(p_app_version, '')), 40), ''),
    nullif(left(trim(coalesce(p_native_build_version, '')), 40), ''),
    true,
    now(),
    now(),
    null
  )
  on conflict (user_id, installation_id) do update
  set platform = excluded.platform,
      expo_push_token = excluded.expo_push_token,
      permission_status = excluded.permission_status,
      permission_granted = excluded.permission_granted,
      device_name = excluded.device_name,
      app_version = excluded.app_version,
      native_build_version = excluded.native_build_version,
      active = true,
      last_registered_at = now(),
      last_seen_at = now(),
      deactivated_at = null
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'user_id', v_row.user_id,
    'installation_id', v_row.installation_id,
    'platform', v_row.platform,
    'permission_status', v_row.permission_status,
    'permission_granted', v_row.permission_granted,
    'active', v_row.active,
    'last_registered_at', v_row.last_registered_at,
    'last_seen_at', v_row.last_seen_at
  );
end;
$_$;


ALTER FUNCTION "public"."register_push_token_v1"("p_expo_push_token" "text", "p_installation_id" "text", "p_platform" "text", "p_permission_status" "text", "p_permission_granted" boolean, "p_device_name" "text", "p_app_version" "text", "p_native_build_version" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_game_for_mutation"("p_game_ref" "text") RETURNS "public"."games"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."resolve_game_for_mutation"("p_game_ref" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_game_for_viewer_v1"("public_id" "text", "share_code" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_started timestamptz := clock_timestamp();
  v_latency integer;
  v_user_id uuid := auth.uid();
  v_public jsonb;
  v_game public.games%rowtype;
  v_state text;
  v_role text := 'none';
  v_membership text := 'none';
  v_can_join boolean := false;
  v_join_reason text := null;
  v_eligibility text;
  v_coords text;
  v_result jsonb;
begin
  if v_user_id is null then
    return public.resolve_public_game_v1(public_id, share_code);
  end if;

  v_public := public.resolve_public_game_v1(public_id, share_code);
  v_state := v_public ->> 'state';

  if v_state in ('not_found_or_restricted', 'maintenance') then
    return v_public;
  end if;

  v_game := public.resolve_game_row(nullif(trim(coalesce(public_id, '')), ''));
  if v_game.id is null and (v_public ? 'public_id') then
    v_game := public.resolve_game_row(v_public ->> 'public_id');
  end if;

  if v_game.id is null then
    return v_public;
  end if;

  if v_game.host_id = v_user_id then
    v_role := 'host';
    v_membership := 'host';
  elsif exists (
    select 1
    from public.game_players gp
    where gp.game_id = v_game.id
      and gp.user_id = v_user_id
  ) then
    v_role := 'member';
    v_membership := 'joined';
  end if;

  if v_membership in ('host', 'joined') then
    v_can_join := false;
    v_join_reason := 'already_member';
  elsif v_state = 'available' then
    v_eligibility := public.validate_join_eligibility(v_user_id, v_game);
    if v_eligibility is null then
      v_can_join := true;
      v_join_reason := null;
    elsif v_eligibility like 'ineligible:%' then
      v_can_join := false;
      v_join_reason := split_part(v_eligibility, ':', 2);
    else
      v_can_join := false;
      v_join_reason := v_eligibility;
    end if;
  else
    v_can_join := false;
    v_join_reason := v_state;
  end if;

  -- Never surface request-for-approval outcomes in this release.
  if v_join_reason in ('requested', 'already_requested', 'pending_approval') then
    v_can_join := true;
    v_join_reason := null;
  end if;

  if v_game.location_cords is not null then
    v_coords := public.ST_AsText(v_game.location_cords::geometry);
  end if;

  v_latency := greatest(
    0,
    floor(extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer
  );

  v_result := v_public || jsonb_build_object(
    'latency_ms', v_latency,
    'viewer', jsonb_strip_nulls(
      jsonb_build_object(
        'game_id', v_game.id,
        'role', v_role,
        'membership_state', v_membership,
        'join_eligibility', jsonb_build_object(
          'can_join', v_can_join,
          'reason', v_join_reason,
          'mode', 'immediate'
        ),
        'detailed_location', case
          when v_membership in ('host', 'joined') or v_can_join or v_state in ('available', 'full', 'started') then
            jsonb_strip_nulls(
              jsonb_build_object(
                'name', v_game.location_name,
                'coordinates_wkt', v_coords
              )
            )
          else null
        end,
        'chat_id', case
          when v_membership in ('host', 'joined') then v_game.chat_id
          else null
        end
      )
    )
  );

  perform public.log_game_resolution(
    'deep_link_game_resolved',
    v_game.public_id,
    v_state,
    v_latency,
    v_user_id,
    jsonb_build_object(
      'surface', 'authenticated',
      'role', v_role,
      'can_join', v_can_join
    )
  );

  return v_result;
end;
$$;


ALTER FUNCTION "public"."resolve_game_for_viewer_v1"("public_id" "text", "share_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_game_row"("p_game_ref" "text") RETURNS "public"."games"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."resolve_game_row"("p_game_ref" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_public_game_v1"("public_id" "text", "share_code" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_started timestamptz := clock_timestamp();
  v_latency integer;
  v_game public.games%rowtype;
  v_state text;
  v_share text := nullif(trim(coalesce(share_code, '')), '');
  v_ref text := nullif(trim(coalesce(public_id, '')), '');
  v_result jsonb;
begin
  if not public.growth_public_links_enabled() then
    v_latency := greatest(0, floor(extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer);
    v_result := jsonb_build_object(
      'state', 'maintenance',
      'latency_ms', v_latency
    );
    perform public.log_game_resolution(
      'deep_link_game_unavailable',
      null,
      'maintenance',
      v_latency,
      auth.uid(),
      jsonb_build_object('reason', 'kill_switch')
    );
    return v_result;
  end if;

  v_game := public.resolve_game_row(v_ref);

  if v_game.id is null then
    v_latency := greatest(0, floor(extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer);
    v_result := jsonb_build_object(
      'state', 'not_found_or_restricted',
      'latency_ms', v_latency
    );
    perform public.log_game_resolution(
      'deep_link_game_unavailable',
      case when v_ref ~ '^[0-9a-f]{32}$' then v_ref else null end,
      'not_found_or_restricted',
      v_latency,
      auth.uid(),
      jsonb_build_object('reason', 'missing')
    );
    return v_result;
  end if;

  if v_share is not null
     and v_share ~ '^[0-9a-f]{32}$'
     and v_share is distinct from v_game.public_id
     and not exists (
       select 1
       from public.game_share_links gsl
       where gsl.share_code = v_share
         and gsl.game_id = v_game.id
         and gsl.revoked_at is null
         and (gsl.expires_at is null or gsl.expires_at > now())
     ) then
    v_latency := greatest(0, floor(extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer);
    v_result := jsonb_build_object(
      'state', 'not_found_or_restricted',
      'latency_ms', v_latency
    );
    perform public.log_game_resolution(
      'deep_link_game_unavailable',
      v_game.public_id,
      'not_found_or_restricted',
      v_latency,
      auth.uid(),
      jsonb_build_object('reason', 'share_code')
    );
    return v_result;
  end if;

  if v_game.host_id is not null
     and auth.uid() is not null
     and public.has_blocked_relationship(v_game.host_id, auth.uid()) then
    v_latency := greatest(0, floor(extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer);
    v_result := jsonb_build_object(
      'state', 'not_found_or_restricted',
      'latency_ms', v_latency
    );
    perform public.log_game_resolution(
      'deep_link_game_unavailable',
      v_game.public_id,
      'not_found_or_restricted',
      v_latency,
      auth.uid(),
      jsonb_build_object('reason', 'restricted')
    );
    return v_result;
  end if;

  v_state := public.game_resolution_state(v_game);
  v_latency := greatest(0, floor(extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer);

  if v_state = 'not_found_or_restricted' then
    v_result := jsonb_build_object(
      'state', 'not_found_or_restricted',
      'latency_ms', v_latency
    );
    perform public.log_game_resolution(
      'deep_link_game_unavailable',
      v_game.public_id,
      v_state,
      v_latency,
      auth.uid(),
      jsonb_build_object('reason', 'restricted')
    );
    return v_result;
  end if;

  v_result := jsonb_build_object(
    'state', v_state,
    'public_id', v_game.public_id,
    'latency_ms', v_latency,
    'game', public.public_game_projection(v_game)
  );

  perform public.log_game_resolution(
    'deep_link_game_resolved',
    v_game.public_id,
    v_state,
    v_latency,
    auth.uid(),
    jsonb_build_object('surface', 'public')
  );

  return v_result;
end;
$_$;


ALTER FUNCTION "public"."resolve_public_game_v1"("public_id" "text", "share_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_game_share_link_v1"("p_share_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $_$
declare
  v_user_id uuid := auth.uid();
  v_link public.game_share_links%rowtype;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;

  if p_share_code is null or p_share_code !~ '^[A-Za-z0-9_-]{16,128}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_share_code');
  end if;

  select * into v_link
  from public.game_share_links
  where share_code = p_share_code
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_link.created_by is distinct from v_user_id
     and not exists (
       select 1 from public.games g
       where g.id = v_link.game_id and g.host_id = v_user_id
     ) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if v_link.revoked_at is not null then
    return jsonb_build_object('ok', true, 'code', 'already_revoked', 'link_id', v_link.id);
  end if;

  update public.game_share_links
  set revoked_at = now()
  where id = v_link.id;

  return jsonb_build_object('ok', true, 'code', 'revoked', 'link_id', v_link.id);
end;
$_$;


ALTER FUNCTION "public"."revoke_game_share_link_v1"("p_share_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."store_mutation_idempotency"("p_actor_id" "uuid", "p_operation" "text", "p_key" "uuid", "p_resource_id" "uuid", "p_result" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."store_mutation_idempotency"("p_actor_id" "uuid", "p_operation" "text", "p_key" "uuid", "p_resource_id" "uuid", "p_result" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_players_enrolled"("p_game_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."sync_players_enrolled"("p_game_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_notification_preferences_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;


ALTER FUNCTION "public"."touch_notification_preferences_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_push_devices_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_push_devices_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transition_game_status"("p_game_id" "uuid", "p_next_status" "text", "p_reason" "text" DEFAULT 'unspecified'::"text") RETURNS "public"."games"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."transition_game_status"("p_game_id" "uuid", "p_next_status" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_notification_preferences_v1"("p_patch" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_row public.notification_preferences%rowtype;
  v_radius integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception using errcode = '22023', message = 'patch object is required.';
  end if;

  perform public.ensure_notification_preferences_row(v_user_id);

  v_radius := case
    when p_patch ? 'radius_meters' then (p_patch->>'radius_meters')::integer
    else null
  end;
  if v_radius is not null and v_radius not in (2000, 5000, 10000) then
    raise exception using errcode = '22023', message = 'radius_meters must be 2000, 5000, or 10000.';
  end if;

  update public.notification_preferences np
  set
    chat_messages = coalesce((p_patch->>'chat_messages')::boolean, np.chat_messages),
    message_previews = coalesce((p_patch->>'message_previews')::boolean, np.message_previews),
    game_reminders = coalesce((p_patch->>'game_reminders')::boolean, np.game_reminders),
    host_updates = coalesce((p_patch->>'host_updates')::boolean, np.host_updates),
    nearby_games = coalesce((p_patch->>'nearby_games')::boolean, np.nearby_games),
    favourite_park_games = coalesce((p_patch->>'favourite_park_games')::boolean, np.favourite_park_games),
    marketing_updates = coalesce((p_patch->>'marketing_updates')::boolean, np.marketing_updates),
    radius_meters = coalesce(v_radius, np.radius_meters),
    quiet_hours_enabled = coalesce((p_patch->>'quiet_hours_enabled')::boolean, np.quiet_hours_enabled),
    quiet_start = coalesce((p_patch->>'quiet_start')::time, np.quiet_start),
    quiet_end = coalesce((p_patch->>'quiet_end')::time, np.quiet_end),
    timezone = coalesce(nullif(trim(p_patch->>'timezone'), ''), np.timezone),
    primer_state = coalesce(nullif(trim(p_patch->>'primer_state'), ''), np.primer_state),
    primer_last_shown_at = case
      when p_patch ? 'primer_last_shown_at' then (p_patch->>'primer_last_shown_at')::timestamptz
      else np.primer_last_shown_at
    end,
    primer_snooze_until = case
      when p_patch ? 'primer_snooze_until' then (p_patch->>'primer_snooze_until')::timestamptz
      else np.primer_snooze_until
    end
  where np.user_id = v_user_id
  returning * into v_row;

  return public.get_notification_preferences_v1();
end;
$$;


ALTER FUNCTION "public"."update_notification_preferences_v1"("p_patch" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_meets_minimum_onboarding_v1"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.users u
    where u.id = p_user_id
      and nullif(btrim(coalesce(u.name, '')), '') is not null
      and nullif(btrim(coalesce(u.age_group, '')), '') is not null
      and nullif(btrim(coalesce(u.level, '')), '') is not null
  );
$$;


ALTER FUNCTION "public"."user_meets_minimum_onboarding_v1"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_join_eligibility"("p_user_id" "uuid", "p_game" "public"."games") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."validate_join_eligibility"("p_user_id" "uuid", "p_game" "public"."games") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."acquisition_attribution_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "anonymous_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "link_id" "uuid",
    "provider" "text" NOT NULL,
    "match_type" "text" NOT NULL,
    "touch_type" "text" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confidence" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    CONSTRAINT "acquisition_attribution_confidence_check" CHECK (("confidence" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "acquisition_attribution_match_type_check" CHECK (("match_type" = ANY (ARRAY['nativelink'::"text", 'universal_link'::"text", 'custom_scheme'::"text", 'manual_fallback'::"text", 'none'::"text", 'error'::"text"]))),
    CONSTRAINT "acquisition_attribution_provider_check" CHECK (("provider" = ANY (ARRAY['branch'::"text", 'canonical_link'::"text", 'manual'::"text", 'unknown'::"text"]))),
    CONSTRAINT "acquisition_attribution_touch_type_check" CHECK (("touch_type" = ANY (ARRAY['first'::"text", 'last'::"text", 'install'::"text", 'signup'::"text", 'recovery'::"text"])))
);

ALTER TABLE ONLY "public"."acquisition_attribution_events" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."acquisition_attribution_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."acquisition_attribution_events" IS 'Server-validated acquisition touches. No raw provider payloads; link_id resolved server-side only.';



CREATE TABLE IF NOT EXISTS "public"."admin_audit_log" (
    "id" bigint NOT NULL,
    "admin_user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."admin_audit_log" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_audit_log" OWNER TO "postgres";


ALTER TABLE "public"."admin_audit_log" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."admin_audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."admin_users" (
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "admin_users_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'analyst'::"text", 'support'::"text"])))
);

ALTER TABLE ONLY "public"."admin_users" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analytics_ai_briefs" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "brief_date" "date" NOT NULL,
    "scope" "text" DEFAULT 'daily'::"text" NOT NULL,
    "model_provider" "text" DEFAULT 'google'::"text" NOT NULL,
    "model_name" "text" DEFAULT 'gemini-2.5-flash'::"text" NOT NULL,
    "system_prompt_version" "text" DEFAULT 'sportiner-founder-analyst-v1'::"text" NOT NULL,
    "input_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "output_brief" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'generated'::"text" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "analytics_ai_briefs_status_check" CHECK (("status" = ANY (ARRAY['generated'::"text", 'fallback'::"text", 'failed'::"text"])))
);

ALTER TABLE ONLY "public"."analytics_ai_briefs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."analytics_ai_briefs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analytics_connectors" (
    "id" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "status" "text" NOT NULL,
    "credential_status" "text" NOT NULL,
    "cadence" "text" NOT NULL,
    "api_surface" "text" NOT NULL,
    "next_step" "text" NOT NULL,
    "last_sync_at" timestamp with time zone,
    "last_error" "text",
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "analytics_connectors_status_check" CHECK (("status" = ANY (ARRAY['healthy'::"text", 'attention'::"text", 'critical'::"text", 'info'::"text"])))
);

ALTER TABLE ONLY "public"."analytics_connectors" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."analytics_connectors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analytics_identity_links" (
    "anonymous_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "linked_at" timestamp with time zone,
    "source" "text" DEFAULT 'app'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "analytics_identity_links_link_consistency_check" CHECK (((("user_id" IS NULL) AND ("linked_at" IS NULL)) OR (("user_id" IS NOT NULL) AND ("linked_at" IS NOT NULL)))),
    CONSTRAINT "analytics_identity_links_source_check" CHECK (("source" = ANY (ARRAY['app'::"text", 'web'::"text", 'alias_rpc'::"text", 'migration'::"text"])))
);


ALTER TABLE "public"."analytics_identity_links" OWNER TO "postgres";


COMMENT ON TABLE "public"."analytics_identity_links" IS 'One-time first-party anonymous_id → user_id alias. Historical product_events rows are never rewritten.';



CREATE TABLE IF NOT EXISTS "public"."analytics_ingestion_runs" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "status" "text" NOT NULL,
    "records_seen" integer DEFAULT 0 NOT NULL,
    "records_written" integer DEFAULT 0 NOT NULL,
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "analytics_ingestion_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'succeeded'::"text", 'failed'::"text", 'skipped'::"text"])))
);

ALTER TABLE ONLY "public"."analytics_ingestion_runs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."analytics_ingestion_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analytics_parks" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "location" "public"."geography"(Point,4326) NOT NULL,
    "launch_status" "text" DEFAULT 'monitoring'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."analytics_parks" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."analytics_parks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_store_daily_metrics" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "report_date" "date" NOT NULL,
    "app_id" "text" NOT NULL,
    "app_version" "text",
    "country_code" "text",
    "device_type" "text",
    "source_type" "text",
    "page_views" integer,
    "product_page_conversion_rate" numeric,
    "downloads" integer,
    "first_time_downloads" integer,
    "redownloads" integer,
    "installs" integer,
    "deletions" integer,
    "app_units" integer,
    "sessions" integer,
    "crashes" integer,
    "retention" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "acquisition_metrics" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "raw_report" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."app_store_daily_metrics" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_store_daily_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blocked_users" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "blocker_id" "uuid" NOT NULL,
    "blocked_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."blocked_users" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."blocked_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "name" "text",
    "photo" "text",
    "last_message" "text",
    "last_message_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "game_id" "uuid" DEFAULT "extensions"."gen_random_uuid"(),
    "last_message_id" "uuid",
    "last_message_sender_id" "uuid",
    CONSTRAINT "chat_type_check" CHECK (("type" = ANY (ARRAY['private'::"text", 'group'::"text"])))
);

ALTER TABLE ONLY "public"."chat" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_posts" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "external_post_id" "text",
    "source_name" "text",
    "post_url" "text",
    "title" "text",
    "campaign_id" "text",
    "published_at" timestamp with time zone,
    "impressions" integer,
    "reach" integer,
    "average_reach" numeric,
    "views" integer,
    "upvotes" integer,
    "downvotes" integer,
    "likes" integer,
    "comments" integer,
    "reposts" integer,
    "shares" integer,
    "saves" integer,
    "profile_visits" integer,
    "website_clicks" integer,
    "ctr" numeric,
    "downloads_generated" integer,
    "users_acquired" integer,
    "games_created" integer,
    "games_joined" integer,
    "completed_games" integer,
    "raw_metrics" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "community_posts_provider_check" CHECK (("provider" = ANY (ARRAY['reddit'::"text", 'linkedin'::"text", 'instagram'::"text", 'other'::"text"])))
);

ALTER TABLE ONLY "public"."community_posts" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_members" (
    "id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "chat_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "last_read_at" timestamp with time zone DEFAULT "now"(),
    "level" "text",
    "game_id" "uuid" DEFAULT "extensions"."gen_random_uuid"(),
    "color" "text",
    "last_read_message_id" "uuid"
);

ALTER TABLE ONLY "public"."conversation_members" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."court_outreach_sessions" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "court_name" "text" NOT NULL,
    "park_slug" "text",
    "campaign_id" "text",
    "visited_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "people_spoken_to" integer DEFAULT 0 NOT NULL,
    "qr_scans" integer DEFAULT 0 NOT NULL,
    "downloads" integer DEFAULT 0 NOT NULL,
    "accounts_created" integer DEFAULT 0 NOT NULL,
    "games_joined" integer DEFAULT 0 NOT NULL,
    "returning_players" integer DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."court_outreach_sessions" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."court_outreach_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_outcomes" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "role" "text" NOT NULL,
    "status" "text" NOT NULL,
    "confirmed_by" "uuid",
    "confirmed_at" timestamp with time zone,
    "confirmation_role" "text",
    "cancellation_reason" "text",
    "cancellation_code" "text",
    "cancelled_by" "uuid",
    "cancelled_at" timestamp with time zone,
    "dispute_reason" "text",
    "dispute_resolved_by" "uuid",
    "dispute_resolved_at" timestamp with time zone,
    "dispute_resolution" "text",
    "is_historical" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "game_outcomes_confirmation_role_check" CHECK (("confirmation_role" = ANY (ARRAY['self'::"text", 'opponent'::"text", 'system'::"text"]))),
    CONSTRAINT "game_outcomes_role_check" CHECK (("role" = ANY (ARRAY['host'::"text", 'player'::"text"]))),
    CONSTRAINT "game_outcomes_status_check" CHECK (("status" = ANY (ARRAY['completed'::"text", 'cancelled'::"text", 'no_show'::"text", 'disputed'::"text", 'pending'::"text"])))
);

ALTER TABLE ONLY "public"."game_outcomes" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_outcomes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_players" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "game_verified" boolean DEFAULT false,
    CONSTRAINT "game_players_role_check" CHECK (("role" = ANY (ARRAY['host'::"text", 'member'::"text"])))
);

ALTER TABLE ONLY "public"."game_players" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_requests" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "game_id" "uuid",
    "user_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp without time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."game_requests" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_share_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "share_code" "text" NOT NULL,
    "game_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "surface" "text" NOT NULL,
    "campaign_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "game_share_links_share_code_format_check" CHECK (("share_code" ~ '^[A-Za-z0-9_-]{16,128}$'::"text")),
    CONSTRAINT "game_share_links_surface_check" CHECK (("surface" = ANY (ARRAY['game_detail'::"text", 'creation_success'::"text", 'native_sheet'::"text", 'copy'::"text", 'profile'::"text", 'suggestion'::"text", 'push'::"text"])))
);

ALTER TABLE ONLY "public"."game_share_links" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_share_links" OWNER TO "postgres";


COMMENT ON TABLE "public"."game_share_links" IS 'Opaque share codes for canonical https://sportiner.com/g/{public_id}?s={share_code}. Attribution only; revoke does not hide a still-public game.';



CREATE TABLE IF NOT EXISTS "public"."growth_flags" (
    "key" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "note" "text"
);

ALTER TABLE ONLY "public"."growth_flags" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."growth_flags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "chat_id" "uuid",
    "sender_id" "uuid",
    "message" "text",
    "type" "text" DEFAULT 'text'::"text",
    "reply_to" "uuid",
    "is_edited" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "is_reply" boolean DEFAULT false NOT NULL,
    "image" "text",
    CONSTRAINT "messages_type_check" CHECK (("type" = ANY (ARRAY['text'::"text", 'image'::"text", 'system'::"text"])))
);

ALTER TABLE ONLY "public"."messages" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."moderation_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "type" "text" DEFAULT 'block'::"text" NOT NULL,
    "actor_id" "uuid",
    "target_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."moderation_events" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."moderation_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mutation_idempotency" (
    "actor_id" "uuid" NOT NULL,
    "operation" "text" NOT NULL,
    "key" "uuid" NOT NULL,
    "resource_id" "uuid",
    "result_code" "text" NOT NULL,
    "result_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mutation_idempotency_operation_check" CHECK (("operation" = ANY (ARRAY['create_game_v1'::"text", 'join_game_v1'::"text", 'cancel_game_v1'::"text", 'leave_game_v1'::"text"])))
);

ALTER TABLE ONLY "public"."mutation_idempotency" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."mutation_idempotency" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "type" "text" NOT NULL,
    "content" "text",
    "read" boolean DEFAULT false,
    "created_at" timestamp without time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."notifications" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_events" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "firebase_uid" "text",
    "user_email" "text",
    "event_name" "text" NOT NULL,
    "game_id" "text",
    "sport" "text",
    "park_slug" "text",
    "route" "text",
    "source" "text",
    "session_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "app_version" "text",
    "acquisition_source" "text",
    "campaign_id" "text",
    "share_id" "text",
    "user_id" "uuid",
    "auth_provider" "text",
    "event_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_version" integer DEFAULT 1 NOT NULL,
    "anonymous_id" "uuid",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "environment" "text" DEFAULT 'production'::"text" NOT NULL,
    "link_id" "uuid",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_game_id" "uuid",
    "platform" "text",
    "channel_hint" "text",
    CONSTRAINT "product_events_environment_check" CHECK (("environment" = ANY (ARRAY['development'::"text", 'preview'::"text", 'production'::"text"]))),
    CONSTRAINT "product_events_platform_check" CHECK ((("platform" IS NULL) OR ("platform" = ANY (ARRAY['ios'::"text", 'android'::"text", 'web'::"text", 'server'::"text"]))))
);

ALTER TABLE ONLY "public"."product_events" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "installation_id" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "expo_push_token" "text" NOT NULL,
    "permission_status" "text" DEFAULT 'undetermined'::"text" NOT NULL,
    "permission_granted" boolean DEFAULT false NOT NULL,
    "device_name" "text",
    "app_version" "text",
    "native_build_version" "text",
    "active" boolean DEFAULT true NOT NULL,
    "last_registered_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deactivated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "push_devices_expo_token_length" CHECK ((("char_length"("expo_push_token") >= 20) AND ("char_length"("expo_push_token") <= 220))),
    CONSTRAINT "push_devices_expo_token_shape" CHECK (("expo_push_token" ~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$'::"text")),
    CONSTRAINT "push_devices_installation_id_length" CHECK ((("char_length"("installation_id") >= 16) AND ("char_length"("installation_id") <= 128))),
    CONSTRAINT "push_devices_permission_status_check" CHECK (("permission_status" = ANY (ARRAY['undetermined'::"text", 'granted'::"text", 'denied'::"text", 'provisional'::"text", 'unknown'::"text"]))),
    CONSTRAINT "push_devices_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text"])))
);

ALTER TABLE ONLY "public"."push_devices" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_devices" OWNER TO "postgres";


COMMENT ON TABLE "public"."push_devices" IS 'Per-user Expo push token registry. Tokens are registered by authenticated RPCs and used by server-side send workers after notification_preferences are checked.';



CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "reported_user_id" "uuid",
    "reported_post_id" "uuid",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."reports" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text",
    "profile_picture" "text",
    "email" "text",
    "age_group" "text",
    "level" "text" DEFAULT ''::"text",
    "availability" json,
    "city" "text",
    "last_active_at" timestamp with time zone,
    "elo" integer,
    "gamesPlayed" integer,
    "reliability_score" integer,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "accepted_terms" boolean DEFAULT false NOT NULL,
    "onboarding_version" integer DEFAULT 0 NOT NULL,
    "onboarding_stage" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "onboarding_completed_at" timestamp with time zone,
    CONSTRAINT "users_onboarding_stage_check" CHECK (("onboarding_stage" = ANY (ARRAY['not_started'::"text", 'minimum_complete'::"text", 'complete'::"text"])))
);

ALTER TABLE ONLY "public"."users" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."users"."onboarding_version" IS 'Client/schema version of the onboarding contract the user last completed.';



COMMENT ON COLUMN "public"."users"."onboarding_stage" IS 'not_started | minimum_complete (referred short path) | complete (full onboarding).';



COMMENT ON COLUMN "public"."users"."onboarding_completed_at" IS 'When onboarding_stage last reached complete. Null for not_started/minimum_complete.';



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "Games_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "Users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."acquisition_attribution_events"
    ADD CONSTRAINT "acquisition_attribution_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."acquisition_attribution_events"
    ADD CONSTRAINT "acquisition_attribution_idempotency_key_uidx" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."analytics_ai_briefs"
    ADD CONSTRAINT "analytics_ai_briefs_brief_date_scope_key" UNIQUE ("brief_date", "scope");



ALTER TABLE ONLY "public"."analytics_ai_briefs"
    ADD CONSTRAINT "analytics_ai_briefs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."analytics_connectors"
    ADD CONSTRAINT "analytics_connectors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."analytics_identity_links"
    ADD CONSTRAINT "analytics_identity_links_pkey" PRIMARY KEY ("anonymous_id");



ALTER TABLE ONLY "public"."analytics_ingestion_runs"
    ADD CONSTRAINT "analytics_ingestion_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."analytics_parks"
    ADD CONSTRAINT "analytics_parks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."analytics_parks"
    ADD CONSTRAINT "analytics_parks_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."app_store_daily_metrics"
    ADD CONSTRAINT "app_store_daily_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blocked_users"
    ADD CONSTRAINT "blocked_users_blocker_id_blocked_id_key" UNIQUE ("blocker_id", "blocked_id");



ALTER TABLE ONLY "public"."blocked_users"
    ADD CONSTRAINT "blocked_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat"
    ADD CONSTRAINT "chat_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_posts"
    ADD CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_posts"
    ADD CONSTRAINT "community_posts_provider_external_post_id_key" UNIQUE ("provider", "external_post_id");



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("id", "chat_id");



ALTER TABLE ONLY "public"."court_outreach_sessions"
    ADD CONSTRAINT "court_outreach_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_outcomes"
    ADD CONSTRAINT "game_outcomes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_players"
    ADD CONSTRAINT "game_players_game_id_user_id_key" UNIQUE ("game_id", "user_id");



ALTER TABLE ONLY "public"."game_players"
    ADD CONSTRAINT "game_players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_requests"
    ADD CONSTRAINT "game_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_share_links"
    ADD CONSTRAINT "game_share_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."growth_flags"
    ADD CONSTRAINT "growth_flags_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."moderation_events"
    ADD CONSTRAINT "moderation_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mutation_idempotency"
    ADD CONSTRAINT "mutation_idempotency_pkey" PRIMARY KEY ("actor_id", "operation", "key");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_events"
    ADD CONSTRAINT "product_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_devices"
    ADD CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



CREATE INDEX "acquisition_attribution_anonymous_occurred_idx" ON "public"."acquisition_attribution_events" USING "btree" ("anonymous_id", "occurred_at" DESC);



CREATE INDEX "acquisition_attribution_link_occurred_idx" ON "public"."acquisition_attribution_events" USING "btree" ("link_id", "occurred_at" DESC) WHERE ("link_id" IS NOT NULL);



CREATE INDEX "acquisition_attribution_user_occurred_idx" ON "public"."acquisition_attribution_events" USING "btree" ("user_id", "occurred_at" DESC) WHERE ("user_id" IS NOT NULL);



CREATE UNIQUE INDEX "analytics_identity_links_user_id_uidx" ON "public"."analytics_identity_links" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "blocked_users_blocked_blocker_idx" ON "public"."blocked_users" USING "btree" ("blocked_id", "blocker_id");



CREATE INDEX "blocked_users_blocker_blocked_idx" ON "public"."blocked_users" USING "btree" ("blocker_id", "blocked_id");



CREATE UNIQUE INDEX "chat_game_id_key" ON "public"."chat" USING "btree" ("game_id") WHERE ("game_id" IS NOT NULL);



CREATE INDEX "conversation_members_chat_user_idx" ON "public"."conversation_members" USING "btree" ("chat_id", "id");



CREATE INDEX "conversation_members_game_user_idx" ON "public"."conversation_members" USING "btree" ("game_id", "id");



CREATE INDEX "conversation_members_user_chat_idx" ON "public"."conversation_members" USING "btree" ("id", "chat_id");



CREATE INDEX "game_players_game_id_idx" ON "public"."game_players" USING "btree" ("game_id");



CREATE INDEX "game_players_game_user_idx" ON "public"."game_players" USING "btree" ("game_id", "user_id");



CREATE INDEX "game_players_user_game_idx" ON "public"."game_players" USING "btree" ("user_id", "game_id");



CREATE INDEX "game_players_user_id_idx" ON "public"."game_players" USING "btree" ("user_id");



CREATE INDEX "game_requests_game_id_idx" ON "public"."game_requests" USING "btree" ("game_id");



CREATE UNIQUE INDEX "game_requests_game_id_user_id_key" ON "public"."game_requests" USING "btree" ("game_id", "user_id") WHERE (("game_id" IS NOT NULL) AND ("user_id" IS NOT NULL));



CREATE INDEX "game_requests_user_id_idx" ON "public"."game_requests" USING "btree" ("user_id");



CREATE INDEX "game_share_links_campaign_id_idx" ON "public"."game_share_links" USING "btree" ("campaign_id") WHERE ("campaign_id" IS NOT NULL);



CREATE INDEX "game_share_links_created_by_idx" ON "public"."game_share_links" USING "btree" ("created_by");



CREATE UNIQUE INDEX "game_share_links_default_active_uidx" ON "public"."game_share_links" USING "btree" ("game_id", "created_by", "surface") WHERE (("campaign_id" IS NULL) AND ("revoked_at" IS NULL));



CREATE INDEX "game_share_links_expires_at_idx" ON "public"."game_share_links" USING "btree" ("expires_at") WHERE ("expires_at" IS NOT NULL);



CREATE INDEX "game_share_links_game_id_idx" ON "public"."game_share_links" USING "btree" ("game_id");



CREATE UNIQUE INDEX "game_share_links_share_code_uidx" ON "public"."game_share_links" USING "btree" ("share_code");



CREATE INDEX "games_host_id_idx" ON "public"."games" USING "btree" ("host_id");



CREATE INDEX "games_is_test_idx" ON "public"."games" USING "btree" ("is_test") WHERE ("is_test" IS TRUE);



CREATE UNIQUE INDEX "games_public_id_key" ON "public"."games" USING "btree" ("public_id");



CREATE INDEX "games_public_status_time_idx" ON "public"."games" USING "btree" ("is_public", "status", "time" DESC);



CREATE INDEX "games_public_time_idx" ON "public"."games" USING "btree" ("is_public", "time" DESC);



CREATE INDEX "games_status_scheduled_time_idx" ON "public"."games" USING "btree" ("status", "time") WHERE ("status" = 'scheduled'::"text");



CREATE INDEX "games_status_time_idx" ON "public"."games" USING "btree" ("status", "time");



CREATE INDEX "games_time_idx" ON "public"."games" USING "btree" ("time");



CREATE INDEX "idx_analytics_ai_briefs_brief_date" ON "public"."analytics_ai_briefs" USING "btree" ("brief_date");



CREATE INDEX "idx_analytics_ai_briefs_status" ON "public"."analytics_ai_briefs" USING "btree" ("status");



CREATE INDEX "idx_app_store_daily_metrics_app_id" ON "public"."app_store_daily_metrics" USING "btree" ("app_id");



CREATE INDEX "idx_app_store_daily_metrics_app_version" ON "public"."app_store_daily_metrics" USING "btree" ("app_version");



CREATE INDEX "idx_app_store_daily_metrics_country_code" ON "public"."app_store_daily_metrics" USING "btree" ("country_code");



CREATE INDEX "idx_app_store_daily_metrics_report_date" ON "public"."app_store_daily_metrics" USING "btree" ("report_date");



CREATE INDEX "idx_app_store_daily_metrics_source_type" ON "public"."app_store_daily_metrics" USING "btree" ("source_type");



CREATE INDEX "idx_blocked_users_blocked_id" ON "public"."blocked_users" USING "btree" ("blocked_id");



CREATE INDEX "idx_blocked_users_blocker_id" ON "public"."blocked_users" USING "btree" ("blocker_id");



CREATE INDEX "idx_community_posts_campaign_id" ON "public"."community_posts" USING "btree" ("campaign_id");



CREATE INDEX "idx_community_posts_provider" ON "public"."community_posts" USING "btree" ("provider");



CREATE INDEX "idx_community_posts_published_at" ON "public"."community_posts" USING "btree" ("published_at");



CREATE INDEX "idx_court_outreach_sessions_campaign_id" ON "public"."court_outreach_sessions" USING "btree" ("campaign_id");



CREATE INDEX "idx_court_outreach_sessions_park_slug" ON "public"."court_outreach_sessions" USING "btree" ("park_slug");



CREATE INDEX "idx_court_outreach_sessions_visited_at" ON "public"."court_outreach_sessions" USING "btree" ("visited_at");



CREATE INDEX "idx_game_outcomes_confirmed_at" ON "public"."game_outcomes" USING "btree" ("confirmed_at");



CREATE INDEX "idx_game_outcomes_game_id" ON "public"."game_outcomes" USING "btree" ("game_id");



CREATE INDEX "idx_game_outcomes_game_status" ON "public"."game_outcomes" USING "btree" ("game_id", "status");



CREATE INDEX "idx_game_outcomes_status" ON "public"."game_outcomes" USING "btree" ("status");



CREATE INDEX "idx_game_outcomes_user_id" ON "public"."game_outcomes" USING "btree" ("user_id");



CREATE INDEX "idx_game_requests_game_id" ON "public"."game_requests" USING "btree" ("game_id");



CREATE INDEX "idx_game_requests_status" ON "public"."game_requests" USING "btree" ("status");



CREATE INDEX "idx_game_requests_user_id" ON "public"."game_requests" USING "btree" ("user_id");



CREATE INDEX "idx_games_host_id" ON "public"."games" USING "btree" ("host_id");



CREATE INDEX "idx_games_time" ON "public"."games" USING "btree" ("time" DESC);



CREATE INDEX "idx_moderation_events_actor_id" ON "public"."moderation_events" USING "btree" ("actor_id");



CREATE INDEX "idx_moderation_events_created_at" ON "public"."moderation_events" USING "btree" ("created_at");



CREATE INDEX "idx_moderation_events_target_id" ON "public"."moderation_events" USING "btree" ("target_id");



CREATE INDEX "idx_moderation_events_type" ON "public"."moderation_events" USING "btree" ("type");



CREATE INDEX "idx_product_events_acquisition_source" ON "public"."product_events" USING "btree" ("acquisition_source");



CREATE INDEX "idx_product_events_app_version" ON "public"."product_events" USING "btree" ("app_version");



CREATE INDEX "idx_product_events_auth_provider" ON "public"."product_events" USING "btree" ("auth_provider");



CREATE INDEX "idx_product_events_campaign_id" ON "public"."product_events" USING "btree" ("campaign_id");



CREATE INDEX "idx_product_events_created_at" ON "public"."product_events" USING "btree" ("created_at");



CREATE INDEX "idx_product_events_event_name" ON "public"."product_events" USING "btree" ("event_name");



CREATE INDEX "idx_product_events_firebase_uid" ON "public"."product_events" USING "btree" ("firebase_uid");



CREATE INDEX "idx_product_events_game_id" ON "public"."product_events" USING "btree" ("game_id");



CREATE INDEX "idx_product_events_park_slug" ON "public"."product_events" USING "btree" ("park_slug");



CREATE INDEX "idx_product_events_share_id" ON "public"."product_events" USING "btree" ("share_id");



CREATE INDEX "idx_product_events_user_id" ON "public"."product_events" USING "btree" ("user_id");



CREATE INDEX "idx_reports_created_at" ON "public"."reports" USING "btree" ("created_at");



CREATE INDEX "idx_reports_reported_post_id" ON "public"."reports" USING "btree" ("reported_post_id");



CREATE INDEX "idx_reports_reported_user_id" ON "public"."reports" USING "btree" ("reported_user_id");



CREATE INDEX "idx_reports_reporter_id" ON "public"."reports" USING "btree" ("reporter_id");



CREATE INDEX "messages_chat_created_idx" ON "public"."messages" USING "btree" ("chat_id", "created_at");



CREATE INDEX "mutation_idempotency_created_at_idx" ON "public"."mutation_idempotency" USING "btree" ("created_at");



CREATE INDEX "notification_preferences_chat_opt_in_idx" ON "public"."notification_preferences" USING "btree" ("user_id") WHERE ("chat_messages" = true);



CREATE INDEX "notifications_user_created_idx" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "product_events_anonymous_id_occurred_at_idx" ON "public"."product_events" USING "btree" ("anonymous_id", "occurred_at" DESC) WHERE ("anonymous_id" IS NOT NULL);



CREATE INDEX "product_events_environment_occurred_at_idx" ON "public"."product_events" USING "btree" ("environment", "occurred_at" DESC);



CREATE UNIQUE INDEX "product_events_event_id_uidx" ON "public"."product_events" USING "btree" ("event_id");



CREATE INDEX "product_events_event_name_occurred_at_idx" ON "public"."product_events" USING "btree" ("event_name", "occurred_at" DESC);



CREATE INDEX "product_events_link_id_occurred_at_idx" ON "public"."product_events" USING "btree" ("link_id", "occurred_at" DESC) WHERE ("link_id" IS NOT NULL);



CREATE INDEX "product_events_user_id_occurred_at_idx" ON "public"."product_events" USING "btree" ("user_id", "occurred_at" DESC) WHERE ("user_id" IS NOT NULL);



CREATE INDEX "push_devices_active_token_idx" ON "public"."push_devices" USING "btree" ("expo_push_token") WHERE ("active" = true);



CREATE INDEX "push_devices_active_user_idx" ON "public"."push_devices" USING "btree" ("user_id", "active", "last_seen_at" DESC);



CREATE UNIQUE INDEX "push_devices_user_installation_uidx" ON "public"."push_devices" USING "btree" ("user_id", "installation_id");



CREATE OR REPLACE TRIGGER "enforce_game_lifecycle_before_write" BEFORE INSERT OR UPDATE ON "public"."games" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_game_lifecycle"();



CREATE OR REPLACE TRIGGER "handle_game_requests_updated_at" BEFORE UPDATE ON "public"."game_requests" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "handle_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "notification_preferences_touch_updated_at" BEFORE UPDATE ON "public"."notification_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."touch_notification_preferences_updated_at"();



CREATE OR REPLACE TRIGGER "push_devices_touch_updated_at" BEFORE UPDATE ON "public"."push_devices" FOR EACH ROW EXECUTE FUNCTION "public"."touch_push_devices_updated_at"();



CREATE OR REPLACE TRIGGER "update_analytics_connectors_updated_at" BEFORE UPDATE ON "public"."analytics_connectors" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_court_outreach_sessions_updated_at" BEFORE UPDATE ON "public"."court_outreach_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_game_outcomes_updated_at" BEFORE UPDATE ON "public"."game_outcomes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_messages_updated_at" BEFORE UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "users_enforce_onboarding_stage_fields" BEFORE INSERT OR UPDATE OF "onboarding_stage", "name", "age_group", "level" ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_onboarding_stage_fields"();



ALTER TABLE ONLY "public"."acquisition_attribution_events"
    ADD CONSTRAINT "acquisition_attribution_events_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "public"."game_share_links"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."acquisition_attribution_events"
    ADD CONSTRAINT "acquisition_attribution_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_identity_links"
    ADD CONSTRAINT "analytics_identity_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."blocked_users"
    ADD CONSTRAINT "blocked_users_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blocked_users"
    ADD CONSTRAINT "blocked_users_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat"
    ADD CONSTRAINT "chat_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id");



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id");



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."game_outcomes"
    ADD CONSTRAINT "game_outcomes_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."game_outcomes"
    ADD CONSTRAINT "game_outcomes_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."game_outcomes"
    ADD CONSTRAINT "game_outcomes_dispute_resolved_by_fkey" FOREIGN KEY ("dispute_resolved_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."game_outcomes"
    ADD CONSTRAINT "game_outcomes_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_outcomes"
    ADD CONSTRAINT "game_outcomes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."game_players"
    ADD CONSTRAINT "game_players_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_players"
    ADD CONSTRAINT "game_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_requests"
    ADD CONSTRAINT "game_requests_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id");



ALTER TABLE ONLY "public"."game_requests"
    ADD CONSTRAINT "game_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."game_share_links"
    ADD CONSTRAINT "game_share_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_share_links"
    ADD CONSTRAINT "game_share_links_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_reply_to_fkey" FOREIGN KEY ("reply_to") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."moderation_events"
    ADD CONSTRAINT "moderation_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."moderation_events"
    ADD CONSTRAINT "moderation_events_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."mutation_idempotency"
    ADD CONSTRAINT "mutation_idempotency_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."product_events"
    ADD CONSTRAINT "product_events_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "public"."game_share_links"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_events"
    ADD CONSTRAINT "product_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."push_devices"
    ADD CONSTRAINT "push_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reported_post_id_fkey" FOREIGN KEY ("reported_post_id") REFERENCES "public"."games"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can read their own analytics membership" ON "public"."admin_users" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND ("active" = true)));



CREATE POLICY "Service role full access" ON "public"."analytics_ai_briefs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."analytics_connectors" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."analytics_ingestion_runs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."app_store_daily_metrics" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."community_posts" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."court_outreach_sessions" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."product_events" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."acquisition_attribution_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."analytics_ai_briefs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."analytics_connectors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."analytics_identity_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "analytics_identity_links_deny_all" ON "public"."analytics_identity_links" TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."analytics_ingestion_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."analytics_parks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_store_daily_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."blocked_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "blocked_users_delete_own" ON "public"."blocked_users" FOR DELETE TO "authenticated" USING (("blocker_id" = "auth"."uid"()));



CREATE POLICY "blocked_users_insert_own" ON "public"."blocked_users" FOR INSERT TO "authenticated" WITH CHECK ((("blocker_id" = "auth"."uid"()) AND ("blocked_id" <> "auth"."uid"())));



CREATE POLICY "blocked_users_select_own" ON "public"."blocked_users" FOR SELECT TO "authenticated" USING (("blocker_id" = "auth"."uid"()));



ALTER TABLE "public"."chat" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_delete_game_host" ON "public"."chat" FOR DELETE TO "authenticated" USING ("public"."is_game_host"("game_id", "auth"."uid"()));



CREATE POLICY "chat_insert_authenticated" ON "public"."chat" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "chat_select_members" ON "public"."chat" FOR SELECT TO "authenticated" USING ("public"."can_access_chat"("id", "auth"."uid"()));



CREATE POLICY "chat_update_members_or_host" ON "public"."chat" FOR UPDATE TO "authenticated" USING ("public"."can_access_chat"("id", "auth"."uid"())) WITH CHECK ("public"."can_access_chat"("id", "auth"."uid"()));



ALTER TABLE "public"."community_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_members_delete_self_or_host" ON "public"."conversation_members" FOR DELETE TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."is_game_host"("game_id", "auth"."uid"())));



CREATE POLICY "conversation_members_insert_self_for_public_game" ON "public"."conversation_members" FOR INSERT TO "authenticated" WITH CHECK ((("id" = "auth"."uid"()) AND ("public"."is_game_host"("game_id", "auth"."uid"()) OR "public"."is_confirmed_participant"("game_id", "auth"."uid"()) OR "public"."is_public_game_visible"("game_id", "auth"."uid"()))));



CREATE POLICY "conversation_members_select_chat_members" ON "public"."conversation_members" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."can_access_chat"("chat_id", "auth"."uid"())));



CREATE POLICY "conversation_members_update_own_read_state" ON "public"."conversation_members" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."court_outreach_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_outcomes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "game_outcomes_select_participants" ON "public"."game_outcomes" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("confirmed_by" = "auth"."uid"()) OR ("cancelled_by" = "auth"."uid"()) OR "public"."is_game_host"("game_id", "auth"."uid"()) OR "public"."is_confirmed_participant"("game_id", "auth"."uid"())));



ALTER TABLE "public"."game_players" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "game_players_delete_self_or_host" ON "public"."game_players" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_game_host"("game_id", "auth"."uid"())));



CREATE POLICY "game_players_insert_self_public_game" ON "public"."game_players" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND "public"."is_public_game_visible"("game_id", "auth"."uid"())));



CREATE POLICY "game_players_select_visible_games" ON "public"."game_players" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_game_host"("game_id", "auth"."uid"()) OR "public"."is_public_game_visible"("game_id", "auth"."uid"())));



ALTER TABLE "public"."game_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "game_requests_select_legacy_parties" ON "public"."game_requests" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_game_host"("game_id", "auth"."uid"())));



ALTER TABLE "public"."game_share_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "game_share_links_select_own" ON "public"."game_share_links" FOR SELECT TO "authenticated" USING (("created_by" = "auth"."uid"()));



ALTER TABLE "public"."games" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "games_delete_host" ON "public"."games" FOR DELETE TO "authenticated" USING (("host_id" = "auth"."uid"()));



CREATE POLICY "games_insert_public_host" ON "public"."games" FOR INSERT TO "authenticated" WITH CHECK ((("host_id" = "auth"."uid"()) AND ("is_public" IS TRUE) AND ("status" = 'scheduled'::"text")));



CREATE POLICY "games_select_authenticated_public_or_involved" ON "public"."games" FOR SELECT TO "authenticated" USING ((("host_id" = "auth"."uid"()) OR "public"."is_confirmed_participant"("id", "auth"."uid"()) OR "public"."is_public_game_visible"("id", "auth"."uid"())));



CREATE POLICY "games_update_host" ON "public"."games" FOR UPDATE TO "authenticated" USING (("host_id" = "auth"."uid"())) WITH CHECK ((("host_id" = "auth"."uid"()) AND ("is_public" IS TRUE)));



ALTER TABLE "public"."growth_flags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "growth_flags_select_authenticated" ON "public"."growth_flags" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_delete_own_or_host" ON "public"."messages" FOR DELETE TO "authenticated" USING ((("sender_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."chat" "c"
  WHERE (("c"."id" = "messages"."chat_id") AND "public"."is_game_host"("c"."game_id", "auth"."uid"()))))));



CREATE POLICY "messages_insert_chat_members" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND "public"."can_access_chat"("chat_id", "auth"."uid"())));



CREATE POLICY "messages_select_chat_members" ON "public"."messages" FOR SELECT TO "authenticated" USING ("public"."can_access_chat"("chat_id", "auth"."uid"()));



CREATE POLICY "messages_update_own" ON "public"."messages" FOR UPDATE TO "authenticated" USING ((("sender_id" = "auth"."uid"()) AND "public"."can_access_chat"("chat_id", "auth"."uid"()))) WITH CHECK ((("sender_id" = "auth"."uid"()) AND "public"."can_access_chat"("chat_id", "auth"."uid"())));



ALTER TABLE "public"."moderation_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "moderation_events_select_own" ON "public"."moderation_events" FOR SELECT TO "authenticated" USING ((("actor_id" = "auth"."uid"()) OR ("target_id" = "auth"."uid"())));



ALTER TABLE "public"."mutation_idempotency" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_preferences_select_own" ON "public"."notification_preferences" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_delete_own" ON "public"."notifications" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "notifications_select_own" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "notifications_update_own" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."product_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_devices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "push_devices_select_own" ON "public"."push_devices" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reports_insert_own" ON "public"."reports" FOR INSERT TO "authenticated" WITH CHECK ((("reporter_id" = "auth"."uid"()) AND COALESCE(("reported_user_id" <> "auth"."uid"()), true)));



CREATE POLICY "service_role_full_access_blocked_users" ON "public"."blocked_users" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_full_access_chat" ON "public"."chat" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_full_access_conversation_members" ON "public"."conversation_members" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_full_access_game_players" ON "public"."game_players" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_full_access_game_requests" ON "public"."game_requests" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_full_access_games" ON "public"."games" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_full_access_growth_flags" ON "public"."growth_flags" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_full_access_messages" ON "public"."messages" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_full_access_moderation_events" ON "public"."moderation_events" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_full_access_mutation_idempotency" ON "public"."mutation_idempotency" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_full_access_notifications" ON "public"."notifications" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_full_access_reports" ON "public"."reports" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_full_access_users" ON "public"."users" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_insert_own" ON "public"."users" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "users_select_authenticated" ON "public"."users" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR (NOT "public"."has_blocked_relationship"("id", "auth"."uid"()))));



CREATE POLICY "users_update_own" ON "public"."users" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."acquisition_attribution_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."acquisition_attribution_enabled"() TO "anon";
GRANT ALL ON FUNCTION "public"."acquisition_attribution_enabled"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."acquisition_attribution_enabled"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."alias_analytics_identity_v1"("p_anonymous_id" "uuid", "p_source" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."alias_analytics_identity_v1"("p_anonymous_id" "uuid", "p_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."alias_analytics_identity_v1"("p_anonymous_id" "uuid", "p_source" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."analytics_ingestion_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."analytics_ingestion_enabled"() TO "anon";
GRANT ALL ON FUNCTION "public"."analytics_ingestion_enabled"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."analytics_ingestion_enabled"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."approximate_area_label"("p_location_name" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."can_access_chat"("p_chat_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_access_chat"("p_chat_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_chat"("p_chat_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_game_v1"("public_id" "text", "idempotency_key" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_game_v1"("public_id" "text", "idempotency_key" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_game_v1"("public_id" "text", "idempotency_key" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_game_v1"("payload" "jsonb", "idempotency_key" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_game_v1"("payload" "jsonb", "idempotency_key" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_game_v1"("payload" "jsonb", "idempotency_key" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_or_get_game_share_link_v1"("p_game_public_id" "text", "p_surface" "text", "p_campaign_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_or_get_game_share_link_v1"("p_game_public_id" "text", "p_surface" "text", "p_campaign_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_or_get_game_share_link_v1"("p_game_public_id" "text", "p_surface" "text", "p_campaign_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."deactivate_push_token_v1"("p_installation_id" "text", "p_expo_push_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."deactivate_push_token_v1"("p_installation_id" "text", "p_expo_push_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."deactivate_push_token_v1"("p_installation_id" "text", "p_expo_push_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."emit_game_mutation_event"("p_event_name" "text", "p_game_id" "uuid", "p_user_id" "uuid", "p_public_id" "text", "p_result_code" "text", "p_extra" "jsonb") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."emit_product_event_v1"("p_event_name" "text", "p_user_id" "uuid", "p_anonymous_id" "uuid", "p_public_id" "text", "p_resolved_game_id" "uuid", "p_link_id" "uuid", "p_session_id" "text", "p_environment" "text", "p_platform" "text", "p_metadata" "jsonb", "p_event_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."emit_product_event_v1"("p_event_name" "text", "p_user_id" "uuid", "p_anonymous_id" "uuid", "p_public_id" "text", "p_resolved_game_id" "uuid", "p_link_id" "uuid", "p_session_id" "text", "p_environment" "text", "p_platform" "text", "p_metadata" "jsonb", "p_event_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_game_lifecycle"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."generate_game_public_id"() FROM PUBLIC;



GRANT ALL ON TABLE "public"."games" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."games" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."ensure_game_chat"("p_game" "public"."games", "p_host_level" "text") FROM PUBLIC;



GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";
GRANT SELECT ON TABLE "public"."notification_preferences" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."ensure_notification_preferences_row"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_notification_preferences_row"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."game_resolution_state"("p_game" "public"."games") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."game_sharing_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."game_sharing_enabled"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."game_sharing_enabled"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_game_share_code"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."get_analytics_dashboard_firebase_v1"("p_range_days" integer, "p_park" "text", "p_level" "text", "p_game_type" "text", "p_segment" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_analytics_dashboard_firebase_v1"("p_range_days" integer, "p_park" "text", "p_level" "text", "p_game_type" "text", "p_segment" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_analytics_dashboard_v1"("p_range_days" integer, "p_park" "text", "p_level" "text", "p_game_type" "text", "p_segment" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_analytics_dashboard_v1"("p_range_days" integer, "p_park" "text", "p_level" "text", "p_game_type" "text", "p_segment" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_analytics_dashboard_v1"("p_range_days" integer, "p_park" "text", "p_level" "text", "p_game_type" "text", "p_segment" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_analytics_dashboard_v1"("p_range_days" integer, "p_park" "text", "p_level" "text", "p_game_type" "text", "p_segment" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_notification_preferences_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_notification_preferences_v1"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_notification_preferences_v1"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_games"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_games"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_games"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_games"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."growth_public_links_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."growth_public_links_enabled"() TO "anon";
GRANT ALL ON FUNCTION "public"."growth_public_links_enabled"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."growth_public_links_enabled"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_blocked_relationship"("p_left_user_id" "uuid", "p_right_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_blocked_relationship"("p_left_user_id" "uuid", "p_right_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_blocked_relationship"("p_left_user_id" "uuid", "p_right_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."host_first_name"("p_name" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."increment_players"("game_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_players"("game_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_players"("game_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_players"("game_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_confirmed_participant"("p_game_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_confirmed_participant"("p_game_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_confirmed_participant"("p_game_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_conversation_member"("p_chat_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_conversation_member"("p_chat_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_conversation_member"("p_chat_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_game_host"("p_game_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_game_host"("p_game_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_game_host"("p_game_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_public_game_visible"("p_game_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_public_game_visible"("p_game_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_public_game_visible"("p_game_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_public_game_visible"("p_game_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."join_game_v1"("public_id" "text", "idempotency_key" "uuid", "share_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_game_v1"("public_id" "text", "idempotency_key" "uuid", "share_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_game_v1"("public_id" "text", "idempotency_key" "uuid", "share_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."join_public_game"("p_game_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_public_game"("p_game_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_public_game"("p_game_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."leave_game_v1"("public_id" "text", "idempotency_key" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."leave_game_v1"("public_id" "text", "idempotency_key" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."leave_game_v1"("public_id" "text", "idempotency_key" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_game_resolution"("p_event_name" "text", "p_public_id" "text", "p_state" "text", "p_latency_ms" integer, "p_user_id" "uuid", "p_extra" "jsonb") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."maybe_emit_shared_game_join_completed_v1"("p_user_id" "uuid", "p_game_id" "uuid", "p_public_id" "text", "p_extra" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."maybe_emit_shared_game_join_completed_v1"("p_user_id" "uuid", "p_game_id" "uuid", "p_public_id" "text", "p_extra" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mutation_result"("p_code" "text", "p_resource_id" "uuid", "p_public_id" "text", "p_chat_id" "uuid", "p_players_enrolled" integer, "p_reason" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."normalize_push_permission_status"("p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."normalize_push_permission_status"("p_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."public_game_projection"("p_game" "public"."games") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."read_mutation_idempotency"("p_actor_id" "uuid", "p_operation" "text", "p_key" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."record_acquisition_attribution_v1"("p_anonymous_id" "uuid", "p_public_id" "text", "p_share_code" "text", "p_provider" "text", "p_match_type" "text", "p_touch_type" "text", "p_confidence" "text", "p_idempotency_key" "text", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_acquisition_attribution_v1"("p_anonymous_id" "uuid", "p_public_id" "text", "p_share_code" "text", "p_provider" "text", "p_match_type" "text", "p_touch_type" "text", "p_confidence" "text", "p_idempotency_key" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_acquisition_attribution_v1"("p_anonymous_id" "uuid", "p_public_id" "text", "p_share_code" "text", "p_provider" "text", "p_match_type" "text", "p_touch_type" "text", "p_confidence" "text", "p_idempotency_key" "text", "p_metadata" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."register_push_token_v1"("p_expo_push_token" "text", "p_installation_id" "text", "p_platform" "text", "p_permission_status" "text", "p_permission_granted" boolean, "p_device_name" "text", "p_app_version" "text", "p_native_build_version" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."register_push_token_v1"("p_expo_push_token" "text", "p_installation_id" "text", "p_platform" "text", "p_permission_status" "text", "p_permission_granted" boolean, "p_device_name" "text", "p_app_version" "text", "p_native_build_version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_push_token_v1"("p_expo_push_token" "text", "p_installation_id" "text", "p_platform" "text", "p_permission_status" "text", "p_permission_granted" boolean, "p_device_name" "text", "p_app_version" "text", "p_native_build_version" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_game_for_mutation"("p_game_ref" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."resolve_game_for_viewer_v1"("public_id" "text", "share_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_game_for_viewer_v1"("public_id" "text", "share_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_game_for_viewer_v1"("public_id" "text", "share_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_game_row"("p_game_ref" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."resolve_public_game_v1"("public_id" "text", "share_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_public_game_v1"("public_id" "text", "share_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_public_game_v1"("public_id" "text", "share_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_public_game_v1"("public_id" "text", "share_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."revoke_game_share_link_v1"("p_share_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_game_share_link_v1"("p_share_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_game_share_link_v1"("p_share_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."store_mutation_idempotency"("p_actor_id" "uuid", "p_operation" "text", "p_key" "uuid", "p_resource_id" "uuid", "p_result" "jsonb") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."sync_players_enrolled"("p_game_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."transition_game_status"("p_game_id" "uuid", "p_next_status" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transition_game_status"("p_game_id" "uuid", "p_next_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transition_game_status"("p_game_id" "uuid", "p_next_status" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_notification_preferences_v1"("p_patch" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_notification_preferences_v1"("p_patch" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_notification_preferences_v1"("p_patch" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."user_meets_minimum_onboarding_v1"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_meets_minimum_onboarding_v1"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_meets_minimum_onboarding_v1"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_join_eligibility"("p_user_id" "uuid", "p_game" "public"."games") FROM PUBLIC;



GRANT ALL ON TABLE "public"."acquisition_attribution_events" TO "service_role";



GRANT ALL ON TABLE "public"."admin_audit_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."admin_audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."admin_audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."admin_audit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."admin_users" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_ai_briefs" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_connectors" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."analytics_identity_links" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_ingestion_runs" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_parks" TO "service_role";



GRANT ALL ON TABLE "public"."app_store_daily_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."blocked_users" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."blocked_users" TO "authenticated";



GRANT ALL ON TABLE "public"."chat" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."chat" TO "authenticated";



GRANT ALL ON TABLE "public"."community_posts" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_members" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."conversation_members" TO "authenticated";



GRANT ALL ON TABLE "public"."court_outreach_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."game_outcomes" TO "service_role";
GRANT SELECT ON TABLE "public"."game_outcomes" TO "authenticated";



GRANT ALL ON TABLE "public"."game_players" TO "service_role";
GRANT SELECT,INSERT,DELETE ON TABLE "public"."game_players" TO "authenticated";



GRANT ALL ON TABLE "public"."game_requests" TO "service_role";
GRANT SELECT ON TABLE "public"."game_requests" TO "authenticated";



GRANT ALL ON TABLE "public"."game_share_links" TO "service_role";
GRANT SELECT ON TABLE "public"."game_share_links" TO "authenticated";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."growth_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."growth_flags" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."messages" TO "authenticated";



GRANT ALL ON TABLE "public"."moderation_events" TO "service_role";



GRANT ALL ON TABLE "public"."mutation_idempotency" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "service_role";
GRANT SELECT,DELETE,UPDATE ON TABLE "public"."notifications" TO "authenticated";



GRANT ALL ON TABLE "public"."product_events" TO "service_role";



GRANT ALL ON TABLE "public"."push_devices" TO "service_role";
GRANT SELECT ON TABLE "public"."push_devices" TO "authenticated";



GRANT ALL ON TABLE "public"."reports" TO "service_role";
GRANT INSERT ON TABLE "public"."reports" TO "authenticated";



GRANT ALL ON TABLE "public"."users" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."users" TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";







