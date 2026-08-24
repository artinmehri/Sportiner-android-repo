-- Channel tracking does not require growth_flags; remove the unused kill-switch table.
drop policy if exists growth_flags_select_authenticated on public.growth_flags;
drop policy if exists service_role_full_access_growth_flags on public.growth_flags;
drop table if exists public.growth_flags;
