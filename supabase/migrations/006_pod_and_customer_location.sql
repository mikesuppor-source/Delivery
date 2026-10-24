-- ==============================================================================
-- 006_pod_and_customer_location.sql
-- Digital Proof of Delivery (POD) photo, signature, and mixed cash collection
-- ==============================================================================

alter table public.orders 
  add column if not exists pod_signature text, 
  add column if not exists pod_photo text, 
  add column if not exists pod_collected_lbp numeric;
