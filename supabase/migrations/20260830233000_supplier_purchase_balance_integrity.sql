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
