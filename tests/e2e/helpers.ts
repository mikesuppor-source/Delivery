import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { expect, type Page } from 'playwright/test'
import type { Database } from '../../lib/supabase/database.types'

// Test accounts created by scripts/seed-local.mjs (local database only)
export const OWNER = { email: 'owner@cedar.test', password: 'CedarLocalOwner-2026' }
export const MERCHANT = { email: 'merchant@cedar.test', password: 'CedarLocalMerchant-2026' }
export const COURIER = { phone: '71 123 456', pin: '482913' }

let cached: ReturnType<typeof createClient<Database>> | null = null

/** Service-role client for the local Supabase. Refuses anything that is not localhost. */
export function localDb() {
  if (cached) return cached
  const status = Object.fromEntries(
    execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8', shell: process.platform === 'win32' })
      .split(/\r?\n/)
      .map(line => line.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map(m => [m[1], m[2]])
  )
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(status.API_URL || '')) throw new Error('Not a local Supabase: ' + status.API_URL)
  cached = createClient<Database>(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  return cached
}

export async function seeded() {
  const db = localDb()
  const one = <T,>(result: { data: T; error: unknown }): NonNullable<T> => {
    if (result.error || !result.data) throw new Error('Seed data missing. Run node scripts/seed-local.mjs first.')
    return result.data
  }
  const workspace = one(await db.from('workspaces').select('id').eq('slug', 'cedar-local').single())
  const courier = one(await db.from('drivers').select('id').eq('workspace_id', workspace.id).eq('name', 'Rami Courier').single())
  const other = one(await db.from('drivers').select('id').eq('workspace_id', workspace.id).eq('name', 'Second Courier').single())
  const shop = one(await db.from('shops').select('id').eq('workspace_id', workspace.id).eq('name', 'Local Test Shop').single())
  const area = one(await db.from('delivery_areas').select('id').eq('workspace_id', workspace.id).eq('name', 'Beirut Central').single())
  // Each run starts with the courier's known PIN (tests may reset it)
  await db.rpc('set_driver_pin', { p_driver: courier.id, p_pin: COURIER.pin })
  return { db, workspaceId: workspace.id, courierId: courier.id, otherCourierId: other.id, shopId: shop.id, areaId: area.id }
}

/** Adds a delivered order so the shop has a fresh balance to pay out. Returns the amount credited. */
export async function creditShop(net: number) {
  const { db, workspaceId, shopId, areaId, courierId } = await seeded()
  const code = 'LS-E2E' + Math.random().toString(36).slice(2, 7).toUpperCase()
  const { data: order, error } = await db.from('orders').insert({
    workspace_id: workspaceId, shop_id: shopId, area_id: areaId, driver_id: courierId, code, status: 'assigned',
    usd_to_lbp_rate: 89500, collection_usd: net + 3, delivery_fee_usd: 3, driver_pay_usd: 2,
    recipient_name: 'E2E Customer', recipient_phone: '+961 3 555 666', recipient_address: 'Hamra Street 12',
  }).select('id').single()
  if (error || !order) throw new Error('Could not create order: ' + error?.message)
  for (const status of ['picked_up', 'delivered'] as const) await db.from('orders').update({ status }).eq('id', order.id)
  return net
}

async function signIn(page: Page, path: string, account: { email: string; password: string }, landing: RegExp) {
  await page.goto(path)
  await page.locator('input[type=email]').fill(account.email)
  await page.locator('input[type=password]').fill(account.password)
  await page.locator('button[type=submit]').click()
  // Generous wait: a fresh dev server compiles the landing page on first sign-in
  await expect(page).toHaveURL(landing, { timeout: 30_000 })
}
export const signInOwner = (page: Page) => signIn(page, '/login', OWNER, /localhost:3000\/$/)
export const signInMerchant = (page: Page) => signIn(page, '/portal/login', MERCHANT, /\/portal$/)

/** Calls the app's API from inside the page so the browser's own cookies are used. */
export async function apiCall(page: Page, path: string, method = 'GET', body?: unknown) {
  return page.evaluate(
    async ({ path, method, body }) => {
      const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
      return { status: res.status, body: await res.json().catch(() => ({})) }
    },
    { path, method, body }
  )
}
