-- 032_close_trigger_functions.sql
-- Tidy-up after 031: trigger functions are closed to visitors and signed-in users, and two functions
-- get a fixed search path (both were warnings in Supabase's own security checker).
--
-- Trigger functions are never called by hand. Postgres checks permission to run one only when the
-- trigger is created, so closing them does not stop any trigger from firing. Nothing else changes.
--
-- tests/database.test.mjs now fails if a trigger function in the public schema is open to anyone
-- but its owner and the server.

begin;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

alter function public.sync_order_customer() set search_path = public, pg_temp;
alter function public.set_allow_owner_delete(boolean) set search_path = public, pg_temp;

commit;
