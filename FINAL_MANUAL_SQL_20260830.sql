-- MOOD FINAL MANUAL SQL - 2026-08-30
-- Run this file ONCE in Supabase SQL Editor after deploying the frontend.
-- It combines the final safe/idempotent fixes in the required order.


-- ============================================================
-- SOURCE: supabase/migrations/20260830203000_account_inventory_stability.sql
-- ============================================================
-- MOOD 2026-08-30
-- Safe/idempotent stability fixes for balances and stock alerts.

begin;

-- Allow the dashboard's manual receivables/balance correction account.
alter table if exists public.financial_transactions
  drop constraint if exists financial_transactions_account_check;

alter table if exists public.financial_transactions
  add constraint financial_transactions_account_check
  check (account in ('cash','bank','balance'));

-- A zero alert limit explicitly means: do not notify.
update public.branch_product_stock
set alert_limit = 0
where alert_limit is null or alert_limit < 0;

update public.product_details
set alert_limit = 0
where alert_limit is null or alert_limit < 0;

notify pgrst, 'reload schema';
commit;


-- ============================================================
-- SOURCE: supabase/migrations/20260830215500_delivery_returns_finance_integrity.sql
-- ============================================================
-- MOOD 2026-08-30
-- Delivery/delegate settlement + return/cancellation financial and branch-stock integrity.
-- Safe additive migration with a unique timestamp.

begin;

-- 1) Mark an order as delivered by the delegate without falsely receiving delegate cash.
create or replace function public.mark_driver_delivered(p_order_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.orders%rowtype;
begin
  select * into r from public.orders where id = p_order_id for update;
  if not found then raise exception 'الطلب غير موجود'; end if;
  if coalesce(r.status,'') = 'cancelled' then raise exception 'الطلب ملغي'; end if;
  if coalesce(r.status,'') not in ('out_for_delivery','delivered') then
    raise exception 'الطلب ليس مع المندوب';
  end if;

  update public.orders
  set status = 'delivered',
      delivery_status = 'delivered',
      delivered_at = coalesce(delivered_at, now()),
      driver_money_status = case
        when greatest(coalesce(driver_collection_amount,0),0) > 0
          then coalesce(nullif(driver_money_status,''),'with_driver')
        when coalesce(driver_money_status,'') = 'with_driver' then 'settled'
        else coalesce(nullif(driver_money_status,''),'not_applicable')
      end,
      driver_money_received_at = case
        when greatest(coalesce(driver_collection_amount,0),0) <= 0
             and coalesce(driver_money_status,'') = 'with_driver'
          then coalesce(driver_money_received_at, now())
        else driver_money_received_at
      end
  where id = p_order_id;
end;
$$;
grant execute on function public.mark_driver_delivered(bigint) to authenticated;

-- 2) Receiving money from the delegate is a real customer collection.
-- It updates the order's cash amount; the existing order-finance trigger then posts it to the ledger once.
create or replace function public.settle_driver_money(p_order_id bigint, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.orders%rowtype;
  v_amount numeric := 0;
  v_remaining numeric := 0;
  v_new_paid numeric := 0;
begin
  select * into r from public.orders where id = p_order_id for update;
  if not found then raise exception 'الطلب غير موجود'; end if;
  if coalesce(r.status,'') = 'cancelled' then raise exception 'لا يمكن تسوية طلب ملغي'; end if;
  if coalesce(r.driver_money_status,'') = 'settled' then return; end if;
  if coalesce(r.driver_money_status,'') not in ('with_driver','received_now') then
    raise exception 'لا يوجد مبلغ مفتوح مع المندوب لهذا الطلب';
  end if;

  v_remaining := greatest(coalesce(r.remaining_amount,0),0);
  v_amount := greatest(coalesce(r.driver_collection_amount,0),0);
  if v_remaining > 0 then v_amount := least(v_amount, v_remaining); end if;
  v_new_paid := greatest(coalesce(r.paid_amount,0),0) + v_amount;

  update public.orders
  set cash_amount = greatest(coalesce(cash_amount,0),0) + v_amount,
      paid_amount = v_new_paid,
      remaining_amount = greatest(coalesce(total,0) - v_new_paid, 0),
      status = 'delivered',
      delivery_status = 'delivered',
      delivered_at = coalesce(delivered_at, now()),
      driver_money_status = 'settled',
      driver_money_received_at = now(),
      driver_money_notes = trim(concat_ws(' ', nullif(coalesce(driver_money_notes,''),''), nullif(coalesce(p_notes,''),'')))
  where id = p_order_id;
end;
$$;
grant execute on function public.settle_driver_money(bigint,text) to authenticated;

-- 3) Refunds are cash/bank outflows. Keep original sale entries and post each return as an opposite movement.
create or replace function public.sync_order_return_financial_transactions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.order_returns%rowtype;
  v_branch uuid;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;

  delete from public.financial_transactions
  where source_type = 'order_return' and source_id = r.id::text;

  if tg_op <> 'DELETE' and greatest(coalesce(r.refund_amount,0),0) > 0 then
    select branch_id into v_branch from public.orders where id = r.order_id;
    if v_branch is not null then
      insert into public.financial_transactions(
        branch_id, source_type, source_id, direction, account, amount, description, occurred_at
      ) values (
        v_branch, 'order_return', r.id::text, 'out', public.mood_account(r.refund_method),
        r.refund_amount, 'مبلغ مرتجع للطلب #' || r.order_id::text, coalesce(r.created_at,now())
      );
    end if;
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists trg_sync_order_return_finance on public.order_returns;
create trigger trg_sync_order_return_finance
after insert or update or delete on public.order_returns
for each row execute function public.sync_order_return_financial_transactions();

