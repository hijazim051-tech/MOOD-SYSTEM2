-- Independent WhatsApp configuration for every branch.
alter table if exists public.branch_settings
  add column if not exists whatsapp_settings jsonb not null default '{}'::jsonb;

-- The Edge Function reads credentials with the service role. Authenticated users
-- keep the existing branch_settings policies used by the settings screen.
create index if not exists branch_settings_branch_id_idx
  on public.branch_settings(branch_id);
