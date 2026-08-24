create unique index if not exists push_tokens_one_enabled_device
  on public.push_tokens (device_id)
  where enabled;

create unique index if not exists push_tokens_one_enabled_expo_token
  on public.push_tokens (expo_push_token)
  where enabled;
