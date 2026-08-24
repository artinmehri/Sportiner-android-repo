-- Store Apple revocation credentials in Vault behind service-role-only RPCs.
create or replace function public.store_apple_refresh_token_v1(
  p_user_id uuid,
  p_refresh_token text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret_name text := 'apple_refresh_token:' || p_user_id::text;
  existing_secret_id uuid;
begin
  if p_user_id is null or nullif(btrim(p_refresh_token), '') is null then
    raise exception 'Apple refresh token and user ID are required';
  end if;

  select id
  into existing_secret_id
  from vault.secrets
  where name = secret_name;

  if existing_secret_id is null then
    perform vault.create_secret(
      p_refresh_token,
      secret_name,
      'Sign in with Apple refresh token used only for account-deletion revocation'
    );
  else
    perform vault.update_secret(
      existing_secret_id,
      p_refresh_token,
      secret_name,
      'Sign in with Apple refresh token used only for account-deletion revocation'
    );
  end if;
end;
$$;

create or replace function public.get_apple_refresh_token_v1(p_user_id uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'apple_refresh_token:' || p_user_id::text
  limit 1;
$$;

create or replace function public.delete_apple_refresh_token_v1(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from vault.secrets
  where name = 'apple_refresh_token:' || p_user_id::text;
$$;

revoke all on function public.store_apple_refresh_token_v1(uuid, text) from public, anon, authenticated;
revoke all on function public.get_apple_refresh_token_v1(uuid) from public, anon, authenticated;
revoke all on function public.delete_apple_refresh_token_v1(uuid) from public, anon, authenticated;

grant execute on function public.store_apple_refresh_token_v1(uuid, text) to service_role;
grant execute on function public.get_apple_refresh_token_v1(uuid) to service_role;
grant execute on function public.delete_apple_refresh_token_v1(uuid) to service_role;
