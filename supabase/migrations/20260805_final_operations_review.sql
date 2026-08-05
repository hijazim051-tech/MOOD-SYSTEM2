-- Final operational hardening for branch isolation
create index if not exists idx_delivery_drivers_branch_active_name on public.delivery_drivers(branch_id, is_active, name);
create index if not exists idx_employee_withdrawals_branch_user_created on public.employee_withdrawals(branch_id, user_id, created_at desc);
create index if not exists idx_employee_absences_user_status on public.employee_absences(user_id, status);
create index if not exists idx_orders_branch_created on public.orders(branch_id, created_at desc);
create index if not exists idx_expenses_branch_date_type on public.expenses(branch_id, expense_date desc, accounting_type);
create index if not exists idx_customers_branch_name on public.customers(branch_id, name);
notify pgrst, 'reload schema';