-- Backfill refund movements without touching other ledger sources.
delete from public.financial_transactions where source_type = 'order_return';
insert into public.financial_transactions(
  branch_id,source_type,source_id,direction,account,amount,description,occurred_at
)
select o.branch_id,'order_return',r.id::text,'out',public.mood_account(r.refund_method),r.refund_amount,
       'مبلغ مرتجع للطلب #'||r.order_id::text,coalesce(r.created_at,now())
from public.order_returns r
join public.orders o on o.id=r.order_id
where o.branch_id is not null and greatest(coalesce(r.refund_amount,0),0)>0;

-- 4) Return good items to the stock of the order branch, not the old global stock columns.
create or replace function public.process_order_return(
  p_order_id bigint,
  p_return_type text,
  p_reason text,
  p_notes text,
  p_refund_amount numeric,
  p_refund_method text,
  p_items jsonb
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_return_id bigint;
  v_item jsonb;
  v_source_type text;
  v_source_id text;
  v_name text;
  v_qty numeric;
  v_sold numeric;
  v_condition text;
  v_restored boolean;
  v_user uuid := auth.uid();
  v_branch uuid;
  v_paid numeric;
begin
  select branch_id, greatest(coalesce(paid_amount,0),0)
  into v_branch, v_paid
  from public.orders where id = p_order_id for update;
  if not found then raise exception 'الطلب غير موجود'; end if;
  if v_branch is null then raise exception 'الطلب غير مربوط بفرع. اربطه بالفرع أولًا'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'سبب الإرجاع مطلوب'; end if;
  if p_return_type not in ('full','partial') then raise exception 'نوع الإرجاع غير صحيح'; end if;
  if coalesce(p_refund_amount,0) < 0 then raise exception 'المبلغ المسترجع غير صحيح'; end if;
  if coalesce(p_refund_amount,0) > v_paid then raise exception 'المبلغ المسترجع أكبر من المبلغ المدفوع للطلب'; end if;

  insert into public.order_returns(order_id,return_type,reason,notes,refund_amount,refund_method,created_by)
  values(p_order_id,p_return_type,trim(p_reason),nullif(trim(coalesce(p_notes,'')),''),coalesce(p_refund_amount,0),coalesce(nullif(trim(p_refund_method),''),'cash'),v_user)
  returning id into v_return_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb))
  loop
    v_source_type := v_item->>'sourceType';
    v_source_id := nullif(v_item->>'sourceId','');
    v_name := coalesce(nullif(v_item->>'name',''),'عنصر');
    v_qty := coalesce((v_item->>'returnQuantity')::numeric,0);
    v_sold := coalesce((v_item->>'soldQuantity')::numeric,0);
    v_condition := v_item->>'condition';
    v_restored := false;

    if v_source_type not in ('product_detail','usage_tier','external') then raise exception 'مصدر عنصر الإرجاع غير صحيح'; end if;
    if v_condition not in ('good','damaged') then raise exception 'حالة عنصر الإرجاع غير صحيحة'; end if;
    if v_qty <= 0 or v_qty > v_sold then raise exception 'كمية الإرجاع غير صحيحة للعنصر %', v_name; end if;

    if v_condition = 'good' and v_source_type = 'product_detail' and v_source_id is not null then
      insert into public.branch_product_stock(branch_id,product_detail_id,stock,average_unit_cost,updated_at)
      values(v_branch,v_source_id::bigint,v_qty,0,now())
      on conflict(branch_id,product_detail_id) do update
      set stock=coalesce(public.branch_product_stock.stock,0)+excluded.stock,updated_at=now();
      v_restored := true;
    elsif v_condition = 'good' and v_source_type = 'usage_tier' and v_source_id is not null then
      update public.usage_price_tiers
      set stock=coalesce(stock,0)+v_qty,updated_at=now()
      where branch_id=v_branch and usage_price=v_source_id::numeric;
      if found then v_restored := true; else raise exception 'فئة الاستخدام غير موجودة في فرع الطلب: %', v_name; end if;
    end if;

    insert into public.order_return_items(return_id,source_type,source_id,item_name,sold_quantity,return_quantity,item_condition,restored_to_stock)
    values(v_return_id,v_source_type,v_source_id,v_name,v_sold,v_qty,v_condition,v_restored);
  end loop;

  update public.orders
  set status = case when p_return_type = 'full' then 'returned' else 'partially_returned' end,
      delivery_status = case when p_return_type = 'full' then 'returned' else delivery_status end
  where id = p_order_id;

  if to_regclass('public.owner_notifications') is not null then
    insert into public.owner_notifications(notification_type,title,message,entity_table,entity_id,created_by)
    values('order_return','تم تسجيل مرتجع',format('تم إرجاع الطلب #%s. السبب: %s. المبلغ المسترجع: %s د.ل',p_order_id,p_reason,coalesce(p_refund_amount,0)),'orders',p_order_id::text,v_user);
  end if;

  return v_return_id;
