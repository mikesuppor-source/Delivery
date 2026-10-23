# Cedar Delivery Desk

Full-stack delivery dispatch management app built with **Next.js 15 + Supabase + Vercel**.

## Features

- 📦 Orders, shops, drivers, delivery areas
- 💰 Dual-currency (USD + LBP) with rate-locked orders
- 📊 Financial statements with print/PDF export
- 🔐 Role-based access: Owner / Manager / Driver / Read-only
- 📧 Email invitations for staff (staff set their own password)
- 🛡️ Row-Level Security enforced at the database level
- 📋 Full audit log (owner-only)

## Role Permissions

| Feature | Owner | Manager | Driver | Read-only |
|---|:---:|:---:|:---:|:---:|
| View overview | ✅ | ✅ | ✅ | ✅ |
| View orders | ✅ | ✅ | Own only | ✅ |
| Create/edit orders | ✅ | ✅ | ❌ | ❌ |
| View shops | ✅ | ✅ | ❌ | ✅ |
| Manage shops | ✅ | ✅ | ❌ | ❌ |
| View/manage drivers | ✅ | ✅ | ❌ | ✅ |
| View statements | ✅ | ✅ | ❌ | ❌ |
| Settle balances | ✅ | ✅ | ❌ | ❌ |
| Settings | ✅ (edit) | ✅ (view) | ❌ | ❌ |
| Admin panel | ✅ | ❌ | ❌ | ❌ |
| Invite staff | ✅ | ❌ | ❌ | ❌ |
| View audit log | ✅ | ❌ | ❌ | ❌ |

## Setup

### 1. Prerequisites

- Node.js 20+
- [Supabase account](https://supabase.com) (free tier works)
- [Vercel account](https://vercel.com) (free tier works)

### 2. Clone & install

```bash
cd cedar
npm install
```

### 3. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the migrations in order:
   - `supabase/migrations/001_schema.sql`
   - `supabase/migrations/002_rls.sql`

3. In **Auth > URL Configuration**:
   - Site URL: `https://your-app.vercel.app`
   - Redirect URLs: `https://your-app.vercel.app/invite/**`

4. Copy your API keys from **Project Settings > API**

### 4. Environment variables

```bash
cp .env.local.example .env.local
# Edit .env.local with your Supabase credentials
```

### 5. Create your owner account

After running migrations, you need to:

1. Create a workspace manually in Supabase SQL Editor:
```sql
insert into workspaces (name, slug, usd_to_lbp) 
values ('My Delivery Co', 'my-delivery', 90000);
```

2. Sign up at `/login` (or use Supabase Auth dashboard to create the owner user)

3. Add yourself as owner in SQL Editor:
```sql
insert into workspace_members (workspace_id, user_id, role, display_name, joined_at)
values (
  '<workspace-id from step 1>',
  '<your-user-id from auth.users>',
  'owner',
  'Your Name',
  now()
);
```

4. From that point, you can invite all other staff from the Admin panel UI.

### 6. Run locally

```bash
npm run dev
# Opens at http://localhost:3000
```

### 7. Deploy to Vercel

```bash
npx vercel
# Follow prompts

# Add environment variables:
npx vercel env add NEXT_PUBLIC_SUPABASE_URL
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
npx vercel env add SUPABASE_SERVICE_ROLE_KEY
npx vercel env add NEXT_PUBLIC_SITE_URL
```

Or connect your GitHub repo to Vercel for automatic deployments.

## Project Structure

```
cedar/
├── app/
│   ├── (auth)/login/          ← Login page
│   ├── (auth)/invite/[token]/ ← Staff invitation acceptance
│   ├── (desk)/                ← All authenticated pages
│   │   ├── layout.tsx         ← Sidebar + topbar shell
│   │   ├── page.tsx           ← Overview dashboard
│   │   ├── orders/page.tsx
│   │   ├── shops/page.tsx
│   │   ├── drivers/page.tsx
│   │   ├── areas/page.tsx
│   │   ├── statements/page.tsx
│   │   ├── settings/page.tsx
│   │   └── admin/             ← Owner-only admin panel
│   ├── print/page.tsx         ← Print/PDF view
│   └── api/
│       ├── invite/            ← Send/revoke invitations
│       ├── invite/accept/     ← Accept invitation
│       └── admin/member/      ← Change roles / remove staff
├── lib/
│   ├── supabase/client.ts     ← Browser Supabase client
│   ├── supabase/server.ts     ← Server + service-role clients
│   ├── supabase/database.types.ts ← TypeScript types
│   ├── auth.ts                ← Role helpers, requireRole()
│   └── utils.ts               ← Format helpers
├── components/
│   ├── sidebar.tsx            ← Role-aware navigation
│   ├── topbar.tsx             ← Exchange rate display
│   └── role-gate.tsx          ← Client-side permission guard
├── supabase/migrations/
│   ├── 001_schema.sql         ← All tables + triggers
│   └── 002_rls.sql            ← Row-Level Security policies
└── middleware.ts              ← Edge auth guard
```

## Security Notes

- **Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.** It bypasses all RLS.
- RLS policies enforce data access at the database level — even if API code has bugs, data won't leak.
- The audit log can only be written by the service role — users cannot tamper with it.
- Owner accounts cannot be deleted or demoted via the UI/API.
