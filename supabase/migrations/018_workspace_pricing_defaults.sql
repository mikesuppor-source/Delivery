-- 018: Workspace default pricing
ALTER TABLE public.workspaces 
  ADD COLUMN IF NOT EXISTS default_driver_pay_usd numeric(10,2) DEFAULT 2.00,
  ADD COLUMN IF NOT EXISTS default_delivery_fee_usd numeric(10,2) DEFAULT 3.50;
