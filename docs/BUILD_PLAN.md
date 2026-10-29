# Cedar Delivery Desk: Full Build Plan

This plan turns Cedar into a complete delivery-company system, similar in scope to A2Z, Mik Express, LibanPost or DHL Express. It is written for an AI coding agent (Antigravity / Gemini) working in this repository. Follow it phase by phase, in order.

---

## 0. How to use this document (read first, AI builder)

1. Read sections 1 to 4 before writing any code. They describe what already exists and the rules you must not break.
2. Build one phase at a time (section 5). Each phase lists its database changes, logic, API routes, screens, tests and a "Done when" checklist. Don't start the next phase until the current one's checklist passes.
3. Work on a git branch per phase (`feature/<phase-name>`). Never commit directly to `main`.
4. After each phase, run every check in section 3.4 and show the owner the result before merging.
5. If something in this plan conflicts with the real code, the code is the truth for *what exists*. Stop and tell the owner instead of guessing. This plan is the truth for *what to build*.
6. Never put secrets in code, commits, tests or chat. The repository is **public**.

---

## 1. Product vision

Cedar is a delivery-company operating system for Lebanon. Later it will be sold to other delivery companies as SaaS, so every company (a "workspace") must be fully isolated.

**It must handle:**
- **Online orders:** Shopify (already connected), WooCommerce, a merchant API and a merchant portal.
- **Offline orders:** clients who call or WhatsApp the dispatcher, who types the order into the desk, plus walk-in individuals sending a parcel.
- **Zone pricing:** each zone has its own customer fee, courier pay, return fee and return courier pay. Shops can have special prices per zone.
- **Cash on delivery (COD)** in USD and LBP, with a rate locked on each order.
- **Warehouse holding:** parcels can be stored before delivery (bad weather, far zone, customer asked to wait, scheduled day).
- **Couriers:** a mobile courier app (already exists as a PWA) with run sheet, GPS, proof of delivery and earnings.
- **Finance:** shop statements and payouts, courier cash collection and pay, company profit.
- **A professional design** across the whole system, keeping the Cedar green brand.

### 1.1 The money example (the owner's words, made exact)

