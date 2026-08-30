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
