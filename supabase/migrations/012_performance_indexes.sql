-- ============================================================
-- Cedar Delivery Desk — Performance Indexes
-- Migration 012: Accelerated search & composite filters
-- ============================================================

create index if not exists idx_orders_workspace_created on public.orders(workspace_id, created_at desc);
create index if not exists idx_orders_workspace_status on public.orders(workspace_id, status);
create index if not exists idx_orders_recipient_phone on public.orders(recipient_phone);
create index if not exists idx_orders_recipient_name on public.orders(recipient_name);
create index if not exists idx_orders_driver_status on public.orders(driver_id, status);
create index if not exists idx_orders_shop_status on public.orders(shop_id, status);
