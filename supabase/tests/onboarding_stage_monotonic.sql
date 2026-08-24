\echo 'Onboarding stage monotonicity tests'

begin;

create function pg_temp.assert_true(value boolean, label text)
returns void
language plpgsql
as $$
begin
  if value is not true then
    raise exception 'Assertion failed: %', label;
  end if;
end;
$$;

select pg_temp.assert_true(
  to_regprocedure('public.prevent_onboarding_stage_regression()') is not null,
  'onboarding regression trigger function exists'
);

create temporary table onboarding_stage_test (
  id integer primary key,
  onboarding_stage text,
  onboarding_version integer,
  onboarding_completed_at timestamptz
);

create trigger onboarding_stage_test_trigger
before update of onboarding_stage, onboarding_version, onboarding_completed_at
on onboarding_stage_test
for each row
execute function public.prevent_onboarding_stage_regression();

insert into onboarding_stage_test
values (1, 'Completed', 2, now());

update onboarding_stage_test
set onboarding_stage = '1', onboarding_completed_at = null
where id = 1;

select pg_temp.assert_true(
  (
    select onboarding_stage = 'Completed'
      and onboarding_version = 2
      and onboarding_completed_at is not null
    from onboarding_stage_test
    where id = 1
  ),
  'completed onboarding cannot regress'
);

rollback;
