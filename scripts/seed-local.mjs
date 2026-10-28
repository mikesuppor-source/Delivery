// Seeds a LOCAL Supabase (supabase start) with test data for manual testing.
// Refuses to run against anything but localhost.
//
//   npx supabase start
//   node scripts/seed-local.mjs
//
// Test logins (local only):
//   Desk owner:     owner@cedar.test     / CedarLocalOwner-2026
//   Merchant:       merchant@cedar.test  / CedarLocalMerchant-2026
//   Courier app:    +961 71 123 456      / PIN 482913
//   Courier (no PIN yet): +961 70 222 333
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const status = Object.fromEntries(
  execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8', shell: process.platform === 'win32' })
    .split(/\r?\n/)
    .map(line => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map(m => [m[1], m[2]])
)
const url = status.API_URL
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url || '')) throw new Error('Refusing to seed a non-local database: ' + url)
const db = createClient(url, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const must = async (promise, what) => {
  const { data, error } = await promise
  if (error) throw new Error(what + ': ' + error.message)
  return data
}
async function user(email, password) {
  const { data } = await db.auth.admin.listUsers()
  const existing = data?.users.find(u => u.email === email)
  if (existing) return existing.id
  return (await must(db.auth.admin.createUser({ email, password, email_confirm: true }), 'create ' + email)).user.id
}

const owner = await user('owner@cedar.test', 'CedarLocalOwner-2026')
const merchant = await user('merchant@cedar.test', 'CedarLocalMerchant-2026')

const ws = await must(db.from('workspaces').upsert({ name: 'Cedar Local', slug: 'cedar-local', usd_to_lbp: 89500 }, { onConflict: 'slug' }).select().single(), 'workspace')
await must(db.from('workspace_members').upsert({ workspace_id: ws.id, user_id: owner, role: 'owner', display_name: 'Local Owner', joined_at: new Date().toISOString() }, { onConflict: 'workspace_id,user_id' }).select(), 'owner member')

const shop = (await must(db.from('shops').select().eq('user_id', merchant).maybeSingle(), 'find shop'))
  || await must(db.from('shops').insert({ workspace_id: ws.id, user_id: merchant, name: 'Local Test Shop', phone: '+961 76 111 222', prefix: 'LS' }).select().single(), 'shop')

async function driver(name, phone, pin) {
  const found = await must(db.from('drivers').select().eq('workspace_id', ws.id).eq('name', name).maybeSingle(), 'find driver')
  const row = found || await must(db.from('drivers').insert({ workspace_id: ws.id, name, phone }).select().single(), 'driver')
  if (pin) await must(db.rpc('set_driver_pin', { p_driver: row.id, p_pin: pin }), 'pin')
  return row
}
const rami = await driver('Rami Courier', '+961 71 123 456', '482913')
await driver('Second Courier', '+961 70 222 333', null)

const area = (await must(db.from('delivery_areas').select().eq('workspace_id', ws.id).eq('name', 'Beirut Central').maybeSingle(), 'find area'))
  || await must(db.from('delivery_areas').insert({ workspace_id: ws.id, name: 'Beirut Central', fee_usd: 3, default_driver_id: rami.id, assigned_driver_ids: [rami.id] }).select().single(), 'area')

async function order(code, fields) {
  const found = await must(db.from('orders').select('id,status').eq('code', code).maybeSingle(), 'find order')
  if (found) return found
  return must(db.from('orders').insert({
    workspace_id: ws.id, shop_id: shop.id, area_id: area.id, code, usd_to_lbp_rate: 89500,
    delivery_fee_usd: 3, driver_pay_usd: 2, recipient_name: 'Test Customer', recipient_phone: '+961 3 555 666',
    recipient_address: 'Hamra Street 12, Beirut', ...fields,
  }).select('id,status').single(), 'order ' + code)
}
await order('LS-ASSIGN1', { driver_id: rami.id, status: 'assigned', collection_usd: 40 })
await order('LS-PENDING', { status: 'pending', collection_usd: 25 })
for (const code of ['LS-DONE01', 'LS-DONE02']) {
  const o = await order(code, { driver_id: rami.id, status: 'assigned', collection_usd: 50 })
  if (o.status !== 'delivered') await must(db.from('orders').update({ status: 'picked_up' }).eq('id', o.id).select(), 'pick ' + code)
  if (o.status !== 'delivered') await must(db.from('orders').update({ status: 'delivered' }).eq('id', o.id).select(), 'deliver ' + code)
}

const { data: balance } = await db.from('shops').select('balance_usd').eq('id', shop.id).single()
console.log(JSON.stringify({ workspaceId: ws.id, shopBalanceUsd: balance.balance_usd, courierId: rami.id }))
