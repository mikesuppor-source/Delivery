-- Apply and commit before migration 009 uses this enum value.
alter type public.order_status add value if not exists 'cancelled';
