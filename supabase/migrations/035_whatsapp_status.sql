-- WhatsApp delivery receipts and replies.
-- Meta reports whether each message was delivered, read or failed, and passes on customers' replies. The message log
-- keeps WhatsApp's own id for each message so a receipt finds its message, and a customer who replies STOP is
-- remembered so Cedar never messages that number again until they reply START.
begin;

alter table public.message_log
  add column if not exists provider_message_id text,
  add column if not exists direction text not null default 'out' check (direction in ('out', 'in')),
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz;

alter table public.message_log drop constraint if exists message_log_status_check;
alter table public.message_log add constraint message_log_status_check
  check (status in ('pending', 'sent', 'delivered', 'read', 'failed', 'received'));

create index if not exists idx_message_log_provider_id on public.message_log (provider_message_id) where provider_message_id is not null;

-- Numbers that asked not to be messaged. The phone is stored as digits only with the country code (96171123456).
create table public.customer_opt_outs (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  phone text not null check (phone ~ '^[0-9]{7,15}$'),
  created_at timestamptz not null default now(),
  primary key (workspace_id, phone)
);
alter table public.customer_opt_outs enable row level security;
revoke all on public.customer_opt_outs from public, anon, authenticated;
grant all on public.customer_opt_outs to service_role;

commit;
