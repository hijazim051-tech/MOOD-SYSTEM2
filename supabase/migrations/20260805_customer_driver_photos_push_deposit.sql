-- MOOD: customer/driver autocomplete uses existing orders history.
-- Order completion photos are stored per item and shown internally in order details.
alter table if exists public.order_items
  add column if not exists packaging_image_url text;

alter table if exists public.orders
  add column if not exists deposit_method text default 'cash';
