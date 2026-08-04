begin;

create table if not exists public.user_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  event_key text not null,
  enabled boolean not null default true,
  in_app boolean not null default true,
  push_enabled boolean not null default true,
  branch_id uuid null references public.branches(id) on delete set null,
  quiet_from time null,
  quiet_to time null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,event_key)
);

alter table public.user_notification_preferences enable row level security;
drop policy if exists "user_notification_preferences_select" on public.user_notification_preferences;
create policy "user_notification_preferences_select" on public.user_notification_preferences
for select to authenticated using (true);
drop policy if exists "user_notification_preferences_manage" on public.user_notification_preferences;
create policy "user_notification_preferences_manage" on public.user_notification_preferences
for all to authenticated using (true) with check (true);

create table if not exists public.whatsapp_message_logs (
  id uuid primary key default gen_random_uuid(),
  order_id bigint null references public.orders(id) on delete set null,
  customer_phone text not null default '',
  message_type text not null default 'invoice',
  message_text text not null default '',
  sent_by uuid null references public.user_profiles(id) on delete set null,
  branch_id uuid null references public.branches(id) on delete set null,
  opened_at timestamptz not null default now(),
  status text not null default 'opened'
);

alter table public.whatsapp_message_logs enable row level security;
drop policy if exists "whatsapp_logs_select" on public.whatsapp_message_logs;
create policy "whatsapp_logs_select" on public.whatsapp_message_logs for select to authenticated using (true);
drop policy if exists "whatsapp_logs_insert" on public.whatsapp_message_logs;
create policy "whatsapp_logs_insert" on public.whatsapp_message_logs for insert to authenticated with check (true);

-- صلاحيات تفصيلية جديدة
insert into public.app_permissions(code,name,group_name)
values
('notifications.manage_users','إدارة إشعارات المستخدمين','الإشعارات'),
('notifications.view_all','عرض كل إشعارات الفروع','الإشعارات'),
('whatsapp.send_invoice','إرسال فاتورة واتساب','واتساب'),
('whatsapp.send_status','إرسال تحديث حالة الطلب واتساب','واتساب'),
('whatsapp.view_logs','عرض سجل رسائل واتساب','واتساب'),
('analytics.products','تحليلات أداء المنتجات','التقارير'),
('analytics.branches','لوحة أداء الفروع','التقارير'),
('analytics.lost_profit','تقرير الأرباح المفقودة','التقارير'),
('attendance.manage','إدارة الحضور والانصراف','الحضور'),
('attendance.approve_excuses','اعتماد أعذار الحضور','الحضور')
on conflict (code) do update set name=excluded.name, group_name=excluded.group_name;

commit;
