begin;

create extension if not exists pgcrypto;

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  address text not null default '',
  phone text not null default '',
  latitude numeric null,
  longitude numeric null,
  gps_radius integer not null default 150 check (gps_radius between 20 and 5000),
  work_start time not null default '09:00',
  work_end time not null default '21:00',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.branches(name,code,address)
values ('الفرع الرئيسي','MAIN','بنغازي')
on conflict (code) do nothing;

alter table public.branches enable row level security;
drop policy if exists "branches authenticated read" on public.branches;
create policy "branches authenticated read" on public.branches for select to authenticated using(true);
drop policy if exists "branches authenticated manage" on public.branches;
create policy "branches authenticated manage" on public.branches for all to authenticated using(true) with check(true);

alter table if exists public.user_profiles add column if not exists branch_id uuid references public.branches(id);
alter table if exists public.orders add column if not exists branch_id uuid references public.branches(id);
alter table if exists public.purchase_invoices add column if not exists branch_id uuid references public.branches(id);
alter table if exists public.expenses add column if not exists branch_id uuid references public.branches(id);
alter table if exists public.waste add column if not exists branch_id uuid references public.branches(id);
alter table if exists public.inventory_movements add column if not exists branch_id uuid references public.branches(id);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  branch_id uuid not null references public.branches(id),
  record_type text not null check(record_type in ('check_in','check_out')),
  latitude numeric not null,
  longitude numeric not null,
  accuracy_meters numeric null,
  distance_meters numeric null,
  validation_status text not null default 'valid' check(validation_status in ('valid','outside_range','manual','rejected')),
  notes text not null default '',
  approved_by uuid null references auth.users(id),
  approved_at timestamptz null,
  device_info text not null default '',
  created_at timestamptz not null default now()
);
alter table public.attendance_records enable row level security;
drop policy if exists "attendance own insert" on public.attendance_records;
create policy "attendance own insert" on public.attendance_records for insert to authenticated with check(user_id=auth.uid());
drop policy if exists "attendance authenticated read" on public.attendance_records;
create policy "attendance authenticated read" on public.attendance_records for select to authenticated using(true);
drop policy if exists "attendance managers update" on public.attendance_records;
create policy "attendance managers update" on public.attendance_records for update to authenticated using(true) with check(true);

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  branch_id uuid null references public.branches(id),
  event_key text not null,
  enabled boolean not null default true,
  in_app boolean not null default true,
  push_enabled boolean not null default true,
  daily_digest boolean not null default false,
  threshold numeric null,
  cooldown_minutes integer not null default 60,
  quiet_hours_start time null,
  quiet_hours_end time null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,branch_id,event_key)
);
alter table public.notification_preferences enable row level security;
drop policy if exists "notification preferences own" on public.notification_preferences;
create policy "notification preferences own" on public.notification_preferences for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create table if not exists public.whatsapp_message_log (
  id uuid primary key default gen_random_uuid(),
  order_id bigint null references public.orders(id) on delete set null,
  customer_id bigint null,
  phone text not null,
  message_type text not null,
  status text not null default 'opened',
  sent_by uuid null default auth.uid() references auth.users(id),
  sent_at timestamptz not null default now(),
  notes text not null default ''
);
alter table public.whatsapp_message_log enable row level security;
drop policy if exists "whatsapp log authenticated" on public.whatsapp_message_log;
create policy "whatsapp log authenticated" on public.whatsapp_message_log for all to authenticated using(true) with check(true);

create table if not exists public.system_alerts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid null references public.branches(id),
  alert_type text not null,
  severity text not null default 'warning' check(severity in ('info','warning','danger')),
  title text not null,
  description text not null default '',
  entity_table text null,
  entity_id text null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.system_alerts enable row level security;
drop policy if exists "alerts authenticated" on public.system_alerts;
create policy "alerts authenticated" on public.system_alerts for all to authenticated using(true) with check(true);

-- Detailed permissions added safely when the existing permissions table is present.
do $$
begin
  if to_regclass('public.app_permissions') is not null then
    insert into public.app_permissions (permission_key, name, category)
    values
      ('branches.view','عرض الفروع','الفروع'),('branches.manage','إدارة الفروع','الفروع'),
      ('attendance.view','عرض الحضور','الحضور'),('attendance.record','تسجيل الحضور والانصراف','الحضور'),('attendance.approve','اعتماد وتصحيح الحضور','الحضور'),
      ('notifications.settings','إعدادات الإشعارات','الإشعارات'),('notifications.send','إرسال الإشعارات','الإشعارات'),
      ('purchase_invoices.view','عرض فواتير المشتريات','المشتريات'),('purchase_invoices.edit','تعديل فواتير المشتريات','المشتريات'),
      ('whatsapp.invoice','إرسال الفاتورة واتساب','واتساب'),('whatsapp.status','إرسال تحديث حالة الطلب','واتساب'),
      ('reports.branch','تقارير الفروع','التقارير'),('reports.lost_profit','الأرباح المفقودة','التقارير'),('reports.anomalies','التنبيهات غير الطبيعية','التقارير'),
      ('products.performance','تحليل أداء المنتجات','المنتجات'),('products.reorder','اقتراحات إعادة الطلب','المنتجات')
    on conflict do nothing;
  end if;
exception when undefined_column then null;
end $$;

commit;
