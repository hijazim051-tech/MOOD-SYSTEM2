begin;

-- MOOD v3: واجهة مستقلة لكل فرع مع مالك رئيسي واحد.
alter table if exists public.user_profiles add column if not exists branch_id uuid null references public.branches(id) on delete set null;
alter table if exists public.user_profiles add column if not exists access_all_branches boolean not null default false;
alter table if exists public.user_profiles add column if not exists branch_access_mode text not null default 'assigned' check (branch_access_mode in ('assigned','all'));

-- المالك الرئيسي والإدمن يشاهدان جميع الفروع.
update public.user_profiles
set access_all_branches = true, branch_access_mode = 'all'
where lower(coalesce(role,'')) in ('owner','admin');

-- إضافة branch_id لكل الجداول التشغيلية الموجودة فعلًا في قاعدة البيانات.
do $$
declare
  t text;
begin
  foreach t in array array[
    'orders','order_items','order_custom_items','purchase_invoices','purchases',
    'expenses','waste','stock_waste','inventory_movements','offers','inventory_offers',
    'ready_products','order_returns','packaging_logs','tasks','system_alerts',
    'owner_notifications','whatsapp_message_log','whatsapp_message_logs','supplier_payments'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I add column if not exists branch_id uuid null references public.branches(id) on delete set null', t);
      execute format('create index if not exists %I on public.%I(branch_id)', t || '_branch_id_idx', t);
    end if;
  end loop;
end $$;

-- إنشاء فرع افتراضي فقط إذا لم يوجد أي فرع.
insert into public.branches(name,code,address,is_active)
select 'الفرع الرئيسي','BR-01','',true
where not exists (select 1 from public.branches);

-- إسناد البيانات القديمة للفرع الأول حتى لا تختفي بعد التفعيل.
do $$
declare
  default_branch uuid;
  t text;
begin
  select id into default_branch from public.branches where is_active = true order by created_at nulls last, name limit 1;
  if default_branch is null then select id into default_branch from public.branches order by name limit 1; end if;

  if default_branch is not null then
    update public.user_profiles
    set branch_id = default_branch
    where branch_id is null and lower(coalesce(role,'')) not in ('owner','admin');

    foreach t in array array[
      'orders','order_items','order_custom_items','purchase_invoices','purchases',
      'expenses','waste','stock_waste','inventory_movements','offers','inventory_offers',
      'ready_products','order_returns','packaging_logs','tasks','system_alerts',
      'owner_notifications','whatsapp_message_log','whatsapp_message_logs','supplier_payments'
    ] loop
      if to_regclass('public.' || t) is not null then
        execute format('update public.%I set branch_id = $1 where branch_id is null', t) using default_branch;
      end if;
    end loop;
  end if;
end $$;

-- دوال آمنة تستعملها سياسات RLS بدون الدخول في تكرار سياسات user_profiles.
create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(role,'employee')) from public.user_profiles where id = auth.uid() limit 1
$$;

create or replace function public.current_profile_branch_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select branch_id from public.user_profiles where id = auth.uid() limit 1
$$;

create or replace function public.current_profile_can_view_all_branches()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(access_all_branches,false)
      or lower(coalesce(role,'')) in ('owner','admin')
  from public.user_profiles where id = auth.uid() limit 1
$$;

create or replace function public.can_access_branch(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_can_view_all_branches(),false)
      or p_branch_id = public.current_profile_branch_id()
$$;

grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.current_profile_branch_id() to authenticated;
grant execute on function public.current_profile_can_view_all_branches() to authenticated;
grant execute on function public.can_access_branch(uuid) to authenticated;

-- حماية الجداول المرتبطة بفرع: حتى تغيير الرابط يدويًا لا يكشف فرعًا آخر.
do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'orders','order_items','order_custom_items','purchase_invoices','purchases',
    'expenses','waste','stock_waste','inventory_movements','offers','inventory_offers',
    'ready_products','order_returns','packaging_logs','tasks','system_alerts',
    'owner_notifications','whatsapp_message_log','whatsapp_message_logs','supplier_payments',
    'branch_inventory','stock_transfers','employee_shifts','attendance_records','attendance_requests'
  ] loop
    if to_regclass('public.' || t) is not null
       and exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='branch_id') then
      execute format('alter table public.%I enable row level security', t);
      for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
        execute format('drop policy if exists %I on public.%I', p.policyname, t);
      end loop;
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.can_access_branch(branch_id)) with check (public.can_access_branch(branch_id))',
        t || '_branch_scope', t
      );
    end if;
  end loop;
end $$;

-- stock_transfers له فرعان بدل branch_id.
do $$
declare p record;
begin
  if to_regclass('public.stock_transfers') is not null then
    alter table public.stock_transfers enable row level security;
    for p in select policyname from pg_policies where schemaname='public' and tablename='stock_transfers' loop
      execute format('drop policy if exists %I on public.stock_transfers', p.policyname);
    end loop;
    create policy stock_transfers_branch_scope on public.stock_transfers
      for all to authenticated
      using (public.can_access_branch(from_branch_id) or public.can_access_branch(to_branch_id))
      with check (public.can_access_branch(from_branch_id) or public.can_access_branch(to_branch_id));
  end if;
end $$;

-- فهرس للمستخدمين حسب الفرع.
create index if not exists user_profiles_branch_id_idx on public.user_profiles(branch_id);

-- صلاحيات الواجهة الجديدة.
insert into public.app_permissions(code,name,group_name) values
('branches.switch_all','التبديل بين جميع الفروع','الفروع'),
('branches.view_own','عرض بيانات الفرع المعيّن','الفروع'),
('branches.owner','مالك فرع بصلاحيات موسعة لفرعه','الفروع'),
('branches.compare','مقارنة أداء الفروع','الفروع'),
('branches.transfer_stock','نقل المخزون بين الفروع','الفروع')
on conflict (code) do update set name=excluded.name, group_name=excluded.group_name;

commit;
