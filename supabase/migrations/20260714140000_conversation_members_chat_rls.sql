-- Enable RLS on conversation_members and chat tables
alter table public.conversation_members enable row level security;
alter table public.chat enable row level security;

-- conversation_members SELECT policy: users can read all rows for chats they belong to
drop policy if exists "Users can read conversation memberships" on public.conversation_members;
create policy "Users can read conversation memberships"
  on public.conversation_members
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.conversation_members as my_membership
      where my_membership.chat_id = conversation_members.chat_id
        and my_membership.id = auth.uid()
    )
  );

-- conversation_members INSERT policy: users can insert rows for chats they belong to
drop policy if exists "Users can insert conversation memberships" on public.conversation_members;
create policy "Users can insert conversation memberships"
  on public.conversation_members
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.conversation_members as my_membership
      where my_membership.chat_id = conversation_members.chat_id
        and my_membership.id = auth.uid()
    )
    or conversation_members.id = auth.uid() -- Allow inserting own row
  );

-- conversation_members UPDATE policy: users can update only their own row, restricted to read state columns
drop policy if exists "Users can update own read state" on public.conversation_members;
create policy "Users can update own read state"
  on public.conversation_members
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Restrict UPDATE to only last_read_at and last_read_message_id columns
REVOKE UPDATE ON public.conversation_members FROM authenticated;
GRANT UPDATE (last_read_at, last_read_message_id) ON public.conversation_members TO authenticated;

-- chat SELECT policy: users can read chats they are members of
drop policy if exists "Users can read chats they belong to" on public.chat;
create policy "Users can read chats they belong to"
  on public.chat
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.conversation_members
      where conversation_members.chat_id = chat.id
        and conversation_members.id = auth.uid()
    )
  );

-- chat INSERT policy: users can insert chats
drop policy if exists "Users can insert chats" on public.chat;
create policy "Users can insert chats"
  on public.chat
  for insert
  to authenticated
  with check (true);

-- chat UPDATE policy: users can update chats they are members of (for last_message_* fields)
drop policy if exists "Users can update chats they belong to" on public.chat;
create policy "Users can update chats they belong to"
  on public.chat
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.conversation_members
      where conversation_members.chat_id = chat.id
        and conversation_members.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.conversation_members
      where conversation_members.chat_id = chat.id
        and conversation_members.id = auth.uid()
    )
  );