| | Beirut zone | Far zone |
|---|---|---|
| Item price (shop's money) | $10.00 | $10.00 |
| Company delivery fee (zone price) | $8.00 | $8.00 (or another zone price) |
| **Customer pays the courier (COD)** | **$18.00** | **$18.00** |
| Shop receives | $10.00 | $10.00 |
| Courier earns | $1.00 | $3.00 to $4.00 |
| **Company keeps** | **$7.00** | **$4.00 to $5.00** |

**Returned parcel** (customer refused or unreachable, parcel goes back to the shop):
- Customer pays nothing (COD = 0).
- The shop is charged the zone's **return fee**, default **$2**.
- The courier earns the zone's **return courier pay**, default **$1**.
- The company keeps the difference.

---

## 2. What exists today (do not rebuild it)

### 2.1 Stack
- **Next.js 15** (App Router), **React 19**, **TypeScript**.
- **Supabase:** Postgres 17, row-level security, PostgREST, realtime, auth, storage.
- **Vercel** hosting. The courier app is a **PWA** (`public/sw.js`) with **web push** (VAPID).
- **zod 4** for request validation.
- **Tests:** `node:test` unit tests, a PGlite database test, Playwright end-to-end tests.

### 2.2 Folders
| Path | What it is |
|---|---|
| `app/(desk)/` | Staff desk: `orders`, `areas`, `drivers`, `shops`, `statements`, `settings`, `scan`, `admin` |
| `app/portal/` | Merchant portal (shop owners): orders, balance, cash-out |
| `app/driver/` | Courier login and run sheet (`app/driver/[id]/run-sheet/`, already split into hooks and `sections/`) |
| `app/track/` | Public parcel tracking |
| `app/print/` | Waybill / receipt printing |
| `app/onboarding/`, `app/(auth)/` | Sign-up and sign-in |
| `app/api/` | Server routes (list in 2.4) |
| `components/ui/` | The UI kit (`index.tsx` + `ui.css`, tokens `--ui-*`, dark courier theme `.theme-courier`) |
| `lib/` | Shared logic: `access.ts`, `api.ts`, `validation.ts`, `orders.ts`, `catalog.ts`, `driver-session.ts`, `driver-i18n.ts`, `auto-dispatch.ts`, `support.ts`, `whatsapp.ts` (wa.me links, Lebanese phone normalising), `phone.ts`, `maps.ts`, `lebanon-geo.ts` (governorate / caza / town list), `pod.ts`, `push.ts`, `rate-limit.ts`, `import-orders.ts`, `shopify-*.ts`, `supabase/database.types.ts` |
| `supabase/migrations/` | SQL migrations `001` to `021` |
| `tests/` | Unit tests, `database.test.mjs`, `e2e/*.spec.ts` |
| `scripts/seed-local.mjs` | Local seed data |
| `.github/workflows/` | `check.yml` (typecheck, lint, unit, DB, build, e2e) and `backup.yml` (nightly encrypted DB dump) |

### 2.3 Database tables
`workspaces`, `workspace_members`, `invitations`, `shops`, `shop_integrations`, `customers`, `delivery_areas`, `drivers`, `driver_credentials`, `driver_push_subscriptions`, `orders`, `order_events`, `settlements`, `money_ledger`, `cashout_requests`, `audit_log`, `oauth_states`, `request_limits`.

**Order statuses** (enum `order_status`): `pending`, `assigned`, `picked_up`, `delivered`, `failed`, `returned`, `cancelled`.

**Settlement types:** `shop_payment`, `driver_cash_remittance`, `driver_pay`.

**Roles** (`my_role(workspace_id)`): `owner`, `manager`, `readonly`, plus shop owners (linked by `shops.user_id`) and couriers (signed courier session).

### 2.4 API routes (`app/api/`)
`/admin/cashout`, `/admin/member`, `/areas`, `/customers/lookup`, `/driver/auth`, `/driver/location`, `/driver/orders`, `/driver/push/subscribe`, `/drivers`, `/drivers/[id]`, `/invite`, `/invite/accept`, `/invite/preview`, `/orders`, `/orders/[id]/events`, `/orders/[id]/pod`, `/orders/auto-assign`, `/orders/bulk`, `/orders/bulk-import`, `/orders/location`, `/portal/auth/signup`, `/portal/cashout`, `/portal/orders`, `/settings`, `/settle`, `/shops`, `/shops/[id]`, `/shops/shopify` (+ `auth`, `callback`, `connect`, `sync`), `/webhooks/shopify`, `/workspace`.

### 2.5 How money works today (database triggers: do not break)
Defined in `001_schema.sql` and `009_security_and_accounting.sql`.

- On every order insert/update, `shop_balance_usd = collection_usd − delivery_fee_usd`.
- When an order **enters** `delivered` or `returned`, trigger `account_order` applies it. When it **leaves** that state, the trigger reverses the old effect first:
  - courier `cash_held_usd` (+ `cash_held_lbp`) increases by the cash collected (only for `delivered`; 0 for `returned`);
  - courier `pay_owed_usd` increases by `driver_pay_usd`;
  - shop `balance_usd` increases by `shop_balance_usd` (negative for returns: 0 − return fee);
  - a row is written to `money_ledger`.
- `guard_order_change` blocks deletes, blocks changes to workspace/shop/rate, allows cancel only from `pending`, and zeroes money on cancelled orders.
- Settlements (`account_settlement`):
  - `shop_payment` lowers the shop balance (USD only);
  - `driver_cash_remittance` lowers the cash a courier holds (cannot go below 0);
  - `driver_pay` lowers the pay owed (USD only, cannot go below 0).
- **Company profit per order = `delivery_fee_usd − driver_pay_usd`.**
- **Delivery modes:**
  - "Fee added": COD = item + fee (customer pays the fee).
  - "Free delivery": COD = item (the shop absorbs the fee).
- **Returns today:** `lib/orders.ts` `orderPatch` sets COD 0, fee $2 and courier pay min($1, pay). Phase 1 makes this per zone.
- Cash-out: `request_shop_cashout(...)` and `mark_cashout_paid(...)` (migration 020) lock rows and are idempotent.

### 2.6 Security model (keep all of it)
- Service-role API routes are wrapped in `api()`. They must check access themselves with `workspaceAccess(workspaceId, roles)`, `shopAccess(shopId)` or `driverAccess(driverId)` from `lib/access.ts`, and check that referenced IDs belong to the workspace (`validateReferences`).
- Request bodies are parsed with zod through `parseBody` from `lib/validation.ts` (a bad field returns 400 "Invalid <field>"). User text inside PostgREST `or()` filters must go through `ilikeAny`.
- Couriers sign in with phone + PIN. PINs are bcrypt-hashed in `driver_credentials`. The session is a signed httpOnly cookie (`cedar_driver_session`). `session_version` lets a manager log a courier out everywhere.
- Rate limits use the `consume_limit` RPC.
- Public tracking needs an exact tracking code. `track_orders_by_phone` returns no addresses.
- Row-level security is on for every table. App users mostly read; writes go through server routes.

### 2.7 Environments
| | Supabase project | Vercel | Notes |
|---|---|---|---|
| **Production** | `supabase-erin-nest` | Production | Live site: https://delivery-five-roan.vercel.app |
| **Staging** | `cedar-staging` | Preview + Development | Previews are behind Vercel Deployment Protection |

The Supabase CLI is currently linked to **staging**. GitHub: `mikesuppor-source/Delivery` (public).

### 2.8 Work already started for Phase 1
Branch **`feature/zone-pricing`** contains the uncommitted file **`supabase/migrations/021_zone_pricing.sql`**. The database tests pass with it. It adds:
- `delivery_areas.driver_pay_usd` (nullable; empty means "use the workspace default"), `return_fee_usd` (default 2), `return_driver_pay_usd` (default 1), with a check that none are negative;
- table `shop_area_prices (workspace_id, shop_id, area_id, fee_usd, updated_at)`, primary key `(shop_id, area_id)`, foreign keys that force shop and zone to be in the same workspace, read-only row-level security for staff and the shop owner.

**Start Phase 1 from this file. Do not rewrite it unless a test proves it wrong.**

---

## 3. Ground rules (non-negotiable)

### 3.1 Code
1. Keep the stack and the existing patterns. Match the surrounding code: naming, comment density, file layout.
2. Every new API route: `api()` wrapper + zod schema with `parseBody` + an access check (`workspaceAccess` / `shopAccess` / `driverAccess`) + `validateReferences` for every ID in the body.
3. Every new table: `workspace_id` column, row-level security enabled, `revoke insert, update, delete ... from anon, authenticated` unless users truly need to write directly, and tenant foreign keys `(x_id, workspace_id) references x(id, workspace_id)`.
4. **Money:** `numeric(10,2)` in SQL; never floats for stored money. Round to cents with one shared helper. Prices are **saved on the order at creation** and never recomputed later (changing a zone price must not change old orders).
5. Money movements happen only in database triggers or locked SQL functions, never by updating balances from the app.
6. UI uses the kit in `components/ui`. Don't create one-off buttons or inputs.
7. Every visible text goes through the translation layer (from Phase 2 on), English + Arabic.
8. Split files that pass about 600 lines into hooks + `sections/`, like `app/driver/[id]/run-sheet/` and `app/(desk)/orders/order-list/`.

### 3.2 Database migrations
- New migration per change: `supabase/migrations/0NN_short_name.sql`, wrapped in `begin; ... commit;`.
- **Never edit a migration that is already applied to production** (001 to 030). Add a new one.
- Make migrations safe to re-run: `if not exists`, `drop policy if exists`, `exception when duplicate_object`.
- Functions that use `gen_salt`, `crypt` or `gen_random_bytes` need `set search_path = public, extensions`.
- Every `security definer` function is for the server only, unless it checks the caller's role itself (like `profit_report`): `revoke all on function ... from public, anon, authenticated;` then `grant execute on function ... to service_role;`. Supabase otherwise lets anyone call it from the internet with the public site key. Migration 031 closed the ones in 024 to 026 that missed this, and `tests/database.test.mjs` fails if one is open to signed-out visitors.
- After a schema change, update `lib/supabase/database.types.ts` (`npm run types` against staging, or by hand).

### 3.3 Security
- Never commit `.env*`, `.agents/`, `.claude/skills/`, `skills-lock.json` or any key.
- Never expose courier pay or company profit to shops or customers.
- Never expose customer addresses on public pages.
- Couriers see only their own orders and money.
- Shops see only their own orders, prices and balance.

### 3.4 Checks before every merge
```bash
npm run typecheck
npm run lint
npm test
npm run test:db
npm run build
npm run test:e2e
```
All must pass. Then:
1. Push the branch; GitHub Actions `check.yml` must be green.
2. Apply migrations to **staging** (`supabase db push` while linked to staging) and test the preview deploy by hand.
3. Only after the owner approves: merge to `main`, then apply the migration to **production**.

### 3.5 Tests per change
- **Unit tests** (`tests/*.test.ts`) for every pure logic module (pricing, rules, formatting).
- **Database tests** (`tests/database.test.mjs`) for every new table/function: row-level security (who can read, who can't), tenant isolation, money triggers.
- **E2E tests** (`tests/e2e/*.spec.ts`) for every new screen flow, driven through the real forms (see `tests/e2e/helpers.ts` for `seeded`, `signInOwner`, `signInMerchant`, `creditShop`). Use unique random names in tests so runs don't collide.

---

## 4. Shared rules the whole system follows

### 4.1 Pricing rule (one function, used everywhere)
```
customer fee     = shop special price for the zone
                   → else zone fee_usd
                   → else workspace default_delivery_fee_usd
                   → else 3
courier pay      = zone driver_pay_usd
                   → else workspace default_driver_pay_usd
                   → else 1
return fee       = zone return_fee_usd (default 2)
return courier   = zone return_driver_pay_usd (default 1)
COD (fee added)  = item + customer fee
COD (free)       = item
shop receives    = COD − customer fee
company keeps    = customer fee − courier pay
```
A manager may override fee and courier pay on a single order from the desk. Shops and imports can't.

### 4.2 Order life cycle (after Phase 4 and 5)
```
pending ──► assigned ──► picked_up ──► delivered
   │            │            │  ▲
   │            │            ▼  │
   │            │          failed ──► (new attempt) ──► picked_up
   │            │            │
   │            │            └──► returned (back to shop)
   ▼            ▼
cancelled   held (in warehouse) ──► released ──► pending / assigned
```
- `cancelled` only from `pending` (enforced in the database).
- "Held" is a **flag plus a hold record** (Phase 4), not a new status, so the money triggers stay unchanged.

### 4.3 Who sees what
| | Owner | Manager | Read-only staff | Shop | Courier | Public |
|---|---|---|---|---|---|---|
| All orders | ✔ | ✔ | ✔ (read) | own | own | tracking code only |
| Customer fee | ✔ | ✔ | ✔ | own | ✔ | ✘ |
| Courier pay | ✔ | ✔ | ✔ | ✘ | own | ✘ |
| Company profit / reports | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ |
| Change prices | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ |
| Settlements & payouts | ✔ | ✔ | ✘ | request only | ✘ | ✘ |
| Warehouse | ✔ | ✔ | ✔ (read) | see "held" + reason | ✘ | "held" status only |

---

## 5. Phases

| # | Phase | Why |
|---|---|---|
| 1 | Pricing engine + profit report | Correct money is the base for everything |
| 2 | Professional design foundation | Shell, dashboard, Arabic, dark mode, tables |
| 3 | Warehouse holding | The owner's "store the orders" need |
| 4 | Dispatch pro | Pickups, sorting, routes, attempts, returns |
| 5 | Customer experience and intake | WhatsApp, live map, public "send a parcel" |
| 6 | Finance pro | Statements, payout schedule, expenses, P&L |
| 7 | Integrations and merchant API | WooCommerce, API keys, webhooks |
| 8 | SaaS platform | Sell to other delivery companies |

---

### PHASE 1: Pricing engine and profit report

**Goal:** every order gets the right customer fee, courier pay and return pricing from its zone (and shop special price), from every order source. Owners see their profit.

#### 1.1 Database
- Migration **021** (already written, section 2.8).
- No changes to triggers: they already use the prices saved on the order.

#### 1.2 Logic
**`lib/pricing.ts`** (pure, no imports from server code, safe in the browser):
```ts
export type ZonePrice = { fee_usd: number; driver_pay_usd: number | null; return_fee_usd: number; return_driver_pay_usd: number }
export type PricingDefaults = { default_delivery_fee_usd: number | null; default_driver_pay_usd: number | null }
export type OrderPrice = { feeUsd: number; driverPayUsd: number; returnFeeUsd: number; returnDriverPayUsd: number }

export function priceOrder(zone: ZonePrice | null, shopFee: number | null, defaults: PricingDefaults): OrderPrice
export function collectionFor(itemUsd: number, feeUsd: number, mode: 'added' | 'free'): number
export function breakdown(collectionUsd: number, feeUsd: number, driverPayUsd: number):
  { customerPays: number; shopReceives: number; courierEarns: number; companyKeeps: number }
export const money = (n: number) => Math.round(n * 100) / 100
```
Follows section 4.1 exactly.

**`lib/pricing-server.ts`**:
```ts
export async function loadPricing(db, workspaceId: string, shopId: string | null, areaId: string | null): Promise<OrderPrice>
```
Reads the zone, the shop special price and the workspace defaults in parallel and calls `priceOrder`. Also export `loadReturnPricing(db, order)` that uses the order's `area_id`.

#### 1.3 Use it in every order source
| Source | File | Change |
|---|---|---|
| Desk new order | `app/(desk)/orders/new/new-order-client.tsx` + `POST /api/orders` | Form auto-fills fee and courier pay from shop + zone. Server: if `deliveryFeeUsd` / `driverPayUsd` are missing, fill from `loadPricing`. Managers may send overrides. |
| Merchant portal | `POST /api/portal/orders`, `app/portal/portal-client.tsx` | Replace `delivery_fee_usd: area.fee_usd, driver_pay_usd: 1` with `loadPricing`. Shop can't send prices. |
| CSV bulk import | `POST /api/orders/bulk-import` | Replace `fee = area ? area.fee_usd : 3` and `Math.max(1, fee-1)` with `loadPricing` per row (cache zones and shop prices once per request). |
| Shopify | `lib/import-orders.ts` | Same as bulk import. |
| Returns | `lib/orders.ts` `orderPatch` | Accept an optional `returnPricing` argument. When status becomes `returned`: `delivery_fee_usd = returnFeeUsd`, `driver_pay_usd = returnDriverPayUsd`, `collection_usd = 0`. Without the argument keep today's behaviour ($2 / min($1, pay)). The order PATCH, courier PATCH (`/api/driver/orders`) and `/api/orders/bulk` routes load it when the new status is `returned`. |

#### 1.4 API
- `lib/catalog.ts`: add to area create/change schemas `driverPayUsd` (money or null), `returnFeeUsd`, `returnDriverPayUsd`.
- **New** `PUT /api/shops/[id]/prices` body `{ workspaceId, prices: [{ areaId, feeUsd: number | null }] }`. Owner/manager only. `feeUsd` null → delete the special price; otherwise upsert. Validate every `areaId` belongs to the workspace.
- **New** `GET /api/reports/profit?workspaceId&from&to` → totals and breakdowns (1.6). Owner/manager only.

#### 1.5 Screens
- **Delivery Areas** (`app/(desk)/areas/area-list-client.tsx`): columns *Customer fee*, *Courier pay*, *You keep* (fee − pay, read-only, green if > 0, red if ≤ 0), *Return fee*, *Return courier pay*. Quick presets updated (e.g. "Beirut: $8 / $1 / $2 / $1", "Mount Lebanon: $8 / $3 / $2 / $1", "North & South: $8 / $4 / $3 / $1.50"). Empty courier pay shows "Default ($X)".
- **Shop profile** (`app/(desk)/shops/...`): section **"Special prices"**, a table of all zones with the normal fee and an input for this shop's price; empty = normal. Save button calls `PUT /api/shops/[id]/prices`.
- **New Order form**: when shop and zone are chosen, show a **price card**:
  ```
  Customer pays   $18.00
  Shop receives   $10.00
  Courier earns    $1.00
  Company keeps    $7.00
  ```
  Managers see "Edit price" to override fee/pay for this order only.
- **Portal**: "My prices" page listing each zone and the shop's fee (never courier pay). The new-order form in the portal shows the fee and the total the customer will pay.
- **Reports** (new page `app/(desk)/reports/`, sidebar link, owners and managers only): see 1.6.

#### 1.6 Profit report
- Date filter: Today, Yesterday, This week, This month, Last month, Custom. Uses `delivered_at` for delivered orders; returned orders by their return time from `order_events`.
- KPI cards: Orders delivered, Orders returned, Customer fees, Courier pay, **Company profit**, COD collected.
- Tables: **by zone**, **by courier**, **by shop**. Each row shows orders, fees, courier pay and profit. Sortable.
- CSV export of each table.
- Build the numbers with one SQL function `profit_report(p_workspace, p_from, p_to)` returning jsonb, `security definer`, that checks `my_role(p_workspace) in ('owner','manager')`.

#### 1.7 Tests
- Unit `tests/pricing.test.ts`: every fallback in 4.1, both delivery modes, rounding (e.g. 0.1 + 0.2), breakdown math, return pricing.
- DB: `shop_area_prices` read access (staff yes, owning shop yes, other shop no, other workspace no), tenant foreign key blocks cross-workspace rows, return with zone pricing moves shop −$2 / courier pay +$1, `profit_report` refuses readonly users.
- E2E: change a zone's prices → new desk order uses them; shop special price wins; portal order uses shop price; CSV import uses zone prices; mark returned → shop balance −return fee; report totals match the orders created.

#### 1.8 Done when
- [ ] All order sources use `loadPricing`; no hard-coded `3`, `1` or `fee-1` remains (`grep` proves it).
- [ ] Old orders keep their saved prices after a zone price change.
- [ ] Returns use the zone's return prices.
- [ ] The report's profit equals the sum of `delivery_fee_usd − driver_pay_usd` on the same orders.
- [ ] All checks in 3.4 pass; owner approved on staging.

---

### PHASE 2: Professional design foundation (keep Cedar green)

**Goal:** the desk looks and feels like a professional logistics product, on desktop, tablet and phone, in English and Arabic, light and dark.

#### 2.1 Design system
- **Brand:** Cedar green stays the primary color. Define tokens on `:root` in `components/ui/ui.css`:
  - `--ui-primary` (Cedar green), `--ui-primary-hover`, `--ui-primary-soft` (10% tint for backgrounds);
  - neutrals `--ui-bg`, `--ui-surface`, `--ui-surface-2`, `--ui-border`, `--ui-text`, `--ui-text-muted`;
  - status colors `--ui-success`, `--ui-warning`, `--ui-danger`, `--ui-info`;
  - one color per order status (pending grey, assigned blue, picked_up indigo, held amber, delivered green, failed orange, returned purple, cancelled red-grey). Use them in a single `StatusBadge` component.
- **Dark mode:** redefine the tokens under `[data-theme="dark"]` and under `@media (prefers-color-scheme: dark)` when no theme is chosen. Toggle in the top bar, saved per user.
- **Type:** one font family (system UI or Inter), sizes 12 / 14 / 16 / 20 / 24 / 32. Numbers in tables use `font-variant-numeric: tabular-nums`.
- **Spacing:** 4px scale. Corners 8px (inputs, buttons), 12px (cards). One shadow level for cards, one for modals.
- **Merge** the old `.btn` styles in `app/globals.css` into the kit `Button` and remove the duplicates.
- **Kit additions** in `components/ui`: `StatusBadge`, `MoneyText` (formats USD/LBP, red when negative), `KpiCard`, `DataTable`, `FilterBar`, `EmptyState`, `Drawer` (side panel), `Tabs`, `DateRangePicker`, `ConfirmDialog`, `Skeleton`, `Toast` (move from the courier app into the kit).

#### 2.2 App shell (desk)
- **Left sidebar** (collapsible, icons + labels): Dashboard, Orders, Live map, Warehouse, Pickups, Couriers, Shops, Zones & prices, Finance (Statements, Payouts, Expenses), Reports, Settings. Items hidden by role (4.3).
- **Top bar:** workspace name/logo, **global search** (order code, tracking code, customer phone, shop name; results grouped, keyboard shortcut `/`), "New order" button, notifications bell, theme toggle, language toggle, user menu.
- **Page header** component: title, breadcrumb, main actions on the right.
- **Responsive:**
  - under 1024px the sidebar becomes a drawer;
  - under 640px tables turn into cards;
  - forms become one column;
  - no horizontal page scroll anywhere.

#### 2.3 Languages and right-to-left
- Move `lib/driver-i18n.ts` into a general `lib/i18n/` with `t(key)` and dictionaries `en.ts` and `ar.ts`.
- `<html dir="rtl" lang="ar">` when Arabic is chosen. Use CSS logical properties (`margin-inline-start`, `padding-inline-end`) everywhere so the layout mirrors.
- Numbers and money stay in Latin digits for clarity.
- The courier app keeps its existing language switch, now using the shared layer.

#### 2.4 DataTable
- Sorting, column show/hide, sticky header, row selection with a bulk-actions bar, pagination or infinite scroll, CSV export.
- Filter bar with chips (status, zone, shop, courier, date).
- **Saved views** per user (e.g. "Unassigned today", "Stuck orders"). Store them in a new `saved_views` table (`workspace_id`, `user_id`, `page`, `name`, `filters jsonb`), row-level security: users see their own.
- Use it for: orders, shops, couriers, zones, settlements, warehouse, reports.

#### 2.5 New dashboard (`app/(desk)/page.tsx`)
- **KPI row (today):** New orders, Delivered, Delivery success % (delivered ÷ (delivered + failed + returned)), On-time %, Cash with couriers (USD + LBP), Today's profit (owners/managers only).
- **"Couriers now":** each active courier with status (on route / idle / offline by last GPS), orders in hand, cash held.
- **"Needs attention"** list with one-click actions:
  - unassigned orders older than 30 min;
  - orders in `assigned`/`picked_up` for more than 4 hours;
  - failed orders with no new attempt;
  - parcels held longer than their `deliver_after` date (Phase 3);
  - pending shop cash-out requests.
- **Charts:** orders per day (last 14 days), deliveries by zone. Simple bars; follow the kit tokens.

#### 2.6 Split the remaining large files
- `app/portal/portal-client.tsx` (~2,190 lines)
- `app/(desk)/drivers/[id]/driver-profile-client.tsx` (~1,905 lines)
- `app/(desk)/shops/[id]/shop-profile-client.tsx` (~1,837 lines)

Split each into a folder with `context.tsx`, `use-*.ts` hooks and `sections/*.tsx`, the way `app/(desk)/orders/order-list/` is done. **Behaviour must not change.** The existing e2e tests must pass unchanged.

#### 2.7 Done when
- [ ] Every desk page uses the shell, the kit and translated text.
- [ ] Arabic mirrors correctly on every page (screenshots in both languages at 1440px, 768px and 375px).
- [ ] Dark mode has no unreadable text or white flashes.
- [ ] Lighthouse accessibility ≥ 90 on Dashboard, Orders, New order, Portal home.
- [ ] All checks in 3.4 pass.

---

### PHASE 3: Warehouse holding (the owner's "store the orders")

**Goal:** a parcel can be taken into a warehouse (hub), stored on a shelf with a reason and a release date, then released to dispatch, with full history.

#### 3.1 Database (migration `022_warehouse.sql`)
- `hubs`: `id`, `workspace_id`, `name`, `address`, `lat`, `lng`, `is_default bool`, `active bool`, `created_at`. Unique `(id, workspace_id)`.
- `hub_shelves` (optional but recommended): `id`, `workspace_id`, `hub_id`, `code` (e.g. "A-03"), `zone_id` (nullable, to sort shelves by zone). Unique `(hub_id, code)`.
- `order_holds`:
  - `id`, `workspace_id`, `order_id`, `hub_id`, `shelf_code`;
  - `reason` (enum `hold_reason`: `weather`, `far_zone`, `customer_request`, `scheduled`, `address_problem`, `shop_request`, `other`), `note`;
  - `deliver_after date` (nullable);
  - `held_at`, `held_by`, `released_at` (nullable), `released_by`, `release_note`;
  - only one open hold per order: unique partial index `on (order_id) where released_at is null`.
- `orders`: add `is_held boolean not null default false` and `hub_id uuid` (tenant foreign key). A trigger on `order_holds` keeps `is_held` and `hub_id` in sync.
- **Rules (in SQL):**
  - can hold only orders in `pending`, `assigned` or `failed`;
  - holding an `assigned` order clears `driver_id` and moves it back to `pending`;
  - delivered / returned / cancelled orders can't be held;
  - a held order can't be assigned or picked up until released.
- **Storage fee (optional, per zone):** `delivery_areas.storage_fee_per_day_usd numeric(10,2) default 0` and `free_storage_days int default 3`. On release, if days held > free days, add `(days − free) × fee` to `orders.storage_fee_usd` (new column, default 0). The shop pays it: include it in `shop_balance_usd` as `collection − delivery_fee − storage_fee` (new migration replaces the `shop_balance_usd` line in the order trigger; add a database test that old orders are unchanged).
- Functions:
  - `hold_order(p_order, p_hub, p_shelf, p_reason, p_note, p_deliver_after, p_user)`
  - `release_order(p_order, p_user, p_note)`

  Both are `security definer`, lock the order row (`for update`), check the role, write `order_events` and `audit_log`.
- Row-level security: staff read; shops read holds on their own orders (reason + `deliver_after`, no shelf); no direct writes.

#### 3.2 API
- `POST /api/warehouse/hold` `{ workspaceId, orderIds[], hubId, shelfCode?, reason, note?, deliverAfter? }` (bulk).
- `POST /api/warehouse/release` `{ workspaceId, orderIds[], note? }`.
- `GET /api/warehouse?workspaceId&hubId&reason&overdue` → list.
- `GET/POST/PATCH /api/hubs` → hub and shelf management (owner/manager).

#### 3.3 Screens
- **Warehouse page** (sidebar):
  - tabs **In storage**, **Ready to release** (deliver_after ≤ today), **Released (history)**;
  - columns: tracking code, shop, customer zone, shelf, reason, held since, days held, deliver after, storage fee so far;
  - row actions: Release, Move shelf, Print label;
  - bulk: Release selected, Print shelf labels.
- **Scan in / scan out:** extend `app/(desk)/scan/` with a "Warehouse" mode. Scanning a tracking code asks for shelf + reason (scan in), or releases it (scan out). Big buttons, works on a phone camera.
- **Order list and order details:** an amber "Held" badge with reason and date; actions "Hold in warehouse" / "Release".
- **Dashboard:** "In storage" count and "Overdue holds" in "Needs attention".
- **Portal:** shop sees "Held: bad weather, delivery from 3 Nov".
- **Tracking page:** "Your parcel is safe in our warehouse and will be delivered from 3 Nov". No hub address.
- **Settings:** manage hubs and shelves; storage fee per zone in Zones & prices.

#### 3.4 Automation
- Daily job (Supabase `pg_cron` or a Vercel Cron route `/api/cron/holds`): release-reminder notifications for holds whose `deliver_after` is today; flag holds older than 7 days.

#### 3.5 Tests
- DB:
  - can't hold delivered orders;
  - assigned → hold clears the courier;
  - held orders can't be assigned;
  - one open hold per order;
  - release closes the hold;
  - storage fee math with free days;
  - shop can read the reason but not the shelf;
  - other workspace can't see anything.
- E2E: hold from the order list → appears in Warehouse → scan out → order back in pending; portal shows held status.

#### 3.6 Later (for SaaS customers that store stock, not in this phase)
Full SKU inventory:
- `products` per shop (SKU, name, barcode);
- `stock_moves` (in, out, adjust, return-restock) with a running quantity per hub;
- orders with line items that reserve stock → pick → pack → ship;
- low-stock alerts;
- inventory statements for shops.

Plan it as Phase 8+.

---

### PHASE 4: Dispatch pro

**Goal:** the full operational chain, from collecting parcels at shops to sorting and the courier's day.

#### 4.1 Pickup runs (collecting parcels from shops)
- Table `pickups`:
  - `id`, `workspace_id`, `shop_id`, `driver_id`;
  - `status` (`requested`, `assigned`, `collected`, `cancelled`);
  - `requested_at`, `collected_at`, `parcel_count`, `note`, `proof_photo_path`;
  - plus `pickup_orders (pickup_id, order_id)`.
- The shop requests a pickup from the portal ("I have 12 parcels ready"), or dispatch creates one.
- The courier's run sheet gets a **Pickups** tab: go to shop, scan each parcel (or confirm count), take a photo, mark collected.
- Orders collected → `received_at_hub` timestamp when scanned in at the hub.

#### 4.2 Hub sorting
- Scan mode "Sort": scanning a parcel shows its **zone in huge text and color** and suggests the courier for that zone (uses the existing area driver pool, migration 015).
- "Sorted" list per zone; one click assigns the whole zone bag to a courier.

#### 4.3 Route order per courier
- On the run sheet, a "Best order" button sorts the courier's stops by distance from their current GPS (nearest-neighbour on `orders.location_lat/location_lng`; stops without coordinates go last; no paid API needed). Reuse `lib/maps.ts` for parsing map links and coordinates.
- The courier can drag to reorder; the order is saved (`orders.route_position`).
- "Open in Google Maps / Waze" for each stop (already partly exists; keep it).

#### 4.4 Delivery attempts and failure reasons
- Table `delivery_attempts`: `order_id`, `driver_id`, `attempt_no`, `result` (`delivered`, `no_answer`, `refused`, `wrong_address`, `rescheduled`, `closed`, `other`), `note`, `photo_path`, `lat`, `lng`, `created_at`.
- The courier must choose a reason when marking failed.
- Workspace setting `max_attempts` (default 3). After the max, the order moves to "Return to shop" automatically (a dispatcher can override).
- A failed order with reason "rescheduled" can be put on hold until a date (links to Phase 3).

#### 4.5 Return-to-shop workflow
- Returned parcels go into a "Returns" list per shop.
- A courier takes a return batch to the shop; the shop signs on the courier's phone (signature pad or photo) → `returns_handed_at`.
- The portal shows "Returned parcels waiting for you" and "Returned this month".

#### 4.6 Courier app improvements
- **Earnings screen:** today / this week / this month: deliveries, returns, pay earned, pay already received, cash held to hand over.
- **Scan** at pickup and at delivery (camera, using the same scanner component as the desk).
- **Cash handover:** the courier sees exactly how much cash to give the office (USD + LBP); the office confirms in Statements (existing `driver_cash_remittance`).
- **Offline:** queue status updates when there is no signal and send them when back online (service worker + IndexedDB). Show "3 updates waiting to send".

#### 4.7 Auto-assign upgrade
Extend `/api/orders/auto-assign`:
- by zone pool first;
- then the courier with the fewest open orders;
- skip couriers who are offline (no GPS for 30 min) or over a max load (setting).

#### 4.8 Tests
- DB: pickup rows tenant-isolated; attempt limit triggers return-to-shop.
- E2E:
  - shop requests pickup → courier collects → hub scan-in;
  - sort screen shows the zone;
  - three failed attempts → order in Returns;
  - courier earnings match their delivered orders.

---

### PHASE 5: Customer experience and order intake

#### 5.1 Automatic customer messages
- Events: order created ("Your order from {shop} is on its way, track: {link}"), out for delivery (picked up), delivered, failed (with reason), held (with date).
- **Channel:** WhatsApp Cloud API with approved templates (Meta Business account needed; the owner sets it up). Fallback: SMS provider. Make the provider a small interface `lib/messaging.ts` so it can be swapped.
- Table `message_log`: `workspace_id`, `order_id`, `channel`, `template`, `to_phone`, `status`, `error`, `created_at`.
- Settings page: switch each message on/off, edit text per language.
- Sending happens in the background (database webhook or a queue table read by a cron route), never blocking the status change.

#### 5.2 Live map
- **Desk "Live map" page:** all couriers (from `drivers.current_lat/lng`, updated by `/api/driver/location`), colored by status. Click a courier → their stops on the map.
- Use Leaflet + OpenStreetMap tiles (free) with the kit colors.
- **Customer tracking page:** when the order is `picked_up` and the courier is close, show an approximate courier position (rounded to ~200 m, only during the active delivery) and a "Call courier" button that goes through the dispatch number.

#### 5.3 Public "Send a parcel" page
- `/send`, no account needed: sender name + phone, pickup address, receiver name + phone + address, zone picker (shows the price), declared value, COD amount (optional), notes.
- Creates an order under a special "Walk-in customers" shop in the workspace, status `pending`, with the zone price.
- Protected by rate limits (`consume_limit`) and a simple honeypot field. No CAPTCHA solving needed by us; if spam starts, add Cloudflare Turnstile.
- Confirmation page with tracking code and the WhatsApp dispatch link (`lib/support.ts`).

#### 5.4 WhatsApp / phone order intake (offline orders)
- **"Quick order" panel** in the desk, made for dispatchers typing while on the phone:
  - customer phone first (autofills name and address from `customers/lookup`);
  - shop picker;
  - zone autodetected from saved addresses;
  - price card;
  - Enter to save and start the next one.
- **Paste parser:** paste a WhatsApp message ("Name: Maya, 70 123 456, Hamra near…, $25") → fields filled in, the dispatcher checks and saves. Pure function `lib/parse-order-text.ts` with many unit tests (Arabic and English examples).

#### 5.5 Delivery time slots and ratings
- Zones can define slots (e.g. 10–1, 1–4, 4–7). Orders can store `slot`. Run sheets are grouped by slot.
- After delivery, the customer gets a link to rate 1–5 + a comment (`order_ratings` table). The courier profile shows the average rating.

#### 5.6 Tests
- Unit: text parser, message templates.
- E2E: `/send` creates a pending order with the right price; quick order flow; rating link works only once.

---

### PHASE 6: Finance pro

#### 6.1 Shop statements
- Monthly (and custom range) **PDF statement** per shop:
  - opening balance;
  - each delivered/returned order (code, date, COD, fee, storage fee, net);
  - payouts made;
  - closing balance.
- Company logo and name from workspace settings.
- Generate on the server (e.g. `@react-pdf/renderer`). Download from desk and portal. Option to send by WhatsApp/email.

#### 6.2 Payout schedule
- Workspace setting: payout days (e.g. Monday + Thursday) and minimum payout ($20).
- The **payout run** screen lists every shop with a positive balance over the minimum, their preferred method (cash at office, Whish, OMT, bank) and account, and a checkbox. "Pay selected" creates `shop_payment` settlements in one locked SQL function (`run_shop_payouts`) with an idempotency key per run.
- Keep the existing on-demand cash-out requests (`request_shop_cashout` / `mark_cashout_paid`).

#### 6.3 Courier pay
- **Courier commission rules:** fixed per zone (Phase 1) **or** a percentage of the fee, chosen per courier (`drivers.pay_mode`, `pay_percent`). Bonus rules (e.g. +$5 after 30 deliveries/week) stored as simple rows and applied by a weekly function that creates a `driver_bonus` line.
- **Weekly courier pay run**, same pattern as shop payouts (`driver_pay` settlements).
- **Cash discrepancy report:** uses the existing `cash_discrepancy_usd` on orders.

#### 6.4 Company expenses and P&L
- Table `expenses`: `workspace_id`, `date`, `category` (fuel, salaries, rent, phone, maintenance, other), `amount_usd`, `amount_lbp`, `note`, `receipt_path`, `created_by`.
- **P&L report** per month:
  - revenue = customer fees + storage fees;
  - minus courier pay;
  - minus bonuses;
  - minus expenses;
  - = net profit.
- Chart by month.

#### 6.5 Exchange rate history
Table `exchange_rates` (`workspace_id`, `rate`, `set_at`, `set_by`). New orders lock the current rate (already done per order). The Settings page shows the history.

#### 6.6 Invoices (for big merchants on monthly terms)
Optional invoice per shop per month for delivery fees when the shop pays fees separately (prepaid / non-COD orders). Table `invoices` + `invoice_lines`, PDF like statements.

#### 6.7 Tests
- DB:
  - payout run is idempotent;
  - can't pay more than the balance;
  - bonuses apply once;
  - P&L sums match the ledger.
- E2E: generate a statement PDF (check it downloads and lists the right orders); payout run reduces balances.

---

### PHASE 7: Integrations and merchant API

#### 7.1 Merchant API (REST)
- API keys per shop. Use the existing `shop_integrations.api_key` field, but **store only a hash** (sha256) and show the key once on creation, like courier PINs.
- Endpoints under `/api/v1/` (authenticated by `Authorization: Bearer <key>`, rate limited):
  - `POST /orders` → create (uses Phase 1 pricing);
  - `GET /orders/{trackingCode}` → status;
  - `GET /orders?from&to&status` → list;
  - `POST /orders/{code}/cancel` → only when pending;
  - `GET /zones` → zones and the shop's prices.
- OpenAPI document at `/api/v1/openapi.json` and a docs page in the portal.

#### 7.2 Webhooks to merchants
- The shop sets a webhook URL in the portal.
- Events: `order.status_changed`, `order.delivered`, `order.returned`, `payout.paid`.
- Signed with HMAC-SHA256 header `X-Cedar-Signature`.
- Retries with backoff (queue table + cron).
- `webhook_deliveries` log visible in the portal.

#### 7.3 WooCommerce
Plugin-less connection using WooCommerce REST keys (the shop pastes keys in the portal; store encrypted with `pgsodium`/Vault or an app-level key from env). Import orders the same way as Shopify (`lib/import-orders.ts` refactored into a provider interface: `shopify`, `woocommerce`).

#### 7.4 Tests
- Unit: signature generation and checking.
- E2E/API:
  - key auth works and is rejected after revoke;
  - created order uses the shop's zone price;
  - a webhook fires on delivery (use a local test receiver).

---

### PHASE 8: SaaS platform (sell Cedar to other delivery companies)

#### 8.1 Multi-company
- Already isolated by `workspace_id`. Audit **every** table and function once more with a database test that creates two workspaces and proves workspace A can't read or change workspace B's data through any route.
- Workspace **branding:** logo, company name, primary color (default Cedar green), support WhatsApp number, used in the shell, tracking page, waybills, statements and messages. The `lib/support.ts` number becomes per workspace.
- **Custom domain** per company (later): `track.theircompany.com` via Vercel domains API.

#### 8.2 Plans and billing
- `plans` (Starter / Pro / Business: limits on orders per month, couriers, hubs, API access).
- `subscriptions` per workspace. Usage counter of orders per month. Soft limit: warning banner at 90%, block new orders at 110%.
- Payment collection: Stripe or a local method. **The owner decides**; build the interface `lib/billing.ts` with a "manual" provider first (the super-admin marks invoices paid).

#### 8.3 Super-admin console
`/superadmin` (only for Cedar staff, by a list of user IDs in an env var):
- list of companies, plan, usage, last activity;
- suspend/activate;
- impersonate read-only with an audit log entry.

#### 8.4 Detailed permissions
Replace the three roles with permission sets: `orders.create`, `orders.assign`, `prices.edit`, `finance.view`, `finance.pay`, `warehouse.manage`, `settings.edit`, `reports.view`. Keep `owner` as all permissions. Migrate existing roles to matching sets.

#### 8.5 Reliability and legal
- **Sentry** (or similar) for front-end and server errors, with secrets scrubbed.
- **Uptime check** on `/api/health` (new route that checks the database).
- The backups workflow (`backup.yml`) must be green every night. Add a monthly **restore test** to staging.
- **Terms of service and privacy policy** pages; per-workspace liability settings: maximum declared value per parcel, insurance option, prohibited items list shown on `/send` and in the portal.
- Data export for a company (all their data as CSV/JSON) and account deletion on request.

#### 8.6 Onboarding for a new company
Wizard after sign-up:
1. company name + logo;
2. exchange rate;
3. create zones from a Lebanon template built from `lib/lebanon-geo.ts` (Beirut, Mount Lebanon by caza, North, South, Bekaa) with suggested prices;
4. add first courier (PIN shown once);
5. add first shop;
6. place a test order.

---

## 6. Design reference (applies to every phase)

### 6.1 Principles
- **Calm, dense, fast.** Dispatchers work all day; show more data with clear hierarchy, not big empty cards.
- **Status first:** every order row starts with its colored status badge and tracking code.
- **Money is always formatted** (`$18.00`, `1,620,000 LBP`). Negative is red. Profit is green. Never show raw floats.
- **One main action per screen**, in Cedar green, top right. Destructive actions are red and always ask to confirm.
- **Empty states** explain what to do next, with a button.
- **Loading:** skeletons, never a blank page. **Errors:** a clear sentence + "Try again", never a raw error code.

### 6.2 Key screens (what each must show)
| Screen | Must show |
|---|---|
| Dashboard | KPI row, Couriers now, Needs attention, 2 small charts |
| Orders | Status tabs with counts, filter bar, DataTable, bulk bar, quick order button |
| Order details (drawer) | Timeline from `order_events`, price breakdown, customer, courier, attempts, holds, proof of delivery photos, actions |
| New / quick order | Phone-first form, address autocomplete from history, zone, price card, keyboard flow |
| Live map | Couriers, stops, filters by zone |
| Warehouse | Tabs, shelf/age columns, scan in/out |
| Couriers | Status, today's orders, cash held, pay owed, rating; profile with earnings and PIN reset |
| Shops | Balance, orders this month, special prices, integrations, statements |
| Zones & prices | Price grid with "You keep" column, presets, storage fee |
| Finance | Statements, payout runs, courier pay runs, expenses, cash-outs |
| Reports | Profit, P&L, by zone / courier / shop, exports |
| Courier app (dark theme) | Run sheet by slot, big action buttons, scan, earnings, cash to hand over, offline queue |
| Portal (shop) | Balance card, new order, orders list, pickups, returns, prices, statements, API keys, webhooks |
| Tracking (public) | Big status, timeline, expected day, held message, contact dispatch |

### 6.3 Accessibility
- Contrast AA minimum.
- Every input has a label.
- Every icon button has an `aria-label`.
- Full keyboard use on the desk.
- Touch targets ≥ 44px in the courier app.

---

## 7. Go-live checklist (owner's tasks, not code)

These are done by the owner in the provider dashboards. The AI must not do them and must never ask for passwords in chat.

- [ ] **Rotate leaked secrets:** the database password and the backup passphrase were pasted in a chat earlier. Change both, then update the GitHub secrets `SUPABASE_DB_URL` (use Supabase → Connect → **Session pooler** string, password with letters and numbers only) and `BACKUP_PASSPHRASE`.
- [ ] Confirm the nightly **Backup** workflow run is green on GitHub Actions.
- [ ] Set `NEXT_PUBLIC_SUPPORT_PHONE` (dispatch WhatsApp number) in Vercel for Production and Preview, then redeploy.
- [ ] Supabase Auth → URL configuration: Site URL `https://delivery-five-roan.vercel.app`, redirect `https://delivery-five-roan.vercel.app/**`.
- [ ] Supabase Auth → SMTP: connect an email sender (Resend or Brevo) so sign-up and reset emails arrive.
- [ ] Issue a **PIN for each courier** from the desk (Couriers → profile → Reset PIN) and give it to them in person.
- [ ] Do one **real end-to-end delivery**: create an order, courier picks it up and delivers, record the cash handover, pay the shop. Check the numbers.
- [ ] Decide on **Supabase Pro** (daily backups, no pausing) and the **Vercel plan** (Hobby is not for commercial use).
- [ ] Buy a **custom domain** and connect it in Vercel; then update the Supabase Auth URLs.
- [ ] For Phase 5: create a **Meta WhatsApp Business** account and get message templates approved.

---

## 8. Things the AI builder must NOT do

- Don't rewrite working modules "to clean up" outside the current phase.
- Don't change the money triggers' logic without a database test showing old orders keep their balances.
- Don't edit migrations 001 to 030.
- Don't store prices only in the frontend or compute balances in the app.
- Don't add a new UI library or CSS framework; extend `components/ui`.
- Don't use the Supabase service role key in browser code.
- Don't disable row-level security, even "temporarily".
- Don't push to `main`, run migrations on production, or change production settings without the owner's explicit approval.
- Don't commit secrets, `.env*` files or local agent folders.
- Don't remove or weaken existing tests to make a phase pass.

---

## 9. Glossary

| Term | Meaning |
|---|---|
| Workspace | One delivery company (a SaaS customer) |
| Shop / merchant | A business sending parcels through the company |
| Courier / driver | Delivers parcels; uses the courier app |
| Zone / area | A delivery region with its own prices (`delivery_areas`) |
| COD | Cash on delivery: money the courier collects from the customer (`collection_usd`) |
| Customer fee | The company's delivery price (`delivery_fee_usd`) |
| Courier pay | What the company pays the courier per order (`driver_pay_usd`) |
| Shop balance | Money the company owes the shop (`shops.balance_usd`) |
| Cash held | COD money a courier has not handed to the office yet |
| Pay owed | Courier pay not paid yet |
| Settlement | A recorded money movement (shop payment, cash handover, courier pay) |
| Hold | A parcel stored in a hub before delivery |
| Hub | A warehouse / branch |
| Run sheet | A courier's list of today's stops |
| POD | Proof of delivery (photo, cash collected, location) |
