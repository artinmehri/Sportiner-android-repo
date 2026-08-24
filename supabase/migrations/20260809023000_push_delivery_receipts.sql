begin;

create table if not exists public.push_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  push_token_id uuid references public.push_tokens (id) on delete set null,
  expo_ticket_id text unique,
  ticket_status text not null
    check (ticket_status in ('accepted', 'error', 'request_error')),
  ticket_error text,
  receipt_status text
    check (receipt_status is null or receipt_status in ('pending', 'ok', 'error', 'missing')),
  receipt_error text,
  receipt_message text,
  receipt_attempts integer not null default 0 check (receipt_attempts between 0 and 20),
  receipt_checked_at timestamptz,
  next_receipt_check_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_delivery_attempts_pending_idx
  on public.push_delivery_attempts (next_receipt_check_at)
  where receipt_status = 'pending';

create index if not exists push_delivery_attempts_notification_idx
  on public.push_delivery_attempts (notification_id, created_at desc);

alter table public.push_delivery_attempts enable row level security;
alter table public.push_delivery_attempts force row level security;

revoke all on public.push_delivery_attempts from public, anon, authenticated;
grant all on public.push_delivery_attempts to service_role;

create or replace function public.touch_push_delivery_attempt_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists push_delivery_attempts_touch_updated_at
  on public.push_delivery_attempts;
create trigger push_delivery_attempts_touch_updated_at
  before update on public.push_delivery_attempts
  for each row execute function public.touch_push_delivery_attempt_updated_at();

create extension if not exists pg_cron;

do $vault_setup$
declare
  trigger_args text[];
  webhook_secret text;
  existing_secret_id uuid;
begin
  select string_to_array(encode(t.tgargs, 'escape'), E'\\000')
  into trigger_args
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'games'
    and t.tgname = 'notify-new-game'
    and not t.tgisinternal
  limit 1;

  webhook_secret := coalesce(
    trigger_args[3]::jsonb ->> 'x-webhook-secret',
    trigger_args[4]::jsonb ->> 'x-webhook-secret'
  );

  if webhook_secret is null or webhook_secret = '' then
    raise exception 'Existing notification webhook secret could not be resolved';
  end if;

  select id into existing_secret_id
  from vault.secrets
  where name = 'notification_webhook_secret';

  if existing_secret_id is null then
    perform vault.create_secret(
      webhook_secret,
      'notification_webhook_secret',
      'Shared secret for scheduled notification receipt processing'
    );
  else
    perform vault.update_secret(
      existing_secret_id,
      webhook_secret,
      'notification_webhook_secret',
      'Shared secret for scheduled notification receipt processing'
    );
  end if;
end
$vault_setup$;

do $cron_setup$
begin
  if exists (select 1 from cron.job where jobname = 'process-push-receipts-v1') then
    perform cron.unschedule('process-push-receipts-v1');
  end if;
end
$cron_setup$;

select cron.schedule(
  'process-push-receipts-v1',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := 'https://prswdcjmowfdvalyutlu.supabase.co/functions/v1/process-push-receipts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'notification_webhook_secret'
        )
      ),
      body := jsonb_build_object('scheduled_at', now()),
      timeout_milliseconds := 15000
    ) as request_id;
  $job$
);

commit;
