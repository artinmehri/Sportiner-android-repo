begin;

alter table public.users
  drop constraint if exists users_onboarding_stage_check;

update public.users
set onboarding_stage = case onboarding_stage
  when 'not_started' then 'Not Started'
  when 'minimum_complete' then '4'
  when 'complete' then 'Completed'
  else onboarding_stage
end
where onboarding_stage in ('not_started', 'minimum_complete', 'complete');

update public.users
set
  onboarding_stage = 'Completed',
  onboarding_version = greatest(coalesce(onboarding_version, 0), 2),
  onboarding_completed_at = coalesce(onboarding_completed_at, updated_at, created_at, now())
where onboarding_stage = 'Not Started'
  and coalesce(nullif(btrim(name), ''), '') <> ''
  and coalesce(nullif(btrim(age_group), ''), '') <> ''
  and coalesce(nullif(btrim(level), ''), '') <> '';

alter table public.users
  alter column onboarding_stage set default 'Not Started';

alter table public.users
  add constraint users_onboarding_stage_check
  check (onboarding_stage in ('Not Started', '1', '2', '3', '4', '5', '6', '7', 'Completed'));

create or replace function public.enforce_onboarding_stage_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.onboarding_stage = 'Completed'
     and (
       nullif(btrim(coalesce(NEW.name, '')), '') is null
       or nullif(btrim(coalesce(NEW.age_group, '')), '') is null
       or nullif(btrim(coalesce(NEW.level, '')), '') is null
     ) then
    raise exception using
      errcode = '23514',
      message = 'Completed onboarding requires name, age_group, and level.';
  end if;
  return NEW;
end;
$$;

drop trigger if exists users_enforce_onboarding_stage_fields on public.users;
create trigger users_enforce_onboarding_stage_fields
  before insert or update of onboarding_stage, name, age_group, level on public.users
  for each row
  execute function public.enforce_onboarding_stage_fields();

comment on column public.users.onboarding_stage is
  'Not Started, the current onboarding page number 1-7, or Completed.';

commit;
