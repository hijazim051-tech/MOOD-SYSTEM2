-- Branch-safe purchases, offer reservations, and schema refresh.

alter table if exists public.offers
  add column if not exists reservation_status text not null default 'available',
  add column if not exists reserved_customer_name text,
  add column if not exists reserved_customer_phone text,
  add column if not exists reserved_at timestamptz,
  add column if not exists reserved_order_id bigint;

create index if not exists offers_branch_status_idx
  on public.offers(branch_id, reservation_status);

-- Ensure one stock row per branch/product.
create unique index if not exists branch_product_stock_branch_product_uidx
  on public.branch_product_stock(branch_id, product_detail_id);

create unique index if not exists branch_inventory_branch_product_uidx
  on public.branch_inventory(branch_id, product_detail_id);

create or replace function public.save_purchase_invoice(
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
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_invoice_id uuid;
  v_items_subtotal numeric := 0;
  v_grand_total numeric := 0;
  v_remaining numeric := 0;
  v_item jsonb;
  v_line_subtotal numeric;
  v_weight numeric;
  v_alloc_delivery numeric;
  v_alloc_other numeric;
  v_effective_unit numeric;
  v_old_stock numeric;
  v_old_average numeric;
  v_new_stock numeric;
  v_new_average numeric;
  v_tier_id uuid;
  v_product_detail_id bigint;
  v_quantity numeric;
  v_unit_purchase_price numeric;
begin
  if p_branch_id is null then raise exception 'الفرع مطلوب'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'يجب إضافة منتج واحد على الأقل'; end if;

  select coalesce(sum((item->>'quantity')::numeric * (item->>'unitPurchasePrice')::numeric),0)
  into v_items_subtotal from jsonb_array_elements(p_items) item;

  v_grand_total := v_items_subtotal + greatest(coalesce(p_delivery_cost,0),0) + greatest(coalesce(p_other_costs,0),0);
  v_remaining := greatest(v_grand_total - greatest(coalesce(p_paid_amount,0),0),0);

  insert into public.purchase_invoices(
    branch_id,supplier_id,supplier_name_snapshot,invoice_no,invoice_date,purchase_mode,
    items_subtotal,delivery_cost,other_costs,grand_total,paid_amount,remaining_amount,payment_method,notes
  ) values(
    p_branch_id,p_supplier_id,coalesce(p_supplier_name,''),coalesce(p_invoice_no,''),coalesce(p_invoice_date,current_date),coalesce(p_purchase_mode,'cash'),
    v_items_subtotal,greatest(coalesce(p_delivery_cost,0),0),greatest(coalesce(p_other_costs,0),0),v_grand_total,
    greatest(coalesce(p_paid_amount,0),0),v_remaining,coalesce(p_payment_method,'cash'),coalesce(p_notes,'')
  ) returning id into v_invoice_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_quantity := coalesce(nullif(v_item->>'quantity','')::numeric,0);
    v_unit_purchase_price := coalesce(nullif(v_item->>'unitPurchasePrice','')::numeric,0);
    if v_quantity <= 0 then raise exception 'الكمية غير صحيحة'; end if;
    v_line_subtotal := v_quantity * v_unit_purchase_price;
    v_weight := case when v_items_subtotal > 0 then v_line_subtotal/v_items_subtotal else 0 end;
    v_alloc_delivery := greatest(coalesce(p_delivery_cost,0),0)*v_weight;
    v_alloc_other := greatest(coalesce(p_other_costs,0),0)*v_weight;
    v_effective_unit := (v_line_subtotal+v_alloc_delivery+v_alloc_other)/v_quantity;

    if (v_item->>'itemKind')='usage_price_tier' then
      v_tier_id := nullif(v_item->>'usagePriceTierId','')::uuid;
      if v_tier_id is null then
        select id into v_tier_id from public.usage_price_tiers
        where branch_id=p_branch_id and v_unit_purchase_price>=purchase_min
          and (purchase_max is null or v_unit_purchase_price<=purchase_max)
          and is_active=true order by sort_order limit 1;
      end if;
      select stock,average_unit_cost into v_old_stock,v_old_average
      from public.usage_price_tiers where id=v_tier_id and branch_id=p_branch_id for update;
      if not found then raise exception 'فئة السعر غير موجودة في الفرع الحالي'; end if;
      v_new_stock := coalesce(v_old_stock,0)+v_quantity;
      v_new_average := (coalesce(v_old_stock,0)*coalesce(v_old_average,0)+v_quantity*v_effective_unit)/nullif(v_new_stock,0);
      update public.usage_price_tiers set stock=v_new_stock,average_unit_cost=v_new_average,updated_at=now() where id=v_tier_id;
      insert into public.purchase_invoice_items(purchase_invoice_id,item_kind,usage_price_tier_id,item_name_snapshot,detail_name_snapshot,quantity,unit_purchase_price,allocated_delivery_cost,allocated_other_cost,effective_unit_cost,line_subtotal,usage_price,notes)
      select v_invoice_id,'usage_price_tier',v_tier_id,'مخزون فئة سعر',concat('فئة ',usage_price,' د.ل'),v_quantity,v_unit_purchase_price,v_alloc_delivery,v_alloc_other,v_effective_unit,v_line_subtotal,usage_price,coalesce(v_item->>'notes','')
      from public.usage_price_tiers where id=v_tier_id;
    else
      v_product_detail_id := nullif(v_item->>'productDetailId','')::bigint;
      if v_product_detail_id is null then raise exception 'تفصيل المنتج مطلوب'; end if;
      select stock,average_unit_cost into v_old_stock,v_old_average
      from public.branch_product_stock where branch_id=p_branch_id and product_detail_id=v_product_detail_id for update;
      if not found then v_old_stock:=0; v_old_average:=0; end if;
      v_new_stock := coalesce(v_old_stock,0)+v_quantity;
      v_new_average := (coalesce(v_old_stock,0)*coalesce(v_old_average,0)+v_quantity*v_effective_unit)/nullif(v_new_stock,0);
      insert into public.branch_product_stock(branch_id,product_detail_id,stock,average_unit_cost,updated_at)
      values(p_branch_id,v_product_detail_id,v_new_stock,v_new_average,now())
      on conflict(branch_id,product_detail_id) do update set stock=excluded.stock,average_unit_cost=excluded.average_unit_cost,updated_at=now();
      insert into public.purchase_invoice_items(purchase_invoice_id,item_kind,product_detail_id,item_name_snapshot,detail_name_snapshot,quantity,unit_purchase_price,allocated_delivery_cost,allocated_other_cost,effective_unit_cost,line_subtotal,notes)
      values(v_invoice_id,'product_detail',v_product_detail_id,coalesce(v_item->>'productName',''),coalesce(v_item->>'detailName',''),v_quantity,v_unit_purchase_price,v_alloc_delivery,v_alloc_other,v_effective_unit,v_line_subtotal,coalesce(v_item->>'notes',''));
    end if;
  end loop;
  return v_invoice_id;
end;
$function$;

grant execute on function public.save_purchase_invoice(uuid,uuid,text,text,date,text,numeric,numeric,numeric,text,text,jsonb) to authenticated;
notify pgrst, 'reload schema';
