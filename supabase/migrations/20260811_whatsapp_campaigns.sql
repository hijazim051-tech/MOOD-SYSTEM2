-- MOOD - WhatsApp Campaigns
-- Run once in Supabase SQL Editor.

begin;

create table if not exists public.whatsapp_campaigns (
  id uuid primary key,
  branch_id uuid not null references public.branches(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  message_text text not null,
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  status text not null default 'sending',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.whatsapp_campaign_recipients (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.whatsapp_campaigns(id) on delete cascade,
  phone text not null,
  status text not null default 'pending',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_campaigns_branch_created_idx
  on public.whatsapp_campaigns(branch_id, created_at desc);

create index if not exists whatsapp_campaign_recipients_campaign_idx
  on public.whatsapp_campaign_recipients(campaign_id);

alter table public.whatsapp_campaigns enable row level security;
alter table public.whatsapp_campaign_recipients enable row level security;

drop policy if exists whatsapp_campaigns_owner_manager_read
  on public.whatsapp_campaigns;
create policy whatsapp_campaigns_owner_manager_read
on public.whatsapp_campaigns
for select to authenticated
using (true);

drop policy if exists whatsapp_campaign_recipients_owner_manager_read
  on public.whatsapp_campaign_recipients;
create policy whatsapp_campaign_recipients_owner_manager_read
on public.whatsapp_campaign_recipients
for select to authenticated
using (true);

grant select on public.whatsapp_campaigns to authenticated;
grant select on public.whatsapp_campaign_recipients to authenticated;

insert into public.app_permissions (code, name, group_name)
values
  ('whatsapp_campaigns.view', 'عرض حملات واتساب', 'واتساب'),
  ('whatsapp_campaigns.send', 'إنشاء وإرسال حملات واتساب', 'واتساب')
on conflict (code) do update
set name = excluded.name,
    group_name = excluded.group_name;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.app_permissions p
where lower(r.name) in ('owner', 'admin')
  and p.code in ('whatsapp_campaigns.view', 'whatsapp_campaigns.send')
on conflict do nothing;

commit;
