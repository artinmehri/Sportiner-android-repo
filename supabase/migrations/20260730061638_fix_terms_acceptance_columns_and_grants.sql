-- Keep versioned agreement persistence aligned with the authenticated client.
alter table public.users
  add column if not exists accepted_terms_at timestamptz,
  add column if not exists accepted_terms_version text;

update public.users
set
  accepted_terms_at = coalesce(accepted_terms_at, updated_at, created_at, now()),
  accepted_terms_version = coalesce(accepted_terms_version, '2026-07-12')
where accepted_terms is true;

-- The latest-location privacy migration intentionally removed broad table
-- privileges from authenticated clients. Restore only the versioned terms
-- fields required by signup, login, and session restoration.
grant select (
  accepted_terms_at,
  accepted_terms_version
) on public.users to authenticated;

grant insert (
  accepted_terms_at,
  accepted_terms_version
) on public.users to authenticated;

grant update (
  accepted_terms_at,
  accepted_terms_version
) on public.users to authenticated;

notify pgrst, 'reload schema';