end;
$$;
grant execute on function public.process_order_return(bigint,text,text,text,numeric,text,jsonb) to authenticated;

-- 5) Cancellation restores every stock movement belonging to the order once.
create or replace function public.cancel_order_and_restore_stock(p_order_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders%rowtype;
  c record;
begin
  select * into o from public.orders where id=p_order_id for update;
  if not found then raise exception 'الطلب غير موجود'; end if;
  if coalesce(o.status,'')='cancelled' then return; end if;
  if coalesce(o.status,'') in ('delivered','returned','partially_returned') then
    raise exception 'لا يمكن إلغاء طلب تم تسليمه أو إرجاعه';
  end if;
  if o.branch_id is null then raise exception 'الطلب غير مربوط بفرع'; end if;

  if coalesce(o.inventory_allocated,false) then
    for c in
      select occ.product_detail_id,sum(coalesce(occ.quantity,0)) qty
      from public.order_custom_item_components occ
      join public.order_custom_items oi on oi.id=occ.custom_item_id
      where oi.order_id=p_order_id and coalesce(occ.is_external,false)=false and occ.product_detail_id is not null
      group by occ.product_detail_id
    loop
      insert into public.branch_product_stock(branch_id,product_detail_id,stock,average_unit_cost,updated_at)
      values(o.branch_id,c.product_detail_id,c.qty,0,now())
      on conflict(branch_id,product_detail_id) do update
      set stock=coalesce(public.branch_product_stock.stock,0)+excluded.stock,updated_at=now();
    end loop;

    -- Content categories consumed during packaging.
    for c in
      select u.usage_price,sum(coalesce(u.quantity,0)) qty
      from public.order_item_usage_tiers u
      join public.order_items i on i.id=u.order_item_id
      where i.order_id=p_order_id
      group by u.usage_price
    loop
      update public.usage_price_tiers
      set stock=coalesce(stock,0)+c.qty,updated_at=now()
      where branch_id=o.branch_id and usage_price=c.usage_price;
    end loop;

    -- Actual wrapping sheets consumed during bouquet packaging.
    for c in
      select w.product_detail_id,sum(coalesce(w.actual_quantity,0)) qty
      from public.order_item_wrapping_options w
      join public.order_items i on i.id=w.order_item_id
      where i.order_id=p_order_id and w.product_detail_id is not null and coalesce(w.actual_quantity,0)>0
      group by w.product_detail_id
    loop
      insert into public.branch_product_stock(branch_id,product_detail_id,stock,average_unit_cost,updated_at)
      values(o.branch_id,c.product_detail_id,c.qty,0,now())
      on conflict(branch_id,product_detail_id) do update
      set stock=coalesce(public.branch_product_stock.stock,0)+excluded.stock,updated_at=now();
    end loop;
  end if;

  update public.orders
  set status='cancelled',
      delivery_status='cancelled',
      inventory_allocated=false,
      driver_money_status='not_applicable',
      driver_collection_amount=0
  where id=p_order_id;
end;
$$;
grant execute on function public.cancel_order_and_restore_stock(bigint) to authenticated;

commit;


-- ============================================================
-- SOURCE: supabase/migrations/20260830223500_return_value_and_profit_integrity.sql
-- ============================================================
begin;

-- قيمة المرتجع منفصلة عن المبلغ الذي تم رده نقديًا/مصرفيًا.
alter table if exists public.order_returns
  add column if not exists return_value numeric(12,2) not null default 0;

-- تأكيد ربط المرتجع بالفرع حتى لو كانت قاعدة البيانات أقدم من ترقية عزل الفروع.
alter table if exists public.order_returns
  add column if not exists branch_id uuid null references public.branches(id) on delete set null;
create index if not exists order_returns_branch_id_idx on public.order_returns(branch_id);
update public.order_returns r
set branch_id = o.branch_id
from public.orders o
where o.id = r.order_id and r.branch_id is null and o.branch_id is not null;

-- البيانات القديمة: عند غياب قيمة المرتجع نستخدم المبلغ المسترجع كأفضل قيمة متاحة.
update public.order_returns
set return_value = greatest(coalesce(refund_amount,0),0)
where coalesce(return_value,0)=0 and greatest(coalesce(refund_amount,0),0)>0;

-- التوقيع يطابق الواجهة الحالية حرفيًا، ويضمن ربط المرتجع بنفس فرع الطلب.
create or replace function public.process_order_return(
  p_order_id bigint,
  p_return_type text,
  p_reason text,
  p_notes text,
  p_refund_amount numeric,
  p_refund_method text,
  p_items jsonb,
  p_return_value numeric,
  p_branch_id uuid
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_return_id bigint;
  v_item jsonb;
  v_source_type text;
  v_source_id text;
  v_name text;
  v_qty numeric;
  v_sold numeric;
  v_condition text;
  v_restored boolean;
  v_user uuid := auth.uid();
  v_branch uuid;
  v_order_branch uuid;
  v_paid numeric;
begin
  select branch_id, greatest(coalesce(paid_amount,0),0)
    into v_order_branch, v_paid
  from public.orders
  where id=p_order_id
  for update;

  if not found then raise exception 'الطلب غير موجود'; end if;

  v_branch := coalesce(v_order_branch,p_branch_id);
  if v_branch is null then raise exception 'الطلب غير مربوط بفرع'; end if;
  if p_branch_id is not null and v_order_branch is not null and p_branch_id <> v_order_branch then
    raise exception 'فرع المرتجع لا يطابق فرع الطلب';
  end if;

  -- للطلبات القديمة غير المربوطة بفرع، نربطها بالفرع الذي جرى الإرجاع منه.
  if v_order_branch is null then
    update public.orders set branch_id=v_branch where id=p_order_id;
  end if;

  if coalesce(trim(p_reason),'') = '' then raise exception 'سبب الإرجاع مطلوب'; end if;
  if p_return_type not in ('full','partial') then raise exception 'نوع الإرجاع غير صحيح'; end if;
  if coalesce(p_refund_amount,0) < 0 then raise exception 'المبلغ المسترجع غير صحيح'; end if;
  if coalesce(p_return_value,0) <= 0 then raise exception 'قيمة المرتجع غير صحيحة'; end if;
  if coalesce(p_refund_amount,0) > v_paid then raise exception 'المبلغ المسترجع أكبر من المبلغ المدفوع للطلب'; end if;

  insert into public.order_returns(
    order_id,return_type,reason,notes,return_value,refund_amount,refund_method,created_by,branch_id
  ) values(
    p_order_id,p_return_type,trim(p_reason),nullif(trim(coalesce(p_notes,'')),''),
    greatest(coalesce(p_return_value,0),0),greatest(coalesce(p_refund_amount,0),0),
    coalesce(nullif(trim(p_refund_method),''),'cash'),v_user,v_branch
  ) returning id into v_return_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb))
  loop
    v_source_type := v_item->>'sourceType';
    v_source_id := nullif(v_item->>'sourceId','');
    v_name := coalesce(nullif(v_item->>'name',''),'عنصر');
    v_qty := coalesce((v_item->>'returnQuantity')::numeric,0);
    v_sold := coalesce((v_item->>'soldQuantity')::numeric,0);
    v_condition := v_item->>'condition';
    v_restored := false;

    if v_source_type not in ('product_detail','usage_tier','external') then
      raise exception 'مصدر عنصر الإرجاع غير صحيح';
    end if;
    if v_condition not in ('good','damaged') then
      raise exception 'حالة عنصر الإرجاع غير صحيحة';
    end if;
    if v_qty <= 0 or v_qty > v_sold then
      raise exception 'كمية الإرجاع غير صحيحة للعنصر %', v_name;
    end if;

    if v_condition='good' and v_source_type='product_detail' and v_source_id is not null then
      insert into public.branch_product_stock(branch_id,product_detail_id,stock,average_unit_cost,updated_at)
      values(v_branch,v_source_id::bigint,v_qty,0,now())
      on conflict(branch_id,product_detail_id) do update
      set stock=coalesce(public.branch_product_stock.stock,0)+excluded.stock,
          updated_at=now();
      v_restored := true;
    elsif v_condition='good' and v_source_type='usage_tier' and v_source_id is not null then
      update public.usage_price_tiers
      set stock=coalesce(stock,0)+v_qty,updated_at=now()
      where branch_id=v_branch and usage_price=v_source_id::numeric;
      if found then
        v_restored := true;
      else
        raise exception 'فئة الاستخدام غير موجودة في فرع الطلب: %', v_name;
      end if;
    end if;

    insert into public.order_return_items(
      return_id,source_type,source_id,item_name,sold_quantity,return_quantity,item_condition,restored_to_stock
    ) values(
      v_return_id,v_source_type,v_source_id,v_name,v_sold,v_qty,v_condition,v_restored
    );
  end loop;

  update public.orders
  set status = case when p_return_type='full' then 'returned' else 'partially_returned' end,
      delivery_status = case when p_return_type='full' then 'returned' else delivery_status end
  where id=p_order_id;

  if to_regclass('public.owner_notifications') is not null then
    insert into public.owner_notifications(notification_type,title,message,entity_table,entity_id,created_by,branch_id)
    values(
      'order_return','تم تسجيل مرتجع',
      format('تم إرجاع الطلب #%s. السبب: %s. قيمة المرتجع: %s د.ل، المبلغ المسترجع: %s د.ل',
        p_order_id,p_reason,coalesce(p_return_value,0),coalesce(p_refund_amount,0)),
      'orders',p_order_id::text,v_user,v_branch
    );
  end if;

  return v_return_id;
