-- SPO-264: Per-user notification preferences + get/update RPCs.

begin;

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  chat_messages boolean not null default true,
  message_previews boolean not null default false,
  game_reminders boolean not null default true,
  host_updates boolean not null default true,
  nearby_games boolean not null default false,
  favourite_park_games boolean not null default false,
  marketing_updates boolean not null default false,
  radius_meters integer not null default 5000
    check (radius_meters in (2000, 5000, 10000)),
  quiet_hours_enabled boolean not null default true,
  quiet_start time not null default '21:00',
  quiet_end time not null default '08:00',
  timezone text not null default 'UTC',
  primer_state text not null default 'not_shown'
    check (primer_state in ('not_shown', 'shown', 'accepted', 'dismissed', 'snoozed')),
  primer_last_shown_at timestamptz,
  primer_snooze_until timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists notification_preferences_chat_opt_in_idx
  on public.notification_preferences (user_id)
  where chat_messages = true;

comment on table public.notification_preferences is
  'SPO-264 product-level notification controls. OS permission is separate; discovery/marketing default off.';

alter table public.notification_preferences enable row level security;
alter table public.notification_preferences force row level security;

drop policy if exists notification_preferences_select_own on public.notification_preferences;
create policy notification_preferences_select_own
  on public.notification_preferences
  for select
  to authenticated
  using (user_id = auth.uid());

-- Writes go through security-definer RPC only.
revoke all on table public.notification_preferences from public, anon, authenticated;
grant select on table public.notification_preferences to authenticated;
grant all on table public.notification_preferences to service_role;

create or replace function public.touch_notification_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists notification_preferences_touch_updated_at on public.notification_preferences;
create trigger notification_preferences_touch_updated_at
  before update on public.notification_preferences
  for each row
  execute function public.touch_notification_preferences_updated_at();

create or replace function public.ensure_notification_preferences_row(p_user_id uuid)
returns public.notification_preferences
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.notification_preferences%rowtype;
begin
  insert into public.notification_preferences (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select * into v_row
  from public.notification_preferences
  where user_id = p_user_id;

  return v_row;
end;
$$;

revoke all on function public.ensure_notification_preferences_row(uuid) from public;
grant execute on function public.ensure_notification_preferences_row(uuid) to service_role;

create or replace function public.get_notification_preferences_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.notification_preferences%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  v_row := public.ensure_notification_preferences_row(v_user_id);

  return jsonb_build_object(
    'user_id', v_row.user_id,
    'chat_messages', v_row.chat_messages,
    'message_previews', v_row.message_previews,
    'game_reminders', v_row.game_reminders,
    'host_updates', v_row.host_updates,
    'nearby_games', v_row.nearby_games,
    'favourite_park_games', v_row.favourite_park_games,
    'marketing_updates', v_row.marketing_updates,
    'radius_meters', v_row.radius_meters,
    'quiet_hours_enabled', v_row.quiet_hours_enabled,
    'quiet_start', v_row.quiet_start,
    'quiet_end', v_row.quiet_end,
    'timezone', v_row.timezone,
    'primer_state', v_row.primer_state,
    'primer_last_shown_at', v_row.primer_last_shown_at,
    'primer_snooze_until', v_row.primer_snooze_until,
    'updated_at', v_row.updated_at
  );
end;
$$;

revoke all on function public.get_notification_preferences_v1() from public;
grant execute on function public.get_notification_preferences_v1() to authenticated, service_role;

create or replace function public.update_notification_preferences_v1(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.notification_preferences%rowtype;
  v_radius integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception using errcode = '22023', message = 'patch object is required.';
  end if;

  perform public.ensure_notification_preferences_row(v_user_id);

  v_radius := case
    when p_patch ? 'radius_meters' then (p_patch->>'radius_meters')::integer
    else null
  end;
  if v_radius is not null and v_radius not in (2000, 5000, 10000) then
    raise exception using errcode = '22023', message = 'radius_meters must be 2000, 5000, or 10000.';
  end if;

  update public.notification_preferences np
  set
    chat_messages = coalesce((p_patch->>'chat_messages')::boolean, np.chat_messages),
    message_previews = coalesce((p_patch->>'message_previews')::boolean, np.message_previews),
    game_reminders = coalesce((p_patch->>'game_reminders')::boolean, np.game_reminders),
    host_updates = coalesce((p_patch->>'host_updates')::boolean, np.host_updates),
    nearby_games = coalesce((p_patch->>'nearby_games')::boolean, np.nearby_games),
    favourite_park_games = coalesce((p_patch->>'favourite_park_games')::boolean, np.favourite_park_games),
    marketing_updates = coalesce((p_patch->>'marketing_updates')::boolean, np.marketing_updates),
    radius_meters = coalesce(v_radius, np.radius_meters),
    quiet_hours_enabled = coalesce((p_patch->>'quiet_hours_enabled')::boolean, np.quiet_hours_enabled),
    quiet_start = coalesce((p_patch->>'quiet_start')::time, np.quiet_start),
    quiet_end = coalesce((p_patch->>'quiet_end')::time, np.quiet_end),
    timezone = coalesce(nullif(trim(p_patch->>'timezone'), ''), np.timezone),
    primer_state = coalesce(nullif(trim(p_patch->>'primer_state'), ''), np.primer_state),
    primer_last_shown_at = case
      when p_patch ? 'primer_last_shown_at' then (p_patch->>'primer_last_shown_at')::timestamptz
      else np.primer_last_shown_at
    end,
    primer_snooze_until = case
      when p_patch ? 'primer_snooze_until' then (p_patch->>'primer_snooze_until')::timestamptz
      else np.primer_snooze_until
    end
  where np.user_id = v_user_id
  returning * into v_row;

  return public.get_notification_preferences_v1();
end;
$$;

revoke all on function public.update_notification_preferences_v1(jsonb) from public;
grant execute on function public.update_notification_preferences_v1(jsonb) to authenticated, service_role;

commit;
