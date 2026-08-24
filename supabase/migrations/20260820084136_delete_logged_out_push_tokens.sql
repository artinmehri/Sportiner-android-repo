delete from public.push_tokens
where enabled = false
  and disabled_reason = 'logout';
