-- product_events foundation for game-link `ch=` channel measurement.
-- product-event edge function writes here via service_role.

create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text,
  user_email text,
  event_name text not null,
  game_id text,
  sport text,
  park_slug text,
  route text,
  source text,
  session_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  app_version text,
  acquisition_source text,
  campaign_id text,
  share_id text,
  user_id uuid references public.users(id) on delete set null,
  auth_provider text,
  event_id uuid not null default gen_random_uuid(),
  event_version integer not null default 1,
  anonymous_id uuid,
  received_at timestamptz not null default now(),
  environment text not null default 'production',
  link_id uuid,
  occurred_at timestamptz not null default now(),
  resolved_game_id uuid,
  platform text,
  channel_hint text,
  constraint product_events_environment_check
    check (environment = any (array['development'::text, 'preview'::text, 'production'::text])),
  constraint product_events_platform_check
    check (
      platform is null
      or platform = any (array['ios'::text, 'android'::text, 'web'::text, 'server'::text])
    )
);

create unique index if not exists product_events_event_id_uidx
  on public.product_events using btree (event_id);

create index if not exists idx_product_events_created_at
  on public.product_events using btree (created_at);

create index if not exists idx_product_events_event_name
  on public.product_events using btree (event_name);

create index if not exists product_events_event_name_occurred_at_idx
  on public.product_events using btree (event_name, occurred_at desc);

create index if not exists product_events_environment_occurred_at_idx
  on public.product_events using btree (environment, occurred_at desc);

create index if not exists product_events_anonymous_id_occurred_at_idx
  on public.product_events using btree (anonymous_id, occurred_at desc)
  where anonymous_id is not null;

create index if not exists product_events_user_id_occurred_at_idx
  on public.product_events using btree (user_id, occurred_at desc)
  where user_id is not null;

create index if not exists product_events_channel_hint_occurred_at_idx
  on public.product_events using btree (channel_hint, occurred_at desc)
  where channel_hint is not null;

create index if not exists idx_product_events_game_id
  on public.product_events using btree (game_id);

create index if not exists idx_product_events_share_id
  on public.product_events using btree (share_id);

alter table public.product_events enable row level security;

drop policy if exists "Service role full access" on public.product_events;
create policy "Service role full access"
  on public.product_events
  to service_role
  using (true)
  with check (true);

grant all on table public.product_events to service_role;

comment on table public.product_events is
  'First-party product analytics. channel_hint stores manually tagged game-link sources (reddit/facebook/luma/eventbrite/instagram/linkedin/whatsapp).';

comment on column public.product_events.channel_hint is
  'Acquisition channel from ?ch= on shared game links (reddit, facebook, luma, eventbrite, instagram, linkedin, whatsapp).';
