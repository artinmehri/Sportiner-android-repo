-- Server-only allowlist for manual broadcast authorization.

create schema if not exists private;

create table if not exists private.broadcast_admins (
  user_id uuid primary key,
  created_at timestamptz not null default now()
);

revoke all on table private.broadcast_admins from public, anon, authenticated;
grant select on table private.broadcast_admins to service_role;

insert into private.broadcast_admins (user_id)
values ('eeae8736-bf2e-45fc-bd88-595dbac35a28'::uuid)
on conflict (user_id) do nothing;

comment on table private.broadcast_admins is
  'Server-only allowlist for manual Sportiner broadcast notifications.';
