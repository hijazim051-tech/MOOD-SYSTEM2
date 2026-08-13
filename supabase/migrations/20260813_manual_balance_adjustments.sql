-- MOOD 2026-08-13
-- Enable manual balance/receivables corrections in the same financial ledger.

begin;

alter table public.financial_transactions
  drop constraint if exists financial_transactions_account_check;

alter table public.financial_transactions
  add constraint financial_transactions_account_check
  check (account in ('cash','bank','balance'));

notify pgrst, 'reload schema';
commit;
