-- MOOD 2026-08-13
-- Requested fresh start for orders/reports while keeping catalog, inventory, users and settings.
-- Also makes stock alerts strictly opt-in per branch (0 = never alert).

begin;

-- Stock alerts are optional. Null/negative values are normalized to 0.
update public.branch_product_stock
set alert_limit = 0
where alert_limit is null or alert_limit < 0;

update public.product_details
set alert_limit = 0
where alert_limit is null or alert_limit < 0;

-- Delete order-related child rows first when the tables exist.
do $$
declare
  t text;
begin
  foreach t in array array[
    'order_return_items',
    'order_returns',
    'order_custom_item_components',
    'order_item_external_contents',
    'order_item_template_components',
    'order_item_wrapping_options',
    'order_custom_items',
    'order_items'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I', t);
    end if;
  end loop;
end $$;

-- Orders are the source of the sales reports page; clearing them resets reports to zero.
delete from public.orders;

-- Start the current financial balance from a clean ledger. The owner can set exact
-- cash/bank/balance values from Dashboard/Treasury after the reset.
delete from public.financial_transactions;

-- Remove stale owner notifications that point to deleted orders.
do $$
begin
  if to_regclass('public.owner_notifications') is not null then
    delete from public.owner_notifications
    where lower(coalesce(entity_table, '')) like '%order%';
  end if;
end $$;

-- Reset the serial order id if orders uses a serial/identity-backed sequence.
do $$
declare
  seq_name text;
begin
  seq_name := pg_get_serial_sequence('public.orders', 'id');
  if seq_name is not null then
    execute format('select setval(%L, 1, false)', seq_name);
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
