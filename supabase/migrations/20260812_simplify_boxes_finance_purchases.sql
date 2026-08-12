-- MOOD 2026-08-12
-- Simplified boxes + future orders + exact cash/bank ledger + editable purchases.

begin;

-- External purchases now explicitly record how they were paid.
alter table if exists public.order_item_external_contents
  add column if not exists payment_method text not null default 'cash';

alter table if exists public.employee_withdrawals
  add column if not exists payment_method text not null default 'cash';

-- One source of truth for the current cash/bank balance.
create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  source_type text not null,
  source_id text not null,
  direction text not null check (direction in ('in','out')),
  account text not null check (account in ('cash','bank')),
  amount numeric not null check (amount >= 0),
  description text not null default '',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists financial_transactions_branch_date_idx
  on public.financial_transactions(branch_id, occurred_at desc);
create index if not exists financial_transactions_source_idx
  on public.financial_transactions(source_type, source_id);

alter table public.financial_transactions enable row level security;
drop policy if exists "financial transactions authenticated" on public.financial_transactions;
create policy "financial transactions authenticated"
  on public.financial_transactions for all to authenticated
  using (true) with check (true);
grant select,insert,update,delete on public.financial_transactions to authenticated;

create or replace function public.mood_account(p_method text)
returns text language sql immutable as $$
  select case
    when lower(coalesce(p_method,'')) in ('bank','bank_transfer','transfer','card','مصرف','تحويل') then 'bank'
    else 'cash'
  end
$$;

-- Orders: every actually received amount enters the correct account.
create or replace function public.sync_order_financial_transactions()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  r public.orders%rowtype;
  v_cash numeric:=0; v_bank numeric:=0; v_dep numeric:=0;
begin
  if tg_op='DELETE' then r:=old; else r:=new; end if;
  delete from public.financial_transactions
   where source_type in ('order_sale','order_delivery') and source_id=r.id::text;

  if tg_op<>'DELETE' and r.branch_id is not null and coalesce(r.status,'')<>'cancelled' then
    v_cash:=greatest(coalesce(r.cash_amount,0),0);
    v_bank:=greatest(coalesce(r.bank_amount,0),0)+greatest(coalesce(r.transfer_amount,0),0);
    v_dep:=greatest(coalesce(r.deposit_amount,0),0);
    if lower(coalesce(r.deposit_method,'')) in ('bank','bank_transfer','transfer') then v_bank:=v_bank+v_dep;
    elsif lower(coalesce(r.deposit_method,'')) not in ('balance','credit') then v_cash:=v_cash+v_dep; end if;

    if v_cash>0 then insert into public.financial_transactions(branch_id,source_type,source_id,direction,account,amount,description,occurred_at)
      values(r.branch_id,'order_sale',r.id::text,'in','cash',v_cash,'مبيعات/دفعات الطلب '||coalesce(r.order_number,r.id::text),coalesce(r.created_at,now())); end if;
    if v_bank>0 then insert into public.financial_transactions(branch_id,source_type,source_id,direction,account,amount,description,occurred_at)
      values(r.branch_id,'order_sale',r.id::text,'in','bank',v_bank,'مبيعات/دفعات الطلب '||coalesce(r.order_number,r.id::text),coalesce(r.created_at,now())); end if;
    if coalesce(r.delivery_cash_expense,0)>0 then insert into public.financial_transactions(branch_id,source_type,source_id,direction,account,amount,description,occurred_at)
      values(r.branch_id,'order_delivery',r.id::text,'out',public.mood_account(r.delivery_payment_method),r.delivery_cash_expense,'توصيل مدفوع من المحل للطلب '||coalesce(r.order_number,r.id::text),coalesce(r.created_at,now())); end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;

drop trigger if exists trg_sync_order_finance on public.orders;
create trigger trg_sync_order_finance after insert or update or delete on public.orders
for each row execute function public.sync_order_financial_transactions();

-- Purchases: only the amount actually paid leaves cash/bank. Credit remains a liability.
create or replace function public.sync_purchase_financial_transactions()
returns trigger language plpgsql security definer set search_path=public as $$
declare r public.purchase_invoices%rowtype;
begin
 if tg_op='DELETE' then r:=old; else r:=new; end if;
 delete from public.financial_transactions where source_type='purchase_invoice' and source_id=r.id::text;
 if tg_op<>'DELETE' and greatest(coalesce(r.paid_amount,0),0)>0 then
  insert into public.financial_transactions(branch_id,source_type,source_id,direction,account,amount,description,occurred_at)
  values(r.branch_id,'purchase_invoice',r.id::text,'out',public.mood_account(r.payment_method),r.paid_amount,'فاتورة مشتريات '||coalesce(r.invoice_no,r.id::text),coalesce(r.created_at,now()));
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
drop trigger if exists trg_sync_purchase_finance on public.purchase_invoices;
create trigger trg_sync_purchase_finance after insert or update or delete on public.purchase_invoices
for each row execute function public.sync_purchase_financial_transactions();

