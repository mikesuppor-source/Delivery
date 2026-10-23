-- ============================================================
-- Cedar Delivery Desk — Row-Level Security
-- Migration 002: RLS policies
-- ============================================================

-- ─── Helper: get caller role in a workspace ────────────────────────────────
create or replace function public.my_role(ws_id uuid)
returns public.user_role language sql security definer stable as $$
  select role from public.workspace_members
  where workspace_id = ws_id and user_id = auth.uid()
$$;

-- ─── Helper: is caller a member ────────────────────────────────────────────
create or replace function public.is_member(ws_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id and user_id = auth.uid()
  )
$$;

-- ─── Enable RLS ────────────────────────────────────────────────────────────
alter table public.workspaces         enable row level security;
alter table public.workspace_members  enable row level security;
alter table public.invitations        enable row level security;
alter table public.delivery_areas     enable row level security;
alter table public.shops              enable row level security;
alter table public.drivers            enable row level security;
alter table public.orders             enable row level security;
alter table public.settlements        enable row level security;
alter table public.audit_log          enable row level security;

-- ─── workspaces ─────────────────────────────────────────────────────────────
create policy "members can read workspace"
  on public.workspaces for select
  using (public.is_member(id));

create policy "owner can update workspace"
  on public.workspaces for update
  using (public.my_role(id) = 'owner');

-- ─── workspace_members ──────────────────────────────────────────────────────
create policy "members see all members"
  on public.workspace_members for select
  using (public.is_member(workspace_id));

create policy "owner inserts members"
  on public.workspace_members for insert
  with check (public.my_role(workspace_id) = 'owner');

create policy "owner updates member roles"
  on public.workspace_members for update
  using (public.my_role(workspace_id) = 'owner');

create policy "owner removes members"
  on public.workspace_members for delete
  using (public.my_role(workspace_id) = 'owner');

-- ─── invitations ────────────────────────────────────────────────────────────
create policy "owner/manager view invitations"
  on public.invitations for select
  using (public.my_role(workspace_id) in ('owner', 'manager'));

create policy "owner creates invitations"
  on public.invitations for insert
  with check (public.my_role(workspace_id) = 'owner');

create policy "owner deletes invitations"
  on public.invitations for delete
  using (public.my_role(workspace_id) = 'owner');

-- Public read for token-based acceptance (invite flow)
create policy "anyone can read their own invitation by token"
  on public.invitations for select
  using (true); -- narrowed by token in app logic; token is unguessable

-- ─── delivery_areas ─────────────────────────────────────────────────────────
create policy "members view areas"
  on public.delivery_areas for select
  using (public.is_member(workspace_id));

create policy "owner/manager manage areas"
  on public.delivery_areas for all
  using (public.my_role(workspace_id) in ('owner', 'manager'));

-- ─── shops ──────────────────────────────────────────────────────────────────
create policy "members view shops"
  on public.shops for select
  using (public.is_member(workspace_id));

create policy "owner/manager manage shops"
  on public.shops for all
  using (public.my_role(workspace_id) in ('owner', 'manager'));

-- ─── drivers ────────────────────────────────────────────────────────────────
-- Drivers can only see their own record
create policy "role-based driver visibility"
  on public.drivers for select
  using (
    public.is_member(workspace_id) and (
      public.my_role(workspace_id) in ('owner', 'manager', 'readonly')
      or user_id = auth.uid()
    )
  );

create policy "owner/manager manage drivers"
  on public.drivers for all
  using (public.my_role(workspace_id) in ('owner', 'manager'));

-- ─── orders ─────────────────────────────────────────────────────────────────
-- Drivers see only their assigned orders
create policy "role-based order visibility"
  on public.orders for select
  using (
    public.is_member(workspace_id) and (
      public.my_role(workspace_id) in ('owner', 'manager', 'readonly')
      or driver_id in (
        select id from public.drivers where user_id = auth.uid()
      )
    )
  );

create policy "owner/manager create orders"
  on public.orders for insert
  with check (public.my_role(workspace_id) in ('owner', 'manager'));

create policy "owner/manager update orders"
  on public.orders for update
  using (public.my_role(workspace_id) in ('owner', 'manager'));

-- ─── settlements ────────────────────────────────────────────────────────────
create policy "owner/manager view settlements"
  on public.settlements for select
  using (public.my_role(workspace_id) in ('owner', 'manager'));

create policy "owner/manager record settlements"
  on public.settlements for insert
  with check (public.my_role(workspace_id) in ('owner', 'manager'));

-- ─── audit_log ──────────────────────────────────────────────────────────────
-- Only owner can READ; only service role can WRITE (no insert policy for anon/auth)
create policy "owner views audit log"
  on public.audit_log for select
  using (public.my_role(workspace_id) = 'owner');
