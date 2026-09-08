-- Remove product_events.received_at.
--
-- It was written by every producer and read by nothing: no query, no RPC, no
-- index, no application code. Because no producer ever sends occurred_at, the
-- column also held the same value as occurred_at and created_at on every row,
-- so it carried no information even in principle.
--
-- session_id is NOT dropped here. Its only reader
-- (get_analytics_dashboard_firebase_v1) could not be verified against the live
-- database, so removing it is deferred until that definition is confirmed.

-- Redefined before the column goes away so the function is never left
-- referencing a dropped column. Unchanged apart from the received_at insert
-- target; p_session_id is deliberately retained so the seven existing call
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

alter table public.product_events
  drop column if exists received_at;
