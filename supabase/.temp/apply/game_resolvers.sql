-- SPO-245: Safe public + authenticated game resolution contracts.
-- Public projection never returns internal IDs, exact coordinates, chat, or participants.


set local search_path = public, auth, extensions, pg_catalog;

-- ---------------------------------------------------------------------------
-- Kill switch + supporting index
-- ---------------------------------------------------------------------------

create table if not exists public.growth_flags (
  key text primary key,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  note text null
);

insert into public.growth_flags (key, enabled, note)
values (
  'growth_public_links',
  true,
  'When false, public/authenticated game resolvers return a generic maintenance state.'
)
on conflict (key) do nothing;

alter table public.growth_flags enable row level security;
alter table public.growth_flags force row level security;

drop policy if exists "growth_flags_select_authenticated" on public.growth_flags;
create policy "growth_flags_select_authenticated"
  on public.growth_flags
  for select
  to authenticated
  using (true);

drop policy if exists "service_role_full_access_growth_flags" on public.growth_flags;
create policy "service_role_full_access_growth_flags"
  on public.growth_flags
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.growth_flags from public, anon;
grant select on table public.growth_flags to authenticated;
grant all on table public.growth_flags to service_role;

create unique index if not exists games_public_id_key
  on public.games using btree (public_id);

create index if not exists blocked_users_blocker_blocked_idx
  on public.blocked_users using btree (blocker_id, blocked_id);

create index if not exists blocked_users_blocked_blocker_idx
  on public.blocked_users using btree (blocked_id, blocker_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.growth_public_links_enabled()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select enabled
      from public.growth_flags
      where key = 'growth_public_links'
    ),
    true
  );
$$;

create or replace function public.host_first_name(p_name text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select nullif(
    split_part(btrim(coalesce(p_name, '')), ' ', 1),
    ''
  );
$$;

create or replace function public.approximate_area_label(p_location_name text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when nullif(btrim(coalesce(p_location_name, '')), '') is null then 'Toronto'
    else 'Toronto'
  end;
$$;

create or replace function public.game_resolution_state(p_game public.games)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
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

create or replace function public.public_game_projection(p_game public.games)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
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

create or replace function public.resolve_game_row(p_game_ref text)
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

create or replace function public.log_game_resolution(
  p_event_name text,
  p_public_id text,
  p_state text,
  p_latency_ms integer,
  p_user_id uuid default null,
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
    left(coalesce(p_public_id, ''), 64),
    p_user_id,
    jsonb_strip_nulls(
      jsonb_build_object(
        'version', 1,
        'state', p_state,
        'latency_ms', p_latency_ms,
        'public_id', p_public_id
      ) || coalesce(p_extra, '{}'::jsonb)
    ),
    now()
  );
exception
  when others then
    -- Resolution must not fail because of telemetry.
    null;
end;
$$;

-- ---------------------------------------------------------------------------
-- resolve_public_game_v1 (anon + authenticated)
-- ---------------------------------------------------------------------------

create or replace function public.resolve_public_game_v1(
  public_id text,
  share_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
     and v_share is distinct from v_game.public_id then
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
$$;

-- ---------------------------------------------------------------------------
-- resolve_game_for_viewer_v1 (authenticated)
-- ---------------------------------------------------------------------------

create or replace function public.resolve_game_for_viewer_v1(
  public_id text,
  share_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.growth_public_links_enabled() from public;
revoke all on function public.host_first_name(text) from public;
revoke all on function public.approximate_area_label(text) from public;
revoke all on function public.game_resolution_state(public.games) from public;
revoke all on function public.public_game_projection(public.games) from public;
revoke all on function public.resolve_game_row(text) from public;
revoke all on function public.log_game_resolution(text, text, text, integer, uuid, jsonb) from public;
revoke all on function public.resolve_public_game_v1(text, text) from public;
revoke all on function public.resolve_game_for_viewer_v1(text, text) from public;

grant execute on function public.growth_public_links_enabled() to anon, authenticated, service_role;
grant execute on function public.resolve_public_game_v1(text, text) to anon, authenticated, service_role;
grant execute on function public.resolve_game_for_viewer_v1(text, text) to authenticated, service_role;

