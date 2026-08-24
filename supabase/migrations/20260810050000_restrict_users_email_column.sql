-- Security: stop exposing user emails to other signed-in users.
--
-- The users table already uses column-level grants for the authenticated role,
-- but email was included in SELECT/INSERT/UPDATE. Since users_select_authenticated
-- lets any authenticated user read other users' rows, that made every member's
-- email dumpable with a single API call.
--
-- The app no longer reads or writes users.email; a trigger keeps the column
-- populated from auth.users (source of truth) so service-role/admin flows that
-- may need it still have accurate data.

-- 1) Populate email server-side on insert so clients never need to send it.
create or replace function public.sync_user_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.email := (select email from auth.users where id = new.id);
  return new;
end;
$$;

revoke all on function public.sync_user_email_from_auth() from public, anon, authenticated;

drop trigger if exists sync_user_email_from_auth on public.users;
create trigger sync_user_email_from_auth
  before insert on public.users
  for each row
  execute function public.sync_user_email_from_auth();

-- 2) Remove all client access to the email column.
revoke select (email) on table public.users from authenticated;
revoke insert (email) on table public.users from authenticated;
revoke update (email) on table public.users from authenticated;
