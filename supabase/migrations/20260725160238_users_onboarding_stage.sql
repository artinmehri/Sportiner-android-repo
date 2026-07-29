-- SPO-257: versioned onboarding stage so referred users can finish a
-- minimum-safe profile and reach the linked game without inventing completion
-- from client route history alone.

alter table public.users
  add column if not exists onboarding_version integer not null default 0;

alter table public.users
  add column if not exists onboarding_stage text not null default 'not_started';

alter table public.users
  add column if not exists onboarding_completed_at timestamptz null;

alter table public.users
  drop constraint if exists users_onboarding_stage_check;

alter table public.users
  add constraint users_onboarding_stage_check
  check (onboarding_stage in ('not_started', 'minimum_complete', 'complete'));

comment on column public.users.onboarding_version is
  'Client/schema version of the onboarding contract the user last completed.';
comment on column public.users.onboarding_stage is
  'not_started | minimum_complete (referred short path) | complete (full onboarding).';
comment on column public.users.onboarding_completed_at is
  'When onboarding_stage last reached complete. Null for not_started/minimum_complete.';

-- Existing profiles that already have the eligibility fields count as fully
-- onboarded so we do not bounce them through referred/min flow.
update public.users
set
  onboarding_stage = 'complete',
  onboarding_version = greatest(coalesce(onboarding_version, 0), 1),
  onboarding_completed_at = coalesce(
    onboarding_completed_at,
    updated_at,
    created_at,
    now()
  )
where onboarding_stage = 'not_started'
  and coalesce(nullif(btrim(name), ''), '') <> ''
  and coalesce(nullif(btrim(age_group), ''), '') <> ''
  and coalesce(nullif(btrim(level), ''), '') <> '';
