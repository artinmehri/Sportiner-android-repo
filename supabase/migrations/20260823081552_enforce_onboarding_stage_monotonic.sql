begin;

-- Repair legacy rows that already contain the complete onboarding profile.
update public.users
set
  onboarding_stage = 'Completed',
  onboarding_version = 2,
  onboarding_completed_at = coalesce(onboarding_completed_at, updated_at, created_at, now())
where onboarding_stage = 'Not Started'
  and onboarding_version = 0
  and nullif(btrim(coalesce(name, '')), '') is not null
  and nullif(btrim(coalesce(age_group, '')), '') is not null
  and nullif(btrim(coalesce(level, '')), '') is not null
  and availability is not null
  and nullif(btrim(coalesce(profile_picture, '')), '') is not null
  and accepted_terms is true;

create or replace function public.prevent_onboarding_stage_regression()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  old_rank integer := case OLD.onboarding_stage
    when 'Not Started' then 0
    when '1' then 1
    when '2' then 2
    when '3' then 3
    when '4' then 4
    when '5' then 5
    when '6' then 6
    when '7' then 7
    when 'Completed' then 8
    else 0
  end;
  new_rank integer := case NEW.onboarding_stage
    when 'Not Started' then 0
    when '1' then 1
    when '2' then 2
    when '3' then 3
    when '4' then 4
    when '5' then 5
    when '6' then 6
    when '7' then 7
    when 'Completed' then 8
    else 0
  end;
begin
  if new_rank < old_rank then
    NEW.onboarding_stage := OLD.onboarding_stage;
    NEW.onboarding_version := OLD.onboarding_version;
    NEW.onboarding_completed_at := OLD.onboarding_completed_at;
  end if;

  return NEW;
end;
$$;

drop trigger if exists users_prevent_onboarding_stage_regression on public.users;
create trigger users_prevent_onboarding_stage_regression
before update of onboarding_stage, onboarding_version, onboarding_completed_at on public.users
for each row
execute function public.prevent_onboarding_stage_regression();

commit;
