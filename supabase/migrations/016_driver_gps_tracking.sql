-- 016_driver_gps_tracking.sql
-- Adds real-time GPS location telemetry to drivers for fleet tracking and mobile proximity dispatch.

alter table public.drivers
  add column if not exists current_lat numeric,
  add column if not exists current_lng numeric,
  add column if not exists last_location_at timestamptz;

create index if not exists idx_drivers_location on public.drivers (current_lat, current_lng) where active = true;