-- Expenses/liabilities: deduct only what was actually paid now.
create or replace function public.sync_expense_financial_transactions()
returns trigger language plpgsql security definer set search_path=public as $$
declare r public.expenses%rowtype; v numeric;
begin
 if tg_op='DELETE' then r:=old; else r:=new; end if;
 delete from public.financial_transactions where source_type='expense' and source_id=r.id::text;
 if tg_op<>'DELETE' and r.branch_id is not null then
  v:=case when coalesce(r.accounting_type,'operating')='liability' then greatest(coalesce(r.paid_amount,0),0) else greatest(coalesce(r.paid_amount,r.amount,0),0) end;
  if v>0 then insert into public.financial_transactions(branch_id,source_type,source_id,direction,account,amount,description,occurred_at)
   values(r.branch_id,'expense',r.id::text,'out',public.mood_account(r.payment_method),v,'مصروف: '||coalesce(r.category_name_snapshot,r.expense_type,'مصروف'),coalesce(r.created_at,now())); end if;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
drop trigger if exists trg_sync_expense_finance on public.expenses;
create trigger trg_sync_expense_finance after insert or update or delete on public.expenses
for each row execute function public.sync_expense_financial_transactions();

-- External purchase inside an order: this is a real cash/bank expense too.
create or replace function public.sync_external_purchase_financial_transactions()
returns trigger language plpgsql security definer set search_path=public as $$
declare r public.order_item_external_contents%rowtype; v_branch uuid; v_order bigint; v_amount numeric;
begin
 if tg_op='DELETE' then r:=old; else r:=new; end if;
 delete from public.financial_transactions where source_type='order_external_purchase' and source_id=r.id::text;
 if tg_op<>'DELETE' then
   select o.id,o.branch_id into v_order,v_branch from public.order_items oi join public.orders o on o.id=oi.order_id where oi.id=r.order_item_id;
   v_amount:=greatest(coalesce(r.quantity,0)*coalesce(r.unit_cost,0),0);
   if v_branch is not null and v_amount>0 then
    insert into public.financial_transactions(branch_id,source_type,source_id,direction,account,amount,description,occurred_at)
    values(v_branch,'order_external_purchase',r.id::text,'out',public.mood_account(r.payment_method),v_amount,'شراء خارجي للطلب #'||coalesce(v_order::text,''),now());
   end if;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
drop trigger if exists trg_sync_external_purchase_finance on public.order_item_external_contents;
create trigger trg_sync_external_purchase_finance after insert or update or delete on public.order_item_external_contents
for each row execute function public.sync_external_purchase_financial_transactions();

-- Supplier payments.
create or replace function public.sync_supplier_payment_financial_transactions()
returns trigger language plpgsql security definer set search_path=public as $$
declare r public.supplier_payments%rowtype;
begin
 if tg_op='DELETE' then r:=old; else r:=new; end if;
 delete from public.financial_transactions where source_type='supplier_payment' and source_id=r.id::text;
 if tg_op<>'DELETE' and r.branch_id is not null and coalesce(r.amount,0)>0 then
  insert into public.financial_transactions(branch_id,source_type,source_id,direction,account,amount,description,occurred_at)
  values(r.branch_id,'supplier_payment',r.id::text,'out',public.mood_account(r.payment_method),r.amount,'دفعة مورد',coalesce(r.created_at,now()));
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
drop trigger if exists trg_sync_supplier_payment_finance on public.supplier_payments;
create trigger trg_sync_supplier_payment_finance after insert or update or delete on public.supplier_payments
for each row execute function public.sync_supplier_payment_financial_transactions();

-- Employee withdrawals.
create or replace function public.sync_employee_withdrawal_financial_transactions()
returns trigger language plpgsql security definer set search_path=public as $$
declare r public.employee_withdrawals%rowtype;
begin
 if tg_op='DELETE' then r:=old; else r:=new; end if;
 delete from public.financial_transactions where source_type='employee_withdrawal' and source_id=r.id::text;
 if tg_op<>'DELETE' and r.branch_id is not null and coalesce(r.status,'approved')='approved' and coalesce(r.amount,0)>0 then
  insert into public.financial_transactions(branch_id,source_type,source_id,direction,account,amount,description,occurred_at)
  values(r.branch_id,'employee_withdrawal',r.id::text,'out',public.mood_account(r.payment_method),r.amount,'مسحوب موظف',coalesce(r.created_at,now()));
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
drop trigger if exists trg_sync_employee_withdrawal_finance on public.employee_withdrawals;
create trigger trg_sync_employee_withdrawal_finance after insert or update or delete on public.employee_withdrawals
for each row execute function public.sync_employee_withdrawal_financial_transactions();

