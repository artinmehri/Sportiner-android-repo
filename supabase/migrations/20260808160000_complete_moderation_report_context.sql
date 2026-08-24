alter table public.reports
  add column if not exists reported_message_id uuid references public.messages(id) on delete set null,
  add column if not exists details text,
  add column if not exists status text not null default 'pending';

create index if not exists reports_reported_message_id_idx
  on public.reports (reported_message_id);
