-- PostgREST profile upsert includes the conflict key in its update clause.
-- Granting UPDATE on id allows the existing SignupFlow upsert to run. The
-- users_update_own RLS policy still requires both the existing and resulting
-- row id to equal auth.uid(), so users cannot move or overwrite another row.
grant update (id) on public.users to authenticated;

notify pgrst, 'reload schema';
