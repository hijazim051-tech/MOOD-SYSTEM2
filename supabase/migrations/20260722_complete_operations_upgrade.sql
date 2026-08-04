-- MOOD comprehensive operations upgrade
alter table if exists public.order_items add column if not exists packaging_image_url text;
alter table if exists public.order_returns add column if not exists photo_url text;
alter table if exists public.order_returns add column if not exists approval_status text not null default 'approved';
alter table if exists public.order_returns add column if not exists approved_by uuid references auth.users(id);
alter table if exists public.order_returns add column if not exists approved_at timestamptz;

-- Public storage buckets for mandatory packaging photos and optional return photos.
insert into storage.buckets (id, name, public) values ('packaging-images','packaging-images',true) on conflict (id) do update set public=true;
insert into storage.buckets (id, name, public) values ('return-images','return-images',true) on conflict (id) do update set public=true;

drop policy if exists "authenticated upload packaging images" on storage.objects;
create policy "authenticated upload packaging images" on storage.objects for insert to authenticated with check (bucket_id='packaging-images');
drop policy if exists "authenticated read packaging images" on storage.objects;
create policy "authenticated read packaging images" on storage.objects for select to authenticated using (bucket_id='packaging-images');
drop policy if exists "authenticated upload return images" on storage.objects;
create policy "authenticated upload return images" on storage.objects for insert to authenticated with check (bucket_id='return-images');
drop policy if exists "authenticated read return images" on storage.objects;
create policy "authenticated read return images" on storage.objects for select to authenticated using (bucket_id='return-images');

-- Generic immutable audit function. It records who changed important records, before/after, date and time.
create or replace function public.mood_audit_trigger() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_name text:=''; v_email text:=''; v_id text; v_label text;
begin
  select coalesce(up.full_name,''), coalesce(au.email,'') into v_name,v_email
  from auth.users au left join public.user_profiles up on up.id=au.id where au.id=v_user;
  v_id := coalesce((case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id','');
  v_label := coalesce((case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'order_number',v_id);
  if to_regclass('public.activity_logs') is not null then
    insert into public.activity_logs(user_id,user_email,user_name,action,entity_type,entity_id,entity_label,page_name,description,old_data,new_data,metadata,created_at)
    values(v_user,v_email,v_name,lower(tg_op),tg_table_name,v_id,v_label,'database',
      case tg_op when 'INSERT' then 'تم حفظ سجل جديد' when 'UPDATE' then 'تم تعديل السجل' else 'تم حذف السجل' end,
      case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
      case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
      jsonb_build_object('source','database_trigger'),now());
  end if;
  if to_regclass('public.owner_notifications') is not null and tg_table_name in ('orders','order_returns') then
    insert into public.owner_notifications(notification_type,title,message,entity_table,entity_id,created_by)
    values('audit_'||lower(tg_op),'حركة جديدة في المنظومة',
      format('%s قام بعملية %s على %s رقم %s في %s',coalesce(nullif(v_name,''),v_email),tg_op,tg_table_name,v_label,to_char(now(),'YYYY-MM-DD HH24:MI')),
      tg_table_name,v_id,v_user);
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

do $$ declare t text; begin
  foreach t in array array['orders','order_items','order_returns','order_return_items','expenses','products','product_details','purchase_invoices','supplier_payments','stock_waste'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists mood_audit_%I on public.%I',t,t);
      execute format('create trigger mood_audit_%I after insert or update or delete on public.%I for each row execute function public.mood_audit_trigger()',t,t);
    end if;
  end loop;
end $$;

-- Returns above 200 LYD require owner approval marker.
create or replace function public.mark_large_return_pending() returns trigger language plpgsql as $$
begin
  if new.refund_amount > 200 then new.approval_status := 'pending'; else new.approval_status := 'approved'; end if;
  return new;
end $$;
drop trigger if exists order_return_approval_threshold on public.order_returns;
create trigger order_return_approval_threshold before insert on public.order_returns for each row execute function public.mark_large_return_pending();

create or replace function public.approve_order_return(p_return_id bigint, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not exists (select 1 from public.user_profiles up left join public.roles r on r.id=up.role_id where up.id=auth.uid() and lower(coalesce(r.name,'')) in ('owner','admin')) then
    raise exception 'هذه العملية للمالك فقط';
  end if;
  update public.order_returns set approval_status=case when p_approve then 'approved' else 'rejected' end, approved_by=auth.uid(), approved_at=now(), notes=concat_ws(E'\n',notes,p_note) where id=p_return_id;
end $$;
grant execute on function public.approve_order_return(bigint,boolean,text) to authenticated;
