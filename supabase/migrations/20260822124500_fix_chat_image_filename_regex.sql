drop policy if exists "chat images members can upload own" on storage.objects;
create policy "chat images members can upload own"
  on storage.objects
  for insert
  to authenticated
  with check (
    storage.objects.bucket_id = 'chat-images'
    and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
    and (storage.foldername(storage.objects.name))[2] = 'chat'
    and (storage.foldername(storage.objects.name))[3] ~ '^[0-9a-fA-F-]{36}$'
    and storage.filename(storage.objects.name) ~ '^[0-9a-fA-F-]{36}\.(jpg|png)$'
    and public.can_access_chat(
      ((storage.foldername(storage.objects.name))[3])::uuid,
      (select auth.uid())
    )
  );

drop policy if exists "chat images senders or hosts can delete" on storage.objects;
create policy "chat images senders or hosts can delete"
  on storage.objects
  for delete
  to authenticated
  using (
    storage.objects.bucket_id = 'chat-images'
    and (storage.foldername(storage.objects.name))[2] = 'chat'
    and (storage.foldername(storage.objects.name))[3] ~ '^[0-9a-fA-F-]{36}$'
    and exists (
      select 1
      from public.messages as m
      join public.chat as c on c.id = m.chat_id
      where m.chat_id = ((storage.foldername(storage.objects.name))[3])::uuid
        and m.id = case
          when storage.filename(storage.objects.name) ~ '^[0-9a-fA-F-]{36}\.(jpg|png)$'
            then regexp_replace(storage.filename(storage.objects.name), '\.[^.]+$', '')::uuid
          else null
        end
        and (
          m.sender_id = (select auth.uid())
          or public.is_game_host(c.game_id, (select auth.uid()))
        )
    )
  );
