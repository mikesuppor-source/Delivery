-- 017_driver_pin_auth.sql
-- Adds dedicated courier PIN authentication for mobile driver portal sign-in.

alter table public.drivers
  add column if not exists pin_code text default '1234';

update public.drivers
  set pin_code = '1234'
  where pin_code is null;
