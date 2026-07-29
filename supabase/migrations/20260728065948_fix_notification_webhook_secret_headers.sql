do $migration$
declare
  webhook record;
  trigger_args text[];
  existing_headers jsonb;
  existing_params jsonb;
  webhook_secret text;
  corrected_headers jsonb;
begin
  for webhook in
    select
      c.relname as table_name,
      t.tgname as trigger_name,
      encode(t.tgargs, 'escape') as raw_args
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and (
        (c.relname = 'game_players' and t.tgname = 'notify-player-joined')
        or (c.relname = 'games' and t.tgname = 'notify-new-game')
      )
      and not t.tgisinternal
  loop
    trigger_args := string_to_array(webhook.raw_args, E'\\000');

    if coalesce(array_length(trigger_args, 1), 0) < 5 then
      raise exception 'Webhook trigger % on % has unexpected arguments',
        webhook.trigger_name,
        webhook.table_name;
    end if;

    existing_headers := trigger_args[3]::jsonb;
    existing_params := trigger_args[4]::jsonb;
    webhook_secret := coalesce(
      existing_headers ->> 'x-webhook-secret',
      existing_params ->> 'x-webhook-secret'
    );

    if webhook_secret is null or webhook_secret = '' then
      raise exception 'Webhook secret is missing for trigger %',
        webhook.trigger_name;
    end if;

    corrected_headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', webhook_secret
    );

    execute format(
      'drop trigger %I on public.%I',
      webhook.trigger_name,
      webhook.table_name
    );

    execute format(
      'create trigger %I after insert on public.%I for each row execute function supabase_functions.http_request(%L, %L, %L, %L, %L)',
      webhook.trigger_name,
      webhook.table_name,
      trigger_args[1],
      trigger_args[2],
      corrected_headers::text,
      '{}'::jsonb::text,
      trigger_args[5]
    );
  end loop;
end
$migration$;

do $verification$
declare
  configured_count integer;
begin
  select count(*)
  into configured_count
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and (
      (c.relname = 'game_players' and t.tgname = 'notify-player-joined')
      or (c.relname = 'games' and t.tgname = 'notify-new-game')
    )
    and not t.tgisinternal
    and (string_to_array(encode(t.tgargs, 'escape'), E'\\000'))[3]::jsonb
      ? 'x-webhook-secret'
    and (string_to_array(encode(t.tgargs, 'escape'), E'\\000'))[4]::jsonb
      = '{}'::jsonb
    and not (
      (string_to_array(encode(t.tgargs, 'escape'), E'\\000'))[3]::jsonb
      ? 'Authorization'
    );

  if configured_count <> 2 then
    raise exception 'Expected 2 corrected notification webhook triggers, found %',
      configured_count;
  end if;
end
$verification$;
