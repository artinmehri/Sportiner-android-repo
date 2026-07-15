create extension if not exists pgcrypto;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.users(id) on delete cascade,
  reported_user_id uuid references public.users(id) on delete set null,
  reported_message_id uuid references public.messages(id) on delete set null,
  reported_post_id uuid references public.games(id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.reports
  add column if not exists reporter_id uuid references public.users(id) on delete cascade,
  add column if not exists reported_user_id uuid references public.users(id) on delete set null,
  add column if not exists reported_message_id uuid references public.messages(id) on delete set null,
  add column if not exists reported_post_id uuid references public.games(id) on delete set null,
  add column if not exists reason text,
  add column if not exists details text,
  add column if not exists status text not null default 'pending',
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.blocked_users (
  blocker_id uuid not null references public.users(id) on delete cascade,
  blocked_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocked_users_no_self_block check (blocker_id <> blocked_id)
);

alter table public.blocked_users
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists blocked_users_pair_idx
  on public.blocked_users (blocker_id, blocked_id);

create index if not exists reports_reporter_id_idx on public.reports (reporter_id);
create index if not exists reports_reported_user_id_idx on public.reports (reported_user_id);
create index if not exists reports_reported_message_id_idx on public.reports (reported_message_id);
create index if not exists blocked_users_blocker_id_idx on public.blocked_users (blocker_id);
create index if not exists blocked_users_blocked_id_idx on public.blocked_users (blocked_id);

alter table public.reports enable row level security;
alter table public.blocked_users enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Users can submit moderation reports" on public.reports;
create policy "Users can submit moderation reports"
  on public.reports
  for insert
  to authenticated
  with check (auth.uid() = reporter_id);

drop policy if exists "Users can read their own moderation reports" on public.reports;
create policy "Users can read their own moderation reports"
  on public.reports
  for select
  to authenticated
  using (auth.uid() = reporter_id);

drop policy if exists "Users can block others" on public.blocked_users;
create policy "Users can block others"
  on public.blocked_users
  for insert
  to authenticated
  with check (auth.uid() = blocker_id and blocker_id <> blocked_id);

drop policy if exists "Users can read their block relationships" on public.blocked_users;
create policy "Users can read their block relationships"
  on public.blocked_users
  for select
  to authenticated
  using (auth.uid() = blocker_id or auth.uid() = blocked_id);

drop policy if exists "Users can unblock users they blocked" on public.blocked_users;
create policy "Users can unblock users they blocked"
  on public.blocked_users
  for delete
  to authenticated
  using (auth.uid() = blocker_id);

drop policy if exists "Blocked users cannot send chat messages" on public.messages;
create policy "Blocked users cannot send chat messages"
  on public.messages
  as restrictive
  for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and not exists (
      select 1
      from public.conversation_members sender_member
      join public.conversation_members other_member
        on other_member.chat_id = sender_member.chat_id
       and other_member.id <> sender_member.id
      join public.blocked_users blocked_relation
        on (
          blocked_relation.blocker_id = other_member.id
          and blocked_relation.blocked_id = auth.uid()
        )
        or (
          blocked_relation.blocker_id = auth.uid()
          and blocked_relation.blocked_id = other_member.id
        )
      where sender_member.chat_id = messages.chat_id
        and sender_member.id = auth.uid()
    )
  );
