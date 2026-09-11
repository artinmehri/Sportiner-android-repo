-- Stop emit_product_event_v1 writing product_events.received_at.
--
-- The column was dropped from prod by hand; the function was not redefined with
-- it, so its insert still names a column that no longer exists. Every call has
-- been failing with 42703 since 2026-09-08. The failure is invisible: the
-- function's own `exception when others` handler downgrades it to a warning and
-- returns void, so all seven call sites are told the emit succeeded while the
-- row is discarded.
--
-- The body below is the live prod definition with `received_at` removed from the
-- insert column list and its matching `now()` removed from the values list.
-- Nothing else is changed -- the signature, the metadata assembly, the
-- on-conflict clause and the warning-swallowing exception block are all carried
-- over verbatim, including p_session_id, which is retained so the existing call
-- sites keep working.
create or replace function public.emit_product_event_v1(
  p_event_name text,
  p_user_id uuid default null,
  p_anonymous_id uuid default null,
  p_public_id text default null,
  p_resolved_game_id uuid default null,
  p_link_id uuid default null,
  p_session_id text default null,
  p_environment text default 'production',
  p_platform text default 'server',
  p_metadata jsonb default '{}'::jsonb,
  p_event_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_event_id uuid := coalesce(p_event_id, gen_random_uuid());
  v_environment text := case
    when p_environment in ('development', 'preview', 'production') then p_environment
    else 'production'
  end;
  v_metadata jsonb := jsonb_strip_nulls(
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'anonymous_id', p_anonymous_id,
      'event_version', 1,
      'environment', v_environment,
      'resolved_game_id', p_resolved_game_id,
      'link_id', p_link_id
    )
  );
begin
  insert into public.product_events (
    event_id,
    event_name,
    user_id,
    game_id,
    session_id,
    platform,
    metadata,
    occurred_at,
    created_at
  )
  values (
    v_event_id,
    p_event_name,
    p_user_id,
    left(coalesce(p_public_id, p_resolved_game_id::text, ''), 160),
    left(coalesce(p_session_id, ''), 160),
    p_platform,
    v_metadata,
    now(),
    now()
  )
  on conflict (event_id) do nothing;
exception
  when others then
    raise warning 'emit_product_event_v1 failed: event_name=%, event_id=%, sqlstate=%, message=%',
      p_event_name,
      v_event_id,
      sqlstate,
      sqlerrm;
end;
$function$;
