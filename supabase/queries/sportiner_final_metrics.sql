-- Sportiner final product metrics.
-- Test games are excluded. A participant is the host or a current game_players
-- member row. completed_at is the backend completion timestamp.

with completed_games as (
  select g.id, g.public_id, g.host_id, g.completed_at
  from public.games g
  where g.status = 'completed'
    and coalesce(g.is_test, false) is false
), completed_participants as (
  select id as game_id, host_id as user_id
  from completed_games
  union
  select cg.id, gp.user_id
  from completed_games cg
  join public.game_players gp on gp.game_id = cg.id
  where gp.role = 'member'
), completed_user_counts as (
  select u.id as user_id, count(distinct cp.game_id)::int as completed_games
  from public.users u
  left join completed_participants cp on cp.user_id = u.id
  group by u.id
), successful_host_counts as (
  select host_id as user_id, count(*)::int as completed_hosted_games
  from completed_games
  group by host_id
), viewed_games as (
  select distinct coalesce(pe.game_id, pe.metadata->>'game_public_id') as public_id
  from public.product_events pe
  where pe.event_name = 'game_viewed'
    and coalesce(pe.game_id, pe.metadata->>'game_public_id') is not null
), joined_games as (
  select distinct pe.game_id as public_id
  from public.product_events pe
  where pe.event_name = 'game_joined'
    and pe.game_id is not null
), onboarding as (
  select
    count(*) filter (where event_name = 'onboarding_started')::int as starts,
    count(*) filter (where event_name = 'onboarding_completed')::int as completions
  from public.product_events
)
select jsonb_build_object(
  'total_users', (select count(*)::int from public.users),
  'total_completed_games', (select count(*)::int from completed_games),
  'completed_games_last_7_days', (
    select count(*)::int from completed_games
    where completed_at >= now() - interval '7 days'
  ),
  'unique_players_last_7_days', (
    select count(distinct cp.user_id)::int
    from completed_games cg
    join completed_participants cp on cp.game_id = cg.id
    where cg.completed_at >= now() - interval '7 days'
  ),
  'users_with_exactly_1_completed_game', (
    select count(*)::int from completed_user_counts where completed_games = 1
  ),
  'users_with_2_plus_completed_games', (
    select count(*)::int from completed_user_counts where completed_games >= 2
  ),
  'repeat_player_rate', (
    select coalesce(
      round(
        count(*) filter (where completed_games >= 2)::numeric /
        nullif(count(*) filter (where completed_games >= 1), 0),
        4
      ),
      0
    )
    from completed_user_counts
  ),
  'games_hosted', (
    select count(*)::int from public.games where coalesce(is_test, false) is false
  ),
  'successful_games_hosted', (select count(*)::int from completed_games),
  'first_time_successful_hosts', (
    select count(*)::int from successful_host_counts where completed_hosted_games >= 1
  ),
  'repeat_successful_hosts', (
    select count(*)::int from successful_host_counts where completed_hosted_games >= 2
  ),
  'game_views', (
    select count(*)::int from public.product_events where event_name = 'game_viewed'
  ),
  'game_view_to_join_conversion', (
    select coalesce(
      round(
        (select count(*) from joined_games j join viewed_games v using (public_id))::numeric /
        nullif((select count(*) from viewed_games), 0),
        4
      ),
      0
    )
  ),
  'join_to_completed_game_conversion', (
    select coalesce(
      round(
        (select count(*) from joined_games j join completed_games cg on cg.public_id = j.public_id)::numeric /
        nullif((select count(*) from joined_games), 0),
        4
      ),
      0
    )
  ),
  'onboarding_started', (select starts from onboarding),
  'onboarding_completed', (select completions from onboarding),
  'onboarding_completion_rate', (
    select coalesce(round(completions::numeric / nullif(starts, 0), 4), 0)
    from onboarding
  ),
  'game_joins', (
    select count(*)::int from public.product_events where event_name = 'game_joined'
  )
) as sportiner_final_metrics;
