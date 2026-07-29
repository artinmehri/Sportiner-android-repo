-- Follow-up: onboarding stage checks on INSERT; attribution RPC edge-only for anon.

begin;

create or replace function public.enforce_onboarding_stage_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.onboarding_stage in ('minimum_complete', 'complete')
     and (
       nullif(btrim(coalesce(NEW.name, '')), '') is null
       or nullif(btrim(coalesce(NEW.age_group, '')), '') is null
       or nullif(btrim(coalesce(NEW.level, '')), '') is null
     ) then
    raise exception using
      errcode = '23514',
      message = 'onboarding_stage requires name, age_group, and level.';
  end if;
  return NEW;
end;
$$;

drop trigger if exists users_enforce_onboarding_stage_fields on public.users;
create trigger users_enforce_onboarding_stage_fields
  before insert or update of onboarding_stage, name, age_group, level on public.users
  for each row
  execute function public.enforce_onboarding_stage_fields();

-- Stage alone is never enough — require profile fields.
create or replace function public.user_meets_minimum_onboarding_v1(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = p_user_id
      and nullif(btrim(coalesce(u.name, '')), '') is not null
      and nullif(btrim(coalesce(u.age_group, '')), '') is not null
      and nullif(btrim(coalesce(u.level, '')), '') is not null
  );
$$;

revoke execute on function public.record_acquisition_attribution_v1(
  uuid, text, text, text, text, text, text, text, jsonb
) from anon;

grant execute on function public.record_acquisition_attribution_v1(
  uuid, text, text, text, text, text, text, text, jsonb
) to authenticated, service_role;

commit;
