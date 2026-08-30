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
