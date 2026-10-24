-- ==============================================================================
-- 005_area_auto_dispatch.sql
-- Enables auto-dispatching pending orders based on Lebanese delivery areas
-- ==============================================================================

-- 1. Add default courier reference to delivery_areas
alter table public.delivery_areas 
  add column if not exists default_driver_id uuid references public.drivers(id) on delete set null;

-- 2. Add covering index for foreign key performance
create index if not exists idx_delivery_areas_default_driver_id 
  on public.delivery_areas(default_driver_id);