end;
$$;

grant execute on function public.process_order_return(bigint,text,text,text,numeric,text,jsonb,numeric,uuid) to authenticated;

commit;


-- ============================================================
-- SOURCE: supabase/migrations/20260830233000_supplier_purchase_balance_integrity.sql
-- ============================================================
-- MOOD 2026-08-30
-- Purchase/supplier payment/current-balance integrity.
-- Run manually in Supabase SQL Editor because this project has legacy duplicate migration versions.

begin;

-- Never allow an invoice to record a negative amount or more paid than its grand total.
create or replace function public.validate_purchase_invoice_amounts()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.grand_total, 0) < 0 then
    raise exception 'إجمالي فاتورة المشتريات لا يمكن أن يكون سالبًا';
  end if;
  if coalesce(new.paid_amount, 0) < 0 then
    raise exception 'المبلغ المدفوع لا يمكن أن يكون سالبًا';
  end if;
  if coalesce(new.paid_amount, 0) > coalesce(new.grand_total, 0) then
    raise exception 'المبلغ المدفوع لا يمكن أن يتجاوز إجمالي فاتورة المشتريات';
  end if;
  new.remaining_amount := greatest(coalesce(new.grand_total,0) - coalesce(new.paid_amount,0), 0);
  return new;
end;
$$;

