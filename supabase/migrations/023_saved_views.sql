-- 023_saved_views.sql
-- User-specific saved table views and filter configurations with multi-tenant RLS.

create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  page text not null,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_saved_views_user_page_name unique (workspace_id, user_id, page, name)
);

create index if not exists idx_saved_views_lookup
  on public.saved_views (workspace_id, user_id, page);

alter table public.saved_views enable row level security;

-- Policy: Users see only their own saved views within workspaces they belong to
create policy "Users see their own saved views"
  on public.saved_views
  for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = saved_views.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- Policy: Users insert their own saved views
create policy "Users insert their own saved views"
  on public.saved_views
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = saved_views.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- Policy: Users update their own saved views
create policy "Users update their own saved views"
  on public.saved_views
  for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = saved_views.workspace_id
        and wm.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
  );

-- Policy: Users delete their own saved views
create policy "Users delete their own saved views"
  on public.saved_views
  for delete
  using (
    auth.uid() = user_id
  );
