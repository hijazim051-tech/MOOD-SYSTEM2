-- MOOD professional operations update
create extension if not exists pgcrypto;

create table if not exists public.delivery_drivers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete cascade,
  name text not null,
  phone text,
  company_name text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists delivery_drivers_branch_name_uq on public.delivery_drivers(branch_id, lower(name));

create table if not exists public.employee_withdrawals (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid,
  user_id uuid references auth.users(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  reason text,
  status text not null default 'approved' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null
);

create table if not exists public.employee_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null default '09:00',
  end_time time not null default '21:00',
  is_working_day boolean not null default true,
  unique(user_id, branch_id, weekday)
);

create table if not exists public.employee_absences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  absence_date date not null,
  status text not null default 'absent' check(status in ('absent','leave','holiday','excused')),
  notes text,
  created_at timestamptz not null default now(),
  unique(user_id, branch_id, absence_date)
);

alter table public.offers add column if not exists offer_type text default 'product';
alter table public.offers add column if not exists components jsonb not null default '[]'::jsonb;
alter table public.offers add column if not exists quantity_limit integer;
alter table public.offers alter column product_detail_id drop not null;

-- Page-level permissions: one switch per page.
insert into public.app_permissions(code,name,group_name)
values
('page.packaging','واجهة التغليف','الصفحات'),('page.dashboard','لوحة التحكم','الصفحات'),
('page.tasks','المهام','الصفحات'),('page.task-create','إضافة مهمة','الصفحات'),
('page.orders','الطلبات','الصفحات'),('page.new-order','طلب جديد','الصفحات'),
('page.ready-products','الجاهزات','الصفحات'),('page.offers','العروض','الصفحات'),
('page.production','مركز الإنتاج','الصفحات'),('page.items','إدارة المنتجات','الصفحات'),
('page.inventory','المخزون','الصفحات'),('page.item-tracking','تتبع الأصناف','الصفحات'),
('page.purchases','المشتريات','الصفحات'),('page.purchase-invoices','فواتير المشتريات','الصفحات'),
('page.waste','التوالف والهالك','الصفحات'),('page.expenses','المصروفات','الصفحات'),
('page.activity-log','سجل العمليات','الصفحات'),('page.trash','سلة المحذوفات','الصفحات'),
('page.whatsapp-logs','سجل واتساب','الصفحات'),('page.suppliers','الموردون','الصفحات'),
('page.supplier-reports','تقارير الموردين','الصفحات'),('page.customers','العملاء','الصفحات'),
('page.employees','الموظفون','الصفحات'),('page.attendance','الحضور والانصراف','الصفحات'),
('page.withdrawals','مسحوبات الموظفين','الصفحات'),('page.drivers','مندوبو التوصيل','الصفحات'),
('page.branches','الفروع','الصفحات'),('page.users','المستخدمون والصلاحيات','الصفحات'),
('page.reports','التقارير','الصفحات'),('page.daily-closing','حساب اليوم الكامل','الصفحات'),
('page.settings','الإعدادات','الصفحات')
on conflict (code) do update set name=excluded.name, group_name=excluded.group_name;

-- Generate yesterday absence rows. Safe to call daily from the app or a cron.
create or replace function public.generate_employee_absences(target_date date default current_date - 1)
returns integer language plpgsql security definer as $$
declare inserted_count integer;
begin
  insert into public.employee_absences(user_id, branch_id, absence_date, status)
  select s.user_id, s.branch_id, target_date, 'absent'
  from public.employee_schedules s
  join public.user_profiles p on p.id=s.user_id and coalesce(p.is_active,true)=true
  where s.weekday=extract(dow from target_date)::int and s.is_working_day=true
    and not exists (
      select 1 from public.attendance_records a
      where a.user_id=s.user_id and a.branch_id is not distinct from s.branch_id
        and a.record_type='check_in' and a.validation_status='valid'
        and a.created_at::date=target_date
    )
    and not exists (
      select 1 from public.employee_absences x
      where x.user_id=s.user_id and x.branch_id is not distinct from s.branch_id and x.absence_date=target_date
    );
  get diagnostics inserted_count = row_count;
  return inserted_count;
end $$;

alter table public.delivery_drivers enable row level security;
alter table public.employee_withdrawals enable row level security;
alter table public.employee_schedules enable row level security;
alter table public.employee_absences enable row level security;

do $$ begin
  create policy "authenticated delivery drivers" on public.delivery_drivers for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated withdrawals" on public.employee_withdrawals for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated schedules" on public.employee_schedules for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated absences" on public.employee_absences for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
