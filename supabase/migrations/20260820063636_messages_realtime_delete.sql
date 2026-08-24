-- Filtered DELETE postgres_changes events need the old row, including chat_id.
alter table public.messages replica identity full;
