begin;

alter table public.notifications
  add column if not exists push_token_id uuid references public.push_tokens (id) on delete set null,
  add column if not exists expo_ticket_id text,
  add column if not exists ticket_status text,
  add column if not exists ticket_error text,
  add column if not exists receipt_status text,
  add column if not exists receipt_error text,
  add column if not exists receipt_message text,
  add column if not exists receipt_attempts integer not null default 0,
  add column if not exists receipt_checked_at timestamptz,
  add column if not exists next_receipt_check_at timestamptz;

alter table public.notifications
  drop constraint if exists notifications_ticket_status_check,
  drop constraint if exists notifications_receipt_status_check;

alter table public.notifications
  add constraint notifications_ticket_status_check
    check (ticket_status is null or ticket_status in ('accepted', 'error', 'request_error')),
  add constraint notifications_receipt_status_check
    check (receipt_status is null or receipt_status in ('pending', 'ok', 'error', 'missing'));

create index if not exists notifications_pending_receipt_idx
  on public.notifications (next_receipt_check_at)
  where receipt_status = 'pending';

do $$
begin
  if exists (select 1 from cron.job where jobname = 'process-push-receipts-v1') then
    perform cron.unschedule('process-push-receipts-v1');
  end if;
end
$$;

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

drop table if exists public.push_delivery_attempts;
drop function if exists public.touch_push_delivery_attempt_updated_at();

commit;
