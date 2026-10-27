-- ==============================================================================
-- 015_area_driver_pool.sql
-- Enables fleet-based multi-driver pools and fair load-balanced auto-dispatching
-- ==============================================================================

alter table public.delivery_areas 
  add column if not exists assigned_driver_ids uuid[] not null default '{}';

-- Backfill existing default_driver_id into assigned_driver_ids
update public.delivery_areas 
set assigned_driver_ids = array[default_driver_id] 
where default_driver_id is not null and assigned_driver_ids = '{}';

-- Index for searching areas by assigned drivers
create index if not exists idx_delivery_areas_assigned_driver_ids 
  on public.delivery_areas using gin (assigned_driver_ids);
