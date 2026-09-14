-- Stop link_user_acquisition_v1 ordering by product_events.received_at.
--
-- The column was dropped from prod by hand, but this function still names it in
-- the ORDER BY of its first-touch lookup, so every call fails with 42703.
--
-- The body below is the live prod definition (pg_get_functiondef) with
-- `pe.received_at` removed from that ORDER BY, leaving `pe.occurred_at, pe.id`.
-- Nothing else is changed.
CREATE OR REPLACE FUNCTION public.link_user_acquisition_v1(p_anonymous_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_signup_at timestamptz;
  v_source text;
  v_existing_source text;
  v_existing_anonymous_id uuid;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if p_anonymous_id is null then
    raise exception using
      errcode = '22023',
      message = 'anonymous_id is required.';
  end if;

  select created_at
  into v_signup_at
  from auth.users
  where id = v_user_id;

  if v_signup_at is null then
    raise exception using
      errcode = '22023',
      message = 'Authenticated user was not found.';
  end if;

  select coalesce(nullif(trim(pe.channel_hint), ''), 'unknown')
  into v_source
  from public.product_events pe
  where pe.event_name in (
    'game_link_opened',
    'shared_game_landing_viewed',
    'app_store_redirect_started'
  )
    and pe.metadata->>'anonymous_id' = p_anonymous_id::text
    and pe.occurred_at <= v_signup_at
  order by pe.occurred_at, pe.id
  limit 1;

  v_source := coalesce(v_source, 'unknown');

  if v_source not in (
    'reddit',
    'facebook',
    'luma',
    'eventbrite',
    'instagram',
    'linkedin',
    'whatsapp',
    'newsletter',
    'blog',
    'qr',
    'referral',
    'direct',
    'unknown'
  ) then
    v_source := 'unknown';
  end if;

  select first_touch_source, acquisition_anonymous_id
  into v_existing_source, v_existing_anonymous_id
  from public.users
  where id = v_user_id
  for update;

  if v_existing_source is distinct from 'unknown'
     or (
       v_existing_anonymous_id is not null
       and v_existing_anonymous_id is distinct from p_anonymous_id
     ) then
    return jsonb_build_object(
      'ok', true,
      'already_linked', true,
      'first_touch_source', v_existing_source
    );
  end if;

  update public.users
  set first_touch_source = v_source,
      acquisition_anonymous_id = coalesce(acquisition_anonymous_id, p_anonymous_id)
  where id = v_user_id
    and first_touch_source = 'unknown'
    and (
      acquisition_anonymous_id is null
      or acquisition_anonymous_id = p_anonymous_id
    );

  return jsonb_build_object(
    'ok', true,
    'already_linked', false,
    'first_touch_source', v_source
  );
end;
$function$
;
