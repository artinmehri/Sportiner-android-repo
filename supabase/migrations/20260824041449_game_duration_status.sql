-- Add the authoritative future game duration and the expired terminal state.

alter table public.games
  add column if not exists duration_minutes smallint;

update public.games
set duration_minutes = 120
where duration_minutes is null;

alter table public.games
  alter column duration_minutes set default 120,
  alter column duration_minutes set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.games'::regclass
      and conname = 'games_duration_minutes_check'
  ) then
    alter table public.games
      add constraint games_duration_minutes_check
      check (duration_minutes between 1 and 1440);
  end if;
end;
$$;

alter table public.games drop constraint if exists games_status_check;
alter table public.games
  add constraint games_status_check
  check (status = any (array['scheduled'::text, 'cancelled'::text, 'completed'::text, 'expired'::text]));

alter table public.games drop constraint if exists games_lifecycle_timestamp_check;
alter table public.games
  add constraint games_lifecycle_timestamp_check
  check (
    (status = 'scheduled' and cancelled_at is null and cancelled_by is null and completed_at is null)
    or (status = 'cancelled' and cancelled_at is not null and completed_at is null)
    or (status = 'expired' and cancelled_at is null and cancelled_by is null and completed_at is null)
    or (
      status = 'completed'
      and completed_at is not null
      and cancelled_at is null
      and cancelled_by is null
      and ("time" is null or completed_at >= "time")
    )
  );

create or replace function public.enforce_game_lifecycle()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if new.public_id is distinct from old.public_id then
      raise exception 'games.public_id is immutable';
    end if;

    if new.is_public is distinct from true then
      raise exception 'games.is_public must remain true in the current release';
    end if;

    if old.status <> new.status then
      if old.status <> 'scheduled' then
        raise exception 'cannot transition game from % to %', old.status, new.status;
      end if;

      if new.status not in ('cancelled', 'completed', 'expired') then
        raise exception 'invalid game status transition from % to %', old.status, new.status;
      end if;
    end if;
  end if;

  if new.status = 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
    new.completed_at := null;
  elsif new.status = 'completed' then
    new.completed_at := coalesce(new.completed_at, now());
    new.cancelled_at := null;
    new.cancelled_by := null;
  else
    new.cancelled_at := null;
    new.cancelled_by := null;
    new.completed_at := null;
  end if;

  return new;
end;
$$;
