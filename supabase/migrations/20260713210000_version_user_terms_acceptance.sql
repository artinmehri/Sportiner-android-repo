alter table public.users
  add column if not exists accepted_terms_at timestamptz,
  add column if not exists accepted_terms_version text;

update public.users
set
  accepted_terms_at = coalesce(accepted_terms_at, updated_at, created_at, now()),
  accepted_terms_version = coalesce(accepted_terms_version, '2026-07-12')
where accepted_terms is true;
