-- SPO-261: Normalize acquisition_attribution_events + server record RPC.
-- Table is empty in production; recreate to the verified-attribution shape.
-- Join conversion emits shared_game_join_completed only when link.game_id matches.

begin;

insert into public.growth_flags (key, enabled, note)
values (
  'acquisition_attribution',
  true,
  'When false, record_acquisition_attribution_v1 is a no-op. Universal Links still work.'
)
on conflict (key) do nothing;

create or replace function public.acquisition_attribution_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select enabled from public.growth_flags where key = 'acquisition_attribution'),
    true
  );
$$;

revoke all on function public.acquisition_attribution_enabled() from public;
grant execute on function public.acquisition_attribution_enabled() to anon, authenticated, service_role;

drop table if exists public.acquisition_attribution_events cascade;

create table public.acquisition_attribution_events (
  id uuid primary key default gen_random_uuid(),
  anonymous_id uuid not null,
  user_id uuid null references auth.users (id) on delete set null,
  link_id uuid null references public.game_share_links (id) on delete set null,
  provider text not null,
  match_type text not null,
  touch_type text not null,
  occurred_at timestamptz not null default now(),
  confidence text not null,
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  constraint acquisition_attribution_provider_check
    check (provider in ('branch', 'canonical_link', 'manual', 'unknown')),
  constraint acquisition_attribution_match_type_check
    check (
      match_type in (
        'nativelink',
        'universal_link',
        'custom_scheme',
        'manual_fallback',
        'none',
        'error'
      )
    ),
  constraint acquisition_attribution_touch_type_check
    check (touch_type in ('first', 'last', 'install', 'signup', 'recovery')),
  constraint acquisition_attribution_confidence_check
    check (confidence in ('high', 'medium', 'low')),
  constraint acquisition_attribution_idempotency_key_uidx unique (idempotency_key)
);

create index acquisition_attribution_anonymous_occurred_idx
  on public.acquisition_attribution_events (anonymous_id, occurred_at desc);

create index acquisition_attribution_user_occurred_idx
  on public.acquisition_attribution_events (user_id, occurred_at desc)
  where user_id is not null;

create index acquisition_attribution_link_occurred_idx
  on public.acquisition_attribution_events (link_id, occurred_at desc)
  where link_id is not null;

comment on table public.acquisition_attribution_events is
  'Server-validated acquisition touches. No raw provider payloads; link_id resolved server-side only.';

alter table public.acquisition_attribution_events enable row level security;
alter table public.acquisition_attribution_events force row level security;

revoke all on table public.acquisition_attribution_events from public, anon, authenticated;
grant all on table public.acquisition_attribution_events to service_role;

-- ---------------------------------------------------------------------------
-- record_acquisition_attribution_v1
-- Client may send public_id + share_code hints only. Never trust client link_id,
-- user_id, host_id, or game_id.
-- ---------------------------------------------------------------------------
create or replace function public.record_acquisition_attribution_v1(
  p_anonymous_id uuid,
  p_public_id text,
  p_share_code text default null,
  p_provider text default 'canonical_link',
  p_match_type text default 'universal_link',
  p_touch_type text default 'recovery',
  p_confidence text default 'medium',
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

revoke all on function public.record_acquisition_attribution_v1(
  uuid, text, text, text, text, text, text, text, jsonb
) from public;
grant execute on function public.record_acquisition_attribution_v1(
  uuid, text, text, text, text, text, text, text, jsonb
) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Emit shared_game_join_completed only for attributed same-game joins (30d).
-- ---------------------------------------------------------------------------
create or replace function public.maybe_emit_shared_game_join_completed_v1(
  p_user_id uuid,
  p_game_id uuid,
  p_public_id text,
  p_extra jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

revoke all on function public.maybe_emit_shared_game_join_completed_v1(
  uuid, uuid, text, jsonb
) from public;
grant execute on function public.maybe_emit_shared_game_join_completed_v1(
  uuid, uuid, text, jsonb
) to service_role;

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

commit;