drop trigger if exists trg_validate_purchase_invoice_amounts on public.purchase_invoices;
create trigger trg_validate_purchase_invoice_amounts
before insert or update of grand_total, paid_amount, remaining_amount on public.purchase_invoices
for each row execute function public.validate_purchase_invoice_amounts();

-- Supplier payments leave the selected cash/bank account on the actual payment date.
create or replace function public.sync_supplier_payment_financial_transactions()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.supplier_payments%rowtype;
begin
  if tg_op='DELETE' then r:=old; else r:=new; end if;

  delete from public.financial_transactions
  where source_type='supplier_payment' and source_id=r.id::text;

  if tg_op<>'DELETE' and r.branch_id is not null and coalesce(r.amount,0)>0 then
    insert into public.financial_transactions(
      branch_id,source_type,source_id,direction,account,amount,description,occurred_at
    ) values(
      r.branch_id,
      'supplier_payment',
      r.id::text,
      'out',
      public.mood_account(r.payment_method),
      r.amount,
      'دفعة مورد',
      coalesce(r.payment_date,current_date)::timestamp
    );
  end if;

  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists trg_sync_supplier_payment_finance on public.supplier_payments;
create trigger trg_sync_supplier_payment_finance
  after insert or update or delete on public.supplier_payments
  for each row execute function public.sync_supplier_payment_financial_transactions();

-- Rebuild only supplier-payment ledger rows so existing payments use payment_date.
delete from public.financial_transactions where source_type='supplier_payment';
insert into public.financial_transactions(
  branch_id,source_type,source_id,direction,account,amount,description,occurred_at
)
select
  sp.branch_id,
  'supplier_payment',
  sp.id::text,
  'out',
  public.mood_account(sp.payment_method),
  sp.amount,
  'دفعة مورد',
  coalesce(sp.payment_date,current_date)::timestamp
from public.supplier_payments sp
where sp.branch_id is not null and coalesce(sp.amount,0)>0;

commit;

