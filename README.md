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
   - every file in `supabase/migrations/`, from `001_schema.sql` to the highest number

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

Scheduled jobs (`/api/cron/bonuses` for weekly courier bonuses, `/api/cron/holds` for warehouse hold checks) only run for a caller that sends `Authorization: Bearer <CRON_SECRET>`. Without `CRON_SECRET` they refuse every request.

`vercel.json` schedules the courier bonuses for every Monday at 03:00 UTC, for the week that just ended. To switch it on, add `CRON_SECRET` (any long random value) to the Production environment variables in Vercel and redeploy; Vercel then sends it with each run. Vercel does not run scheduled jobs on preview deployments, and the job is safe to run twice because a courier gets at most one bonus per week. The warehouse hold check only reports and is not scheduled. Bonuses can still be calculated by hand on the Courier Pay screen.

### Emailing statements

A shop's page can email its account statement as a PDF, in English or Arabic. It needs a shop email address (Edit Store) and two settings in Vercel, which keep passwords out of the code:

- `SMTP_URL`: the mail server, for example `smtps://statements%40example.com:app-password@smtp.example.com:465`. Any provider that offers SMTP works: Gmail (with an app password), Outlook, Zoho, or Resend and SendGrid through their SMTP service. Special characters in the user name or password are written as `%` codes, for example `@` is `%40`.
- `EMAIL_FROM`: the sender, for example `Cedar Express <statements@example.com>`.

Until both are set, the Email button answers that email is not set up. Only owners and managers can send, the address always comes from the shop's record, and one person can send at most ten emails a minute.

### Courier push notifications

Lock-screen alerts for couriers are signed with a key pair that lives in the hosting settings only. Make one with `npx web-push generate-vapid-keys`, then set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (the public one), `VAPID_PRIVATE_KEY` (the private one, keep it secret) and, if you like, `VAPID_SUBJECT` (a `mailto:` address) in Vercel, and redeploy because the public key is built into the courier page. Never write the private key in the code: this repository is public, and whoever holds it can send notifications to couriers' phones. Without both keys push is off and the courier page says alerts are not set up. After a new pair is set, each courier opens their run sheet and turns alerts on again once.

### Receipts and fonts

Expense receipts (photos or PDFs, up to 2.5 MB) are kept in the private `expense-receipts` storage bucket, created by migration 029, and opened through links that stop working after a minute. Statement PDFs use the Cairo font in `assets/fonts` (SIL Open Font License, see `OFL.txt` there), which has Arabic and Latin letters in one file, and can be printed in English or Arabic (`lang=ar`, laid out right to left).

The Arabic wording of the finance screens is in `lib/i18n/ar-finance.ts`. Its keys are the English sentences themselves, so a screen writes `t('Pay selected ({amount})')` and still shows that English text when a line is missing; `npm test` fails if a screen asks for a sentence that has no Arabic line.

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
- RLS policies enforce data access for the browser and user-scoped clients. Server routes that use the service role bypass RLS, so every such route must check access itself (`workspaceAccess`, `shopAccess`, `driverAccess` in `lib/access.ts`).
- Courier PINs are stored as bcrypt hashes in `driver_credentials`, which app users cannot read. Dispatch sees a PIN only once, when it is issued; a forgotten PIN is reset, which also signs the courier out of every device.
- The courier app uses a signed, `httpOnly` session cookie (`DRIVER_SESSION_SECRET`). A courier ID on its own grants nothing.
- Public pages (`/track`) match exact order codes and exact phone numbers, are rate limited, and never show delivery addresses for a phone search. Waybills (`/print/order/...`) require sign-in.
- Merchant payouts are requested and paid through database functions that lock the shop or request row, so they cannot overdraw a balance or be paid twice.
- The audit log can only be written by the service role — users cannot tamper with it.
- Owner accounts cannot be deleted or demoted via the UI/API.
