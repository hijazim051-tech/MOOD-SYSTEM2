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
