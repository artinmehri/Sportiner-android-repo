-- Device + network context on product_events, and channel_hint promoted to the
-- canonical acquisition channel.
--
-- channel_hint was previously "manually tagged marketing traffic, NULL otherwise".
-- It now carries every acquisition channel, including 'app' for organic in-app
-- opens and 'unknown' for a ch= tag we do not recognise. Queries that used
-- `channel_hint is not null` to mean "marketing traffic" must filter on the seven
-- marketing values explicitly -- see supabase/queries/game_link_channel_opens.sql.
--
-- acquisition_source / source / campaign_id remain unwritten by every producer.
-- They are left untouched here rather than dropped.

alter table public.product_events
  add column if not exists device_type text,
  add column if not exists device_language text,
  add column if not exists screen_resolution text,
  add column if not exists connection_type text,
  add column if not exists isp_name text,
  add column if not exists ip_address inet;

-- Closed vocabularies, matching the existing environment/platform constraints on
-- this table. The edge function normalises against the same sets before writing,
-- so a rejected value is a producer bug rather than an ingest outage.
alter table public.product_events
  drop constraint if exists product_events_device_type_check;
alter table public.product_events
  add constraint product_events_device_type_check
    check (
      device_type is null
      or device_type = any (array['mobile'::text, 'tablet'::text, 'desktop'::text, 'unknown'::text])
    );

alter table public.product_events
  drop constraint if exists product_events_connection_type_check;
alter table public.product_events
  add constraint product_events_connection_type_check
    check (
      connection_type is null
      or connection_type = any (
        array['slow-2g'::text, '2g'::text, '3g'::text, '4g'::text, 'unknown'::text]
      )
    );

comment on column public.product_events.device_type is
  'Browser-derived form factor for web landing traffic: mobile, tablet, desktop, unknown. Null for app and server events.';

comment on column public.product_events.device_language is
  'BCP-47 tag reported by the browser (navigator.language), e.g. en-US. Null when unavailable.';

comment on column public.product_events.screen_resolution is
  'Screen size as WIDTHxHEIGHT in CSS pixels, e.g. 390x844. Text because it is a display attribute, never used arithmetically.';

comment on column public.product_events.connection_type is
  'navigator.connection.effectiveType. Chromium-only; null on Safari and Firefox, which is most of this landing page''s traffic.';

comment on column public.product_events.isp_name is
  'Reserved for IP-to-ASN enrichment. No lookup provider is integrated yet, so this is always null today.';

comment on column public.product_events.ip_address is
  'Visitor IP for web landing acquisition events only. Asserted by the game-landing function over a shared secret and never accepted from an untrusted caller. Null for app and server events.';

comment on column public.product_events.channel_hint is
  'Canonical acquisition channel. Marketing tags from ?ch= (reddit, facebook, luma, eventbrite, instagram, linkedin, whatsapp), plus app for organic in-app opens and unknown for an unrecognised tag.';

comment on table public.product_events is
  'First-party product analytics. channel_hint is the canonical acquisition channel; device_type/device_language/screen_resolution/connection_type/ip_address carry web landing context.';

-- No indexes on the new columns. They are descriptive attributes read via
-- group-by, not selective filter keys, and this table already carries an index on
-- acquisition_source that has never had a row written to it.
