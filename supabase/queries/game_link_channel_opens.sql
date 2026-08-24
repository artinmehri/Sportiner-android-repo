-- Game-link channel measurement (`?ch=` tags on shared game URLs)
-- Codes: r=reddit, f=facebook, l=luma, e=eventbrite, i=instagram, lin=linkedin, w=whatsapp
-- Normal in-app shares have no ch= and will not appear in these queries.

-- Opens / landing / install redirects by channel and platform (last 30 days)
select
  channel_hint,
  platform,
  count(*) as events,
  count(*) filter (where event_name = 'game_link_opened') as link_opens,
  count(*) filter (where event_name = 'shared_game_landing_viewed') as landing_views,
  count(*) filter (where event_name = 'app_store_redirect_started') as store_redirects
from public.product_events
where event_name in (
    'game_link_opened',
    'shared_game_landing_viewed',
    'app_store_redirect_started'
  )
  and channel_hint is not null
  and created_at > now() - interval '30 days'
group by 1, 2
order by events desc;

-- Per-game breakdown for tagged opens
select
  coalesce(metadata->>'game_public_id', game_id) as public_id,
  channel_hint,
  platform,
  count(*) as link_opens
from public.product_events
where event_name = 'game_link_opened'
  and channel_hint is not null
  and created_at > now() - interval '30 days'
group by 1, 2, 3
order by link_opens desc;

-- Human vs preview-bot opens for tagged web traffic
select
  channel_hint,
  metadata->>'user_agent_class' as user_agent_class,
  count(*) as link_opens
from public.product_events
where event_name = 'game_link_opened'
  and channel_hint is not null
  and created_at > now() - interval '30 days'
group by 1, 2
order by link_opens desc;

-- Signed-in iOS/Android openers (Supabase user_id attached from session JWT)
select
  pe.user_id,
  u.name,
  pe.channel_hint,
  pe.platform,
  coalesce(pe.metadata->>'game_public_id', pe.game_id) as public_id,
  pe.occurred_at
from public.product_events pe
left join public.users u on u.id = pe.user_id
where pe.event_name = 'game_link_opened'
  and pe.user_id is not null
  and pe.created_at > now() - interval '30 days'
order by pe.occurred_at desc;
