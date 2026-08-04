-- MOOD: سلة المحذوفات + تنبيهات المالك للتعديلات والحذف
create table if not exists public.trash_records (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_id text not null,
  entity_label text not null default '',
  record_data jsonb not null,
  related_records jsonb not null default '[]'::jsonb,
  deleted_by uuid null references auth.users(id) on delete set null,
  deleted_by_name text not null default '',
  deleted_by_email text not null default '',
  deleted_at timestamptz not null default now(),
  restored_at timestamptz null,
  restored_by uuid null references auth.users(id) on delete set null,
  permanently_deleted_at timestamptz null
);

create index if not exists trash_records_deleted_at_idx
  on public.trash_records (deleted_at desc);
create index if not exists trash_records_source_idx
  on public.trash_records (source_table, source_id);

alter table public.trash_records enable row level security;

-- القراءة والإدارة للمالك/المدير فقط. يعتمد على user_profiles + roles الموجودة في المشروع.
drop policy if exists "trash owner manager read" on public.trash_records;
create policy "trash owner manager read"
on public.trash_records for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    left join public.roles r on r.id = up.role_id
    where up.id = auth.uid()
      and lower(coalesce(r.name, '')) in ('owner', 'admin', 'manager')
  )
);

drop policy if exists "trash authenticated insert" on public.trash_records;
create policy "trash authenticated insert"
on public.trash_records for insert
to authenticated
with check (deleted_by = auth.uid() or deleted_by is null);

drop policy if exists "trash owner manager update" on public.trash_records;
create policy "trash owner manager update"
on public.trash_records for update
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    left join public.roles r on r.id = up.role_id
    where up.id = auth.uid()
      and lower(coalesce(r.name, '')) in ('owner', 'admin', 'manager')
  )
)
with check (
  exists (
    select 1
    from public.user_profiles up
    left join public.roles r on r.id = up.role_id
    where up.id = auth.uid()
      and lower(coalesce(r.name, '')) in ('owner', 'admin', 'manager')
  )
);

drop policy if exists "trash owner delete" on public.trash_records;
create policy "trash owner delete"
on public.trash_records for delete
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    left join public.roles r on r.id = up.role_id
    where up.id = auth.uid()
      and lower(coalesce(r.name, '')) in ('owner', 'admin')
  )
);

-- إضافة الجدول إلى Realtime حتى يظهر الحذف فورًا في الواجهة.
do $$
begin
  alter publication supabase_realtime add table public.trash_records;
exception
  when duplicate_object then null;
end $$;
