-- SPO-242 restores least-privilege access for core growth-loop data.
-- Compatible phase: direct public-game joins remain available until the RPC cutover task.


set local search_path = public, auth, extensions, pg_catalog;

create index if not exists conversation_members_user_chat_idx
  on public.conversation_members using btree (id, chat_id);
create index if not exists conversation_members_chat_user_idx
  on public.conversation_members using btree (chat_id, id);
create index if not exists conversation_members_game_user_idx
  on public.conversation_members using btree (game_id, id);
create index if not exists game_players_user_game_idx
  on public.game_players using btree (user_id, game_id);
create index if not exists game_players_game_user_idx
  on public.game_players using btree (game_id, user_id);
create index if not exists games_public_time_idx
  on public.games using btree (is_public, "time" desc);
create index if not exists messages_chat_created_idx
  on public.messages using btree (chat_id, created_at);
create index if not exists notifications_user_created_idx
  on public.notifications using btree (user_id, created_at desc);

create or replace function public.has_blocked_relationship(
  p_left_user_id uuid,
  p_right_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(p_left_user_id is not null and p_right_user_id is not null and exists (
    select 1
    from public.blocked_users bu
    where (bu.blocker_id = p_left_user_id and bu.blocked_id = p_right_user_id)
       or (bu.blocker_id = p_right_user_id and bu.blocked_id = p_left_user_id)
  ), false);
$$;

create or replace function public.is_game_host(
  p_game_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(p_user_id is not null and exists (
    select 1
    from public.games g
    where g.id = p_game_id
      and g.host_id = p_user_id
  ), false);
$$;

create or replace function public.is_confirmed_participant(
  p_game_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(p_user_id is not null and exists (
    select 1
    from public.game_players gp
    where gp.game_id = p_game_id
      and gp.user_id = p_user_id
  ), false);
$$;

create or replace function public.is_conversation_member(
  p_chat_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(p_user_id is not null and exists (
    select 1
    from public.conversation_members cm
    where cm.chat_id = p_chat_id
      and cm.id = p_user_id
  ), false);
$$;

create or replace function public.is_public_game_visible(
  p_game_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.games g
    where g.id = p_game_id
      and g.is_public is true
      and (
        p_user_id is null
        or g.host_id is null
        or not public.has_blocked_relationship(g.host_id, p_user_id)
      )
  );
$$;

create or replace function public.can_access_chat(
  p_chat_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
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

create or replace function public.get_public_games()
returns table (
  id uuid,
  title text,
  description text,
  type text,
  location_name text,
  game_time timestamp with time zone,
  level text,
  game_capacity smallint,
  is_booked boolean,
  payment_amount integer,
  image text,
  court_type text,
  is_paid boolean,
  players_enrolled integer,
  host_id uuid,
  host_name text,
  host_profile_picture text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    g.id,
    g.title,
    g.description,
    g.type,
    g.location_name,
    g."time",
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
    u.profile_picture as host_profile_picture
  from public.games g
  left join public.users u on u.id = g.host_id
  where g.is_public is true
    and (
      auth.uid() is null
      or g.host_id is null
      or not public.has_blocked_relationship(g.host_id, auth.uid())
    )
  order by g."time" nulls last, g.created_at desc;
$$;

do $$
declare
  target_table text;
  target_policy record;
  rls_tables text[] := array[
    'acquisition_attribution_events',
    'admin_audit_log',
    'admin_users',
    'analytics_ai_briefs',
    'analytics_connectors',
    'analytics_ingestion_runs',
    'analytics_parks',
    'app_store_daily_metrics',
    'blocked_users',
    'chat',
    'community_posts',
    'conversation_members',
    'court_outreach_sessions',
    'game_outcomes',
    'game_players',
    'game_requests',
    'games',
    'messages',
    'moderation_events',
    'notifications',
    'product_events',
    'reports',
    'users'
  ];
  replace_policy_tables text[] := array[
    'blocked_users',
    'chat',
    'conversation_members',
    'game_outcomes',
    'game_players',
    'game_requests',
    'games',
    'messages',
    'moderation_events',
    'notifications',
    'reports',
    'users'
  ];
begin
  foreach target_table in array rls_tables loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('alter table public.%I force row level security', target_table);
  end loop;

  for target_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any(replace_policy_tables)
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      target_policy.policyname,
      target_policy.schemaname,
      target_policy.tablename
    );
  end loop;
end $$;

revoke all on function public.has_blocked_relationship(uuid, uuid) from public;
revoke all on function public.is_game_host(uuid, uuid) from public;
revoke all on function public.is_confirmed_participant(uuid, uuid) from public;
revoke all on function public.is_conversation_member(uuid, uuid) from public;
revoke all on function public.is_public_game_visible(uuid, uuid) from public;
revoke all on function public.can_access_chat(uuid, uuid) from public;
revoke all on function public.get_public_games() from public;
revoke all on function public.increment_players(uuid) from public;

grant execute on function public.has_blocked_relationship(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_game_host(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_confirmed_participant(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_public_game_visible(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.can_access_chat(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_public_games() to anon, authenticated, service_role;
grant execute on function public.increment_players(uuid) to service_role;

revoke all on table
  public.acquisition_attribution_events,
  public.admin_audit_log,
  public.admin_users,
  public.analytics_ai_briefs,
  public.analytics_connectors,
  public.analytics_ingestion_runs,
  public.analytics_parks,
  public.app_store_daily_metrics,
  public.blocked_users,
  public.chat,
  public.community_posts,
  public.conversation_members,
  public.court_outreach_sessions,
  public.game_outcomes,
  public.game_players,
  public.game_requests,
  public.games,
  public.messages,
  public.moderation_events,
  public.notifications,
  public.product_events,
  public.reports,
  public.users
from anon;
revoke all on table
  public.acquisition_attribution_events,
  public.admin_audit_log,
  public.admin_users,
  public.analytics_ai_briefs,
  public.analytics_connectors,
  public.analytics_ingestion_runs,
  public.analytics_parks,
  public.app_store_daily_metrics,
  public.blocked_users,
  public.chat,
  public.community_posts,
  public.conversation_members,
  public.court_outreach_sessions,
  public.game_outcomes,
  public.game_players,
  public.game_requests,
  public.games,
  public.messages,
  public.moderation_events,
  public.notifications,
  public.product_events,
  public.reports,
  public.users
from authenticated;

grant select, insert, update, delete on table public.blocked_users to authenticated;
grant select, insert, update, delete on table public.chat to authenticated;
grant select, insert, update, delete on table public.conversation_members to authenticated;
grant select on table public.game_outcomes to authenticated;
grant select, insert, delete on table public.game_players to authenticated;
grant select on table public.game_requests to authenticated;
grant select, insert, update, delete on table public.games to authenticated;
grant select, insert, update, delete on table public.messages to authenticated;
grant select, update, delete on table public.notifications to authenticated;
grant insert on table public.reports to authenticated;
grant select, insert, update on table public.users to authenticated;

grant all privileges on table
  public.acquisition_attribution_events,
  public.admin_audit_log,
  public.admin_users,
  public.analytics_ai_briefs,
  public.analytics_connectors,
  public.analytics_ingestion_runs,
  public.analytics_parks,
  public.app_store_daily_metrics,
  public.blocked_users,
  public.chat,
  public.community_posts,
  public.conversation_members,
  public.court_outreach_sessions,
  public.game_outcomes,
  public.game_players,
  public.game_requests,
  public.games,
  public.messages,
  public.moderation_events,
  public.notifications,
  public.product_events,
  public.reports,
  public.users
to service_role;
grant usage, select on sequence public.admin_audit_log_id_seq to service_role;
grant usage on schema public to anon, authenticated, service_role;

create policy "blocked_users_select_own"
  on public.blocked_users
  for select
  to authenticated
  using (blocker_id = auth.uid());

create policy "blocked_users_insert_own"
  on public.blocked_users
  for insert
  to authenticated
  with check (blocker_id = auth.uid() and blocked_id <> auth.uid());

create policy "blocked_users_delete_own"
  on public.blocked_users
  for delete
  to authenticated
  using (blocker_id = auth.uid());

create policy "users_select_authenticated"
  on public.users
  for select
  to authenticated
  using (
    id = auth.uid()
    or not public.has_blocked_relationship(id, auth.uid())
  );

create policy "users_insert_own"
  on public.users
  for insert
  to authenticated
  with check (id = auth.uid());

create policy "users_update_own"
  on public.users
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "games_select_authenticated_public_or_involved"
  on public.games
  for select
  to authenticated
  using (
    host_id = auth.uid()
    or public.is_confirmed_participant(id, auth.uid())
    or (
      is_public is true
      and (
        host_id is null
        or not public.has_blocked_relationship(host_id, auth.uid())
      )
    )
  );

create policy "games_insert_public_host"
  on public.games
  for insert
  to authenticated
  with check (
    host_id = auth.uid()
    and is_public is true
  );

create policy "games_update_host"
  on public.games
  for update
  to authenticated
  using (host_id = auth.uid())
  with check (
    host_id = auth.uid()
    and is_public is true
  );

create policy "games_delete_host"
  on public.games
  for delete
  to authenticated
  using (host_id = auth.uid());

create policy "game_players_select_visible_games"
  on public.game_players
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_game_host(game_id, auth.uid())
    or public.is_public_game_visible(game_id, auth.uid())
  );

create policy "game_players_insert_self_public_game"
  on public.game_players
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_public_game_visible(game_id, auth.uid())
  );

create policy "game_players_delete_self_or_host"
  on public.game_players
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_game_host(game_id, auth.uid())
  );

create policy "game_requests_select_legacy_parties"
  on public.game_requests
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_game_host(game_id, auth.uid())
  );

create policy "chat_select_members"
  on public.chat
  for select
  to authenticated
  using (public.can_access_chat(id, auth.uid()));

create policy "chat_insert_authenticated"
  on public.chat
  for insert
  to authenticated
  with check (auth.uid() is not null);

create policy "chat_update_members_or_host"
  on public.chat
  for update
  to authenticated
  using (public.can_access_chat(id, auth.uid()))
  with check (public.can_access_chat(id, auth.uid()));

create policy "chat_delete_game_host"
  on public.chat
  for delete
  to authenticated
  using (public.is_game_host(game_id, auth.uid()));

create policy "conversation_members_select_chat_members"
  on public.conversation_members
  for select
  to authenticated
  using (
    id = auth.uid()
    or public.can_access_chat(chat_id, auth.uid())
  );

create policy "conversation_members_insert_self_for_public_game"
  on public.conversation_members
  for insert
  to authenticated
  with check (
    id = auth.uid()
    and (
      public.is_game_host(game_id, auth.uid())
      or public.is_confirmed_participant(game_id, auth.uid())
      or public.is_public_game_visible(game_id, auth.uid())
    )
  );

create policy "conversation_members_update_own_read_state"
  on public.conversation_members
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "conversation_members_delete_self_or_host"
  on public.conversation_members
  for delete
  to authenticated
  using (
    id = auth.uid()
    or public.is_game_host(game_id, auth.uid())
  );

create policy "messages_select_chat_members"
  on public.messages
  for select
  to authenticated
  using (public.can_access_chat(chat_id, auth.uid()));

create policy "messages_insert_chat_members"
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_access_chat(chat_id, auth.uid())
  );

create policy "messages_update_own"
  on public.messages
  for update
  to authenticated
  using (
    sender_id = auth.uid()
    and public.can_access_chat(chat_id, auth.uid())
  )
  with check (
    sender_id = auth.uid()
    and public.can_access_chat(chat_id, auth.uid())
  );

create policy "messages_delete_own_or_host"
  on public.messages
  for delete
  to authenticated
  using (
    sender_id = auth.uid()
    or exists (
      select 1
      from public.chat c
      where c.id = messages.chat_id
        and public.is_game_host(c.game_id, auth.uid())
    )
  );

create policy "notifications_select_own"
  on public.notifications
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "notifications_update_own"
  on public.notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "notifications_delete_own"
  on public.notifications
  for delete
  to authenticated
  using (user_id = auth.uid());

create policy "game_outcomes_select_participants"
  on public.game_outcomes
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or confirmed_by = auth.uid()
    or cancelled_by = auth.uid()
    or public.is_game_host(game_id, auth.uid())
    or public.is_confirmed_participant(game_id, auth.uid())
  );

create policy "reports_insert_own"
  on public.reports
  for insert
  to authenticated
  with check (
    reporter_id = auth.uid()
    and coalesce(reported_user_id <> auth.uid(), true)
  );

create policy "moderation_events_select_own"
  on public.moderation_events
  for select
  to authenticated
  using (actor_id = auth.uid() or target_id = auth.uid());

create policy "service_role_full_access_blocked_users" on public.blocked_users for all to service_role using (true) with check (true);
create policy "service_role_full_access_chat" on public.chat for all to service_role using (true) with check (true);
create policy "service_role_full_access_conversation_members" on public.conversation_members for all to service_role using (true) with check (true);
create policy "service_role_full_access_game_players" on public.game_players for all to service_role using (true) with check (true);
create policy "service_role_full_access_game_requests" on public.game_requests for all to service_role using (true) with check (true);
create policy "service_role_full_access_games" on public.games for all to service_role using (true) with check (true);
create policy "service_role_full_access_messages" on public.messages for all to service_role using (true) with check (true);
create policy "service_role_full_access_moderation_events" on public.moderation_events for all to service_role using (true) with check (true);
create policy "service_role_full_access_notifications" on public.notifications for all to service_role using (true) with check (true);
create policy "service_role_full_access_reports" on public.reports for all to service_role using (true) with check (true);
create policy "service_role_full_access_users" on public.users for all to service_role using (true) with check (true);

