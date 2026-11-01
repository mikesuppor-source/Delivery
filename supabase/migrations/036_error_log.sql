-- A short record of server errors (the "Request failed" answers), so a daily check can tell the owner when something is
-- breaking. It keeps only the route, the error text with emails and long numbers hidden, and the request id.
-- Server-only: no sign-in can read it. Rows older than 30 days are cleared by the daily job.
begin;

create table public.error_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  method text not null,
  path text not null,
  status integer not null,
  message text,
  request_id text
);
create index error_log_created_idx on public.error_log (created_at desc);

alter table public.error_log enable row level security;
revoke all on public.error_log from public, anon, authenticated;
grant all on public.error_log to service_role;

commit;
