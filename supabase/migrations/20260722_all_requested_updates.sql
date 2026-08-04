-- MOOD: تحديثات الهاتف، رقم مستلم الهدية، إشعارات المالك، والعروض
alter table public.orders add column if not exists recipient_phone text null;

create table if not exists public.owner_notifications (
  id uuid primary key default gen_random_uuid(),
  notification_type text not null default 'info',
  title text not null,
  message text not null default '',
  entity_table text null,
  entity_id text null,
  created_by uuid null references auth.users(id) on delete set null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists owner_notifications_created_at_idx on public.owner_notifications(created_at desc);
alter table public.owner_notifications enable row level security;
drop policy if exists "owner notifications insert" on public.owner_notifications;
create policy "owner notifications insert" on public.owner_notifications for insert to authenticated with check (true);
drop policy if exists "owner notifications owner read" on public.owner_notifications;
create policy "owner notifications owner read" on public.owner_notifications for select to authenticated using (
  exists (select 1 from public.user_profiles up left join public.roles r on r.id=up.role_id where up.id=auth.uid() and lower(coalesce(r.name,'')) in ('owner','admin'))
);
drop policy if exists "owner notifications owner update" on public.owner_notifications;
create policy "owner notifications owner update" on public.owner_notifications for update to authenticated using (
  exists (select 1 from public.user_profiles up left join public.roles r on r.id=up.role_id where up.id=auth.uid() and lower(coalesce(r.name,'')) in ('owner','admin'))
);

do $$ begin alter publication supabase_realtime add table public.owner_notifications; exception when duplicate_object then null; end $$;

create table if not exists public.inventory_offers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  product_detail_id bigint not null references public.product_details(id) on delete cascade,
  original_price numeric not null default 0,
  offer_price numeric not null check (offer_price >= 0),
  starts_at timestamptz null,
  ends_at timestamptz null,
  notes text null,
  is_active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inventory_offers_active_idx on public.inventory_offers(is_active, starts_at, ends_at);
alter table public.inventory_offers enable row level security;
drop policy if exists "offers authenticated read" on public.inventory_offers;
create policy "offers authenticated read" on public.inventory_offers for select to authenticated using (true);
drop policy if exists "offers authenticated manage" on public.inventory_offers;
create policy "offers authenticated manage" on public.inventory_offers for all to authenticated using (true) with check (true);
