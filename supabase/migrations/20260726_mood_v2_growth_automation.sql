begin;

create table if not exists public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id bigint not null references public.customers(id) on delete cascade,
  points numeric not null,
  reason text not null,
  order_id bigint null references public.orders(id) on delete set null,
  created_by uuid null references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  discount_type text not null default 'fixed' check (discount_type in ('fixed','percentage')),
  discount_value numeric not null check (discount_value > 0),
  minimum_order numeric not null default 0,
  max_uses int null,
  used_count int not null default 0,
  starts_at timestamptz null,
  expires_at timestamptz null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.user_profiles(id) on delete cascade,
  salary_type text not null default 'monthly' check (salary_type in ('monthly','hourly')),
  base_salary numeric not null default 0,
  hourly_rate numeric not null default 0,
  overtime_rate numeric not null default 0,
  late_deduction_per_minute numeric not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  name text not null,
  body text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.whatsapp_templates(template_key,name,body) values
('order_confirmed','تأكيد الطلب','مرحبًا {{customer_name}}، تم تأكيد طلبك رقم {{order_number}} بقيمة {{total}} د.ل.'),
('order_ready','الطلب جاهز','مرحبًا {{customer_name}}، طلبك رقم {{order_number}} جاهز للاستلام.'),
('out_for_delivery','خرج للتوصيل','طلبك رقم {{order_number}} خرج للتوصيل.'),
('thank_you','شكر بعد التسليم','شكرًا لاختيارك MOOD. يسعدنا تقييمك لخدمتنا.'),
('occasion_reminder','تذكير مناسبة','مرحبًا {{customer_name}}، نذكرك بمناسبتك القادمة ويسعدنا تجهيز هديتك.')
on conflict (template_key) do update set name=excluded.name, body=excluded.body, updated_at=now();

create table if not exists public.notification_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  digest_mode text not null default 'instant' check (digest_mode in ('instant','daily','weekly')),
  digest_time time not null default '08:00',
  weekday int null check (weekday between 0 and 6),
  quiet_from time null,
  quiet_to time null,
  is_active boolean not null default true,
  unique(user_id)
);

create or replace function public.adjust_customer_loyalty_points(
  p_customer_id bigint,
  p_points numeric,
  p_reason text
) returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.customers
  set loyalty_points = greatest(0, coalesce(loyalty_points,0) + p_points), updated_at=now()
  where id=p_customer_id;

  if not found then raise exception 'العميل غير موجود'; end if;

  insert into public.loyalty_transactions(customer_id,points,reason,created_by)
  values(p_customer_id,p_points,p_reason,auth.uid());
end;
$$;

grant execute on function public.adjust_customer_loyalty_points(bigint,numeric,text) to authenticated;

insert into public.app_permissions(code,name,group_name) values
('growth.view','عرض مركز النمو والتحليلات','التحليلات'),
('loyalty.manage','إدارة نقاط الولاء والكوبونات','العملاء'),
('payroll.view','عرض ساعات ورواتب الموظفين','الموظفون'),
('automation.manage','إدارة قوالب واتساب والأتمتة','الإعدادات')
on conflict (code) do update set name=excluded.name,group_name=excluded.group_name;

alter table public.loyalty_transactions enable row level security;
alter table public.coupons enable row level security;
alter table public.payroll_settings enable row level security;
alter table public.whatsapp_templates enable row level security;
alter table public.notification_schedules enable row level security;

do $$ declare t text; begin
  foreach t in array array['loyalty_transactions','coupons','payroll_settings','whatsapp_templates','notification_schedules'] loop
    execute format('drop policy if exists %I on public.%I', t || '_authenticated', t);
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', t || '_authenticated', t);
  end loop;
end $$;

commit;
