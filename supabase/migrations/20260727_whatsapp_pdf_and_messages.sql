begin;

alter table public.settings
  add column if not exists whatsapp_settings jsonb not null default '{}'::jsonb;

alter table public.whatsapp_message_logs
  add column if not exists created_at timestamptz not null default now();

create index if not exists whatsapp_message_logs_created_at_idx
  on public.whatsapp_message_logs (created_at desc);

alter table public.whatsapp_message_logs enable row level security;

drop policy if exists whatsapp_logs_select_authenticated on public.whatsapp_message_logs;
create policy whatsapp_logs_select_authenticated
  on public.whatsapp_message_logs
  for select to authenticated
  using (true);

drop policy if exists whatsapp_logs_insert_authenticated on public.whatsapp_message_logs;
create policy whatsapp_logs_insert_authenticated
  on public.whatsapp_message_logs
  for insert to authenticated
  with check (auth.uid() = sent_by or sent_by is null);

commit;
