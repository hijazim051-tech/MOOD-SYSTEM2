-- MOOD final simplification: explicit stock alerts + stable WhatsApp PDF storage.
-- Run once in Supabase SQL Editor.

begin;

insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', true)
on conflict (id) do update set public = true;

drop policy if exists "mood invoice uploads" on storage.objects;
create policy "mood invoice uploads"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'invoices');

drop policy if exists "mood invoice reads" on storage.objects;
create policy "mood invoice reads"
on storage.objects
for select
to authenticated
using (bucket_id = 'invoices');

update public.branch_product_stock
set alert_limit = 0
where alert_limit is null;

update public.product_details
set alert_limit = 0
where alert_limit is null;

commit;
