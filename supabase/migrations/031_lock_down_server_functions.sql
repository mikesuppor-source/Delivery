-- 031_lock_down_server_functions.sql
-- Server-only functions and one table are now closed to everyone but the server.
--
-- 1. Migrations 024 to 026 created functions that change orders, pickups, returns, ratings and the
--    message log. They run with full database rights (security definer). The app only ever calls them
--    from its own server with the service key, after it has checked who is asking, but they kept
--    Supabase's default permission that lets any caller run them. They are now for the server only,
--    like the finance functions in 027.
--
-- 2. driver_push_subscriptions (migration 019) never had row level security. Only the server touches
--    it, so it is closed to everyone else.
--
-- profit_report stays open to signed-in users on purpose: it refuses anyone who is not an owner or
-- manager of that company (028). Trigger functions are left alone: they cannot be called directly.
--
-- tests/database.test.mjs now fails if a function that runs with full rights can be called by
-- signed-out visitors, or if a table in the public schema has no row level security.

begin;

revoke all on function public.hold_order(uuid, uuid, text, public.hold_reason, text, date, uuid) from public, anon, authenticated;
revoke all on function public.release_order(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.record_delivery_attempt(uuid, uuid, public.attempt_result, text, text, double precision, double precision, date) from public, anon, authenticated;
revoke all on function public.collect_pickup(uuid, uuid, text, uuid[]) from public, anon, authenticated;
revoke all on function public.handover_returns(uuid, uuid[], text) from public, anon, authenticated;
revoke all on function public.set_route_positions(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.mark_received_at_hub(uuid) from public, anon, authenticated;
revoke all on function public.get_or_create_walkin_shop(uuid) from public, anon, authenticated;
revoke all on function public.submit_order_rating(text, integer, text) from public, anon, authenticated;
revoke all on function public.get_driver_rating_summary(uuid) from public, anon, authenticated;
revoke all on function public.log_customer_message(uuid, uuid, text, text, text, text, text, text) from public, anon, authenticated;

grant execute on function public.hold_order(uuid, uuid, text, public.hold_reason, text, date, uuid) to service_role;
grant execute on function public.release_order(uuid, uuid, text) to service_role;
grant execute on function public.record_delivery_attempt(uuid, uuid, public.attempt_result, text, text, double precision, double precision, date) to service_role;
grant execute on function public.collect_pickup(uuid, uuid, text, uuid[]) to service_role;
grant execute on function public.handover_returns(uuid, uuid[], text) to service_role;
grant execute on function public.set_route_positions(uuid, jsonb) to service_role;
grant execute on function public.mark_received_at_hub(uuid) to service_role;
grant execute on function public.get_or_create_walkin_shop(uuid) to service_role;
grant execute on function public.submit_order_rating(text, integer, text) to service_role;
grant execute on function public.get_driver_rating_summary(uuid) to service_role;
grant execute on function public.log_customer_message(uuid, uuid, text, text, text, text, text, text) to service_role;

alter table public.driver_push_subscriptions enable row level security;
revoke all on public.driver_push_subscriptions from anon, authenticated;

commit;
