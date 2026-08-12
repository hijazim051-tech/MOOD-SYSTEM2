create or replace function public.add_opening_stock(
  p_branch_id uuid,
  p_product_detail_id bigint,
  p_quantity numeric,
  p_unit_cost numeric default 0,
  p_sell_price numeric default 0,
  p_opening_date date default current_date,
  p_notes text default 'مخزون قبل تشغيل المنظومة'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_stock numeric := 0;
  v_old_average numeric := 0;
  v_new_stock numeric;
  v_new_average numeric;
begin
  if p_branch_id is null then raise exception 'الفرع مطلوب'; end if;
  if p_product_detail_id is null then raise exception 'المنتج مطلوب'; end if;
  if coalesce(p_quantity,0) <= 0 then raise exception 'الكمية يجب أن تكون أكبر من صفر'; end if;

  select coalesce(stock,0), coalesce(average_unit_cost,0)
    into v_old_stock, v_old_average
  from public.branch_product_stock
  where branch_id=p_branch_id and product_detail_id=p_product_detail_id
  for update;

  if not found then
    v_old_stock := 0; v_old_average := 0;
  end if;

  v_new_stock := v_old_stock + p_quantity;
  v_new_average := case when v_new_stock > 0 then
    ((v_old_stock * v_old_average) + (p_quantity * greatest(coalesce(p_unit_cost,0),0))) / v_new_stock
  else greatest(coalesce(p_unit_cost,0),0) end;

  insert into public.branch_product_stock(branch_id,product_detail_id,stock,average_unit_cost,updated_at)
  values(p_branch_id,p_product_detail_id,v_new_stock,v_new_average,now())
  on conflict(branch_id,product_detail_id) do update
    set stock=excluded.stock, average_unit_cost=excluded.average_unit_cost, updated_at=now();

  update public.product_details
  set buy_price=case when coalesce(p_unit_cost,0)>0 then p_unit_cost else buy_price end,
      sell_price=case when coalesce(p_sell_price,0)>0 then p_sell_price else sell_price end,
      average_unit_cost=v_new_average
  where id=p_product_detail_id;

  insert into public.inventory_movements(
    product_detail_id, branch_id, movement_type, quantity, balance_after,
    unit_cost, unit_price, reference_table, notes, created_at
  ) values(
    p_product_detail_id,p_branch_id,'opening_balance',p_quantity,v_new_stock,
    greatest(coalesce(p_unit_cost,0),0),greatest(coalesce(p_sell_price,0),0),
    'opening_stock',coalesce(nullif(trim(p_notes),''),'مخزون قبل تشغيل المنظومة'),
    coalesce(p_opening_date,current_date)::timestamp
  );
end;
$$;

grant execute on function public.add_opening_stock(uuid,bigint,numeric,numeric,numeric,date,text) to authenticated;
notify pgrst, 'reload schema';
