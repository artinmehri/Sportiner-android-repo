-- Keep the allowlist private while exposing one service-role-only authorization check.

create or replace function public.is_broadcast_admin_v1(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select exists (
    select 1
    from private.broadcast_admins
    where user_id = p_user_id
  );
$$;

revoke all on function public.is_broadcast_admin_v1(uuid) from public, anon, authenticated;
grant execute on function public.is_broadcast_admin_v1(uuid) to service_role;