-- Future-order allocation. Returns JSON expected by Orders.tsx.
drop function if exists public.allocate_order_inventory(bigint);
create or replace function public.allocate_order_inventory(p_order_id bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o record; c record; available numeric; missing text:=''; has_packaging boolean:=false;
begin
 select id,order_number,branch_id,status,coalesce(inventory_allocated,false) inventory_allocated into o from public.orders where id=p_order_id for update;
 if not found then return jsonb_build_object('success',false,'message','الطلب غير موجود'); end if;
 if o.inventory_allocated then return jsonb_build_object('success',true,'message','المخزون مخصص مسبقًا'); end if;
 for c in select occ.product_detail_id,max(occ.component_name) component_name,sum(coalesce(occ.quantity,0)) qty
          from public.order_custom_item_components occ join public.order_custom_items oi on oi.id=occ.custom_item_id
          where oi.order_id=p_order_id and coalesce(occ.is_external,false)=false and occ.product_detail_id is not null group by occ.product_detail_id loop
   select coalesce(stock,0) into available from public.branch_product_stock where branch_id=o.branch_id and product_detail_id=c.product_detail_id for update;
   available:=coalesce(available,0);
   if available<c.qty then missing:=missing||case when missing='' then '' else E'\n' end||coalesce(c.component_name,'مادة')||': المطلوب '||c.qty||' / المتوفر '||available; end if;
 end loop;
 if missing<>'' then return jsonb_build_object('success',false,'message','المخزون غير كافٍ:'||E'\n'||missing); end if;
 for c in select occ.product_detail_id,max(occ.component_name) component_name,sum(coalesce(occ.quantity,0)) qty
          from public.order_custom_item_components occ join public.order_custom_items oi on oi.id=occ.custom_item_id
          where oi.order_id=p_order_id and coalesce(occ.is_external,false)=false and occ.product_detail_id is not null group by occ.product_detail_id loop
   update public.branch_product_stock set stock=stock-c.qty,updated_at=now() where branch_id=o.branch_id and product_detail_id=c.product_detail_id;
 end loop;
 select exists(select 1 from public.order_items where order_id=p_order_id and coalesce(packaging_status,'pending')<>'completed') into has_packaging;
 update public.orders set inventory_allocated=true,inventory_allocated_at=now(),status=case when has_packaging then 'packaging' else 'ready' end where id=p_order_id;
 return jsonb_build_object('success',true,'message','تم تخصيص المخزون');
end $$;
grant execute on function public.allocate_order_inventory(bigint) to authenticated;

-- Edit an existing purchase invoice safely: reverse its old stock contribution, then apply the new rows.
create or replace function public.update_purchase_invoice(
  p_invoice_id uuid,
  p_branch_id uuid,
  p_supplier_id uuid,
  p_supplier_name text,
  p_invoice_no text,
  p_invoice_date date,
  p_purchase_mode text,
  p_delivery_cost numeric,
  p_other_costs numeric,
  p_paid_amount numeric,
  p_payment_method text,
  p_notes text,
  p_items jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare
 oldi record; v_item jsonb; subtotal numeric:=0; grand numeric:=0; remain numeric:=0;
 q numeric; price numeric; line numeric; weight numeric; ad numeric; ao numeric; effective numeric;
 current_stock numeric; current_avg numeric; new_stock numeric; new_avg numeric;
 pd bigint; old_q numeric; old_eff numeric; delta_q numeric; oldrow record;
begin
 select * into oldi from public.purchase_invoices
 where id=p_invoice_id and branch_id=p_branch_id for update;
 if not found then raise exception 'فاتورة المشتريات غير موجودة في الفرع الحالي'; end if;

 create temporary table if not exists tmp_mood_old_purchase_items(
   product_detail_id bigint primary key,
   quantity numeric not null default 0,
   effective_unit_cost numeric not null default 0
 ) on commit drop;
 truncate table tmp_mood_old_purchase_items;

 insert into tmp_mood_old_purchase_items(product_detail_id,quantity,effective_unit_cost)
 select product_detail_id,
        sum(coalesce(quantity,0)),
        case when sum(coalesce(quantity,0))>0
             then sum(coalesce(quantity,0)*coalesce(effective_unit_cost,unit_purchase_price,0))/sum(coalesce(quantity,0))
             else 0 end
 from public.purchase_invoice_items
 where purchase_invoice_id=p_invoice_id and product_detail_id is not null
 group by product_detail_id;

 select coalesce(sum((e->>'quantity')::numeric*(e->>'unitPurchasePrice')::numeric),0)
 into subtotal from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) e;

 grand:=subtotal+greatest(coalesce(p_delivery_cost,0),0)+greatest(coalesce(p_other_costs,0),0);
 remain:=greatest(grand-greatest(coalesce(p_paid_amount,0),0),0);

 update public.purchase_invoices set
   supplier_id=p_supplier_id,
   supplier_name_snapshot=coalesce(p_supplier_name,''),
   invoice_no=coalesce(p_invoice_no,''),
   invoice_date=coalesce(p_invoice_date,current_date),
   purchase_mode=coalesce(p_purchase_mode,'cash'),
   items_subtotal=subtotal,
   delivery_cost=greatest(coalesce(p_delivery_cost,0),0),
   other_costs=greatest(coalesce(p_other_costs,0),0),
   grand_total=grand,
   paid_amount=greatest(coalesce(p_paid_amount,0),0),
   remaining_amount=remain,
   payment_method=coalesce(p_payment_method,'cash'),
   notes=coalesce(p_notes,'')
 where id=p_invoice_id;

 delete from public.purchase_invoice_items where purchase_invoice_id=p_invoice_id;

 for v_item in select * from jsonb_array_elements(p_items) loop
   pd:=nullif(v_item->>'productDetailId','')::bigint;
   q:=coalesce(nullif(v_item->>'quantity','')::numeric,0);
   price:=coalesce(nullif(v_item->>'unitPurchasePrice','')::numeric,0);
   if pd is null or q<=0 then raise exception 'بيانات بند المشتريات غير صحيحة'; end if;

   line:=q*price;
   weight:=case when subtotal>0 then line/subtotal else 0 end;
   ad:=greatest(coalesce(p_delivery_cost,0),0)*weight;
   ao:=greatest(coalesce(p_other_costs,0),0)*weight;
   effective:=(line+ad+ao)/q;

   select quantity,effective_unit_cost into old_q,old_eff
   from tmp_mood_old_purchase_items where product_detail_id=pd;
   old_q:=coalesce(old_q,0); old_eff:=coalesce(old_eff,0);
   delta_q:=q-old_q;

   select stock,average_unit_cost into current_stock,current_avg
   from public.branch_product_stock
   where branch_id=p_branch_id and product_detail_id=pd for update;
   current_stock:=coalesce(current_stock,0);
   current_avg:=coalesce(current_avg,0);
   new_stock:=greatest(current_stock+delta_q,0);

   if delta_q>0 then
     new_avg:=case when new_stock>0
       then (current_stock*current_avg + delta_q*effective)/new_stock else 0 end;
   elsif delta_q=0 and current_stock>0 and old_q>0 then
     new_avg:=greatest((current_stock*current_avg + old_q*(effective-old_eff))/current_stock,0);
   else
     new_avg:=case when new_stock>0 then current_avg else 0 end;
   end if;

   insert into public.branch_product_stock(branch_id,product_detail_id,stock,average_unit_cost,updated_at)
   values(p_branch_id,pd,new_stock,new_avg,now())
   on conflict(branch_id,product_detail_id) do update
   set stock=excluded.stock,average_unit_cost=excluded.average_unit_cost,updated_at=now();

   insert into public.purchase_invoice_items(
     purchase_invoice_id,item_kind,product_detail_id,item_name_snapshot,detail_name_snapshot,
     quantity,unit_purchase_price,allocated_delivery_cost,allocated_other_cost,effective_unit_cost,line_subtotal,notes
   ) values(
     p_invoice_id,'product_detail',pd,coalesce(v_item->>'productName',''),coalesce(v_item->>'detailName',''),
     q,price,ad,ao,effective,line,coalesce(v_item->>'notes','')
   );

   delete from tmp_mood_old_purchase_items where product_detail_id=pd;
 end loop;

 -- Any old product removed completely from the edited invoice reduces current stock by its old invoice quantity.
 for oldrow in select * from tmp_mood_old_purchase_items loop
   select stock,average_unit_cost into current_stock,current_avg
   from public.branch_product_stock
   where branch_id=p_branch_id and product_detail_id=oldrow.product_detail_id for update;
   new_stock:=greatest(coalesce(current_stock,0)-coalesce(oldrow.quantity,0),0);
   update public.branch_product_stock
   set stock=new_stock,
       average_unit_cost=case when new_stock>0 then coalesce(current_avg,0) else 0 end,
       updated_at=now()
   where branch_id=p_branch_id and product_detail_id=oldrow.product_detail_id;
 end loop;

 return p_invoice_id;
end $$;
grant execute on function public.update_purchase_invoice(uuid,uuid,uuid,text,text,date,text,numeric,numeric,numeric,text,text,jsonb) to authenticated;

-- Rebuild the ledger from existing records once, so the current balance starts accurate.
truncate table public.financial_transactions;
insert into public.financial_transactions(branch_id,source_type,source_id,direction,account,amount,description,occurred_at)
select branch_id,'order_sale',id::text,'in','cash',greatest(coalesce(cash_amount,0),0)+case when lower(coalesce(deposit_method,'')) not in ('bank','bank_transfer','transfer','balance','credit') then greatest(coalesce(deposit_amount,0),0) else 0 end,'مبيعات/دفعات الطلب '||coalesce(order_number,id::text),coalesce(created_at,now()) from public.orders where status<>'cancelled' and branch_id is not null and (coalesce(cash_amount,0)>0 or (coalesce(deposit_amount,0)>0 and lower(coalesce(deposit_method,'')) not in ('bank','bank_transfer','transfer','balance','credit')));
insert into public.financial_transactions(branch_id,source_type,source_id,direction,account,amount,description,occurred_at)
select branch_id,'order_sale',id::text,'in','bank',greatest(coalesce(bank_amount,0),0)+greatest(coalesce(transfer_amount,0),0)+case when lower(coalesce(deposit_method,'')) in ('bank','bank_transfer','transfer') then greatest(coalesce(deposit_amount,0),0) else 0 end,'مبيعات/دفعات الطلب '||coalesce(order_number,id::text),coalesce(created_at,now()) from public.orders where status<>'cancelled' and branch_id is not null and (coalesce(bank_amount,0)+coalesce(transfer_amount,0)>0 or (coalesce(deposit_amount,0)>0 and lower(coalesce(deposit_method,'')) in ('bank','bank_transfer','transfer')));
insert into public.financial_transactions(branch_id,source_type,source_id,direction,account,amount,description,occurred_at)
select branch_id,'purchase_invoice',id::text,'out',public.mood_account(payment_method),paid_amount,'فاتورة مشتريات '||coalesce(invoice_no,id::text),coalesce(created_at,now()) from public.purchase_invoices where branch_id is not null and coalesce(paid_amount,0)>0;
insert into public.financial_transactions(branch_id,source_type,source_id,direction,account,amount,description,occurred_at)
select branch_id,'expense',id::text,'out',public.mood_account(payment_method),case when coalesce(accounting_type,'operating')='liability' then greatest(coalesce(paid_amount,0),0) else greatest(coalesce(paid_amount,amount,0),0) end,'مصروف',coalesce(created_at,now()) from public.expenses where branch_id is not null and (case when coalesce(accounting_type,'operating')='liability' then greatest(coalesce(paid_amount,0),0) else greatest(coalesce(paid_amount,amount,0),0) end)>0;


insert into public.financial_transactions(branch_id,source_type,source_id,direction,account,amount,description,occurred_at)
select sp.branch_id,'supplier_payment',sp.id::text,'out',public.mood_account(sp.payment_method),sp.amount,'دفعة مورد',coalesce(sp.created_at,now())
from public.supplier_payments sp
where sp.branch_id is not null and coalesce(sp.amount,0)>0;

insert into public.financial_transactions(branch_id,source_type,source_id,direction,account,amount,description,occurred_at)
select ew.branch_id,'employee_withdrawal',ew.id::text,'out',public.mood_account(ew.payment_method),ew.amount,'مسحوب موظف',coalesce(ew.created_at,now())
from public.employee_withdrawals ew
where ew.branch_id is not null and coalesce(ew.status,'approved')='approved' and coalesce(ew.amount,0)>0;

insert into public.financial_transactions(branch_id,source_type,source_id,direction,account,amount,description,occurred_at)
select o.branch_id,'order_external_purchase',e.id::text,'out',public.mood_account(e.payment_method),
       greatest(coalesce(e.quantity,0)*coalesce(e.unit_cost,0),0),
       'شراء خارجي للطلب #'||o.id::text,now()
from public.order_item_external_contents e
join public.order_items oi on oi.id=e.order_item_id
join public.orders o on o.id=oi.order_id
where o.branch_id is not null and greatest(coalesce(e.quantity,0)*coalesce(e.unit_cost,0),0)>0;

notify pgrst,'reload schema';
commit;
