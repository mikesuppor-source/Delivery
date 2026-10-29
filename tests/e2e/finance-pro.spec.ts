import { randomUUID } from 'node:crypto'
import { test, expect } from 'playwright/test'
import { apiCall, creditShop, seeded, signInMerchant, signInOwner } from './helpers'

const today = () => new Date().toISOString().slice(0, 10)
const firstOfMonth = () => today().slice(0, 8) + '01'
const cents = (n: number) => Math.round(n * 100) / 100

test.describe('Phase 6: Finance pro', () => {
  test('a payout run lowers the shop balance, repeats safely, and never pays more than is available', async ({ page }) => {
    const { db, workspaceId, shopId } = await seeded()
    await creditShop(70) // enough for the $25 and $20 payouts below, with some left over
    await signInOwner(page)

    const figures = async () => {
      const { data: shop } = await db.from('shops').select('balance_usd').eq('id', shopId).single()
      const { data: held } = await db.from('cashout_requests').select('amount_usd').eq('shop_id', shopId).in('status', ['pending', 'approved'])
      const balance = Number(shop?.balance_usd)
      return { balance, available: cents(balance - (held ?? []).reduce((sum, r) => sum + Number(r.amount_usd), 0)) }
    }
    const pay = (amountUsd: number, idempotencyKey: string) =>
      apiCall(page, '/api/finance/payouts', 'POST', { workspaceId, kind: 'shops', idempotencyKey, payouts: [{ id: shopId, amountUsd, note: '' }] })

    const before = await figures()
    expect(before.available).toBeGreaterThanOrEqual(70)

    const key = randomUUID()
    const first = await pay(25, key)
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect(first.body.run.replayed).toBe(false)
    expect((await figures()).balance).toBeCloseTo(before.balance - 25, 2)

    // The same request again pays nothing more; a different request under the same ID is refused
    const again = await pay(25, key)
    expect(again.status).toBe(200)
    expect(again.body.run.replayed).toBe(true)
    expect(again.body.run.run_id).toBe(first.body.run.run_id)
    expect((await figures()).balance).toBeCloseTo(before.balance - 25, 2)
    expect((await pay(21, key)).status).toBe(400)

    // Two identical requests at the same moment pay once: the second waits for the first and repeats its result
    const racing = randomUUID()
    const [one, two] = await Promise.all([pay(20, racing), pay(20, racing)])
    expect([one.status, two.status]).toEqual([200, 200])
    expect([one.body.run.replayed, two.body.run.replayed].sort()).toEqual([false, true])
    expect((await figures()).balance).toBeCloseTo(before.balance - 25 - 20, 2)

    // Over the available balance, under the minimum, and a shop that is not this company's
    const after = await figures()
    expect((await pay(cents(after.available + 0.01), randomUUID())).status).toBe(400)
    expect((await pay(5, randomUUID())).status).toBe(400)
    const stranger = await apiCall(page, '/api/finance/payouts', 'POST', {
      workspaceId, kind: 'shops', idempotencyKey: randomUUID(), payouts: [{ id: randomUUID(), amountUsd: 25, note: '' }],
    })
    expect(stranger.status).toBe(400)
  })

  test('the Shop Payouts screen records a payout for the selected shop', async ({ page }) => {
    const { db, shopId } = await seeded()
    await creditShop(40)
    await signInOwner(page)
    const balance = async () => Number((await db.from('shops').select('balance_usd').eq('id', shopId).single()).data?.balance_usd)
    const before = await balance()

    await page.goto('/finance/payouts')
    await expect(page.locator('h1')).toContainText('Shop Payouts')
    await expect(page.getByText('Payout days:')).toBeVisible()
    await page.getByLabel(`Select row ${shopId}`).check()
    await page.getByRole('button', { name: /Pay selected/ }).click()
    await page.getByRole('button', { name: 'Record payouts' }).click()
    await expect(page.getByText(/Paid 1 shop/)).toBeVisible()
    await expect.poll(balance).toBeLessThan(before)
  })

  test('a courier pay run pays what is owed and no more', async ({ page }) => {
    const { db, workspaceId, courierId } = await seeded()
    await creditShop(10) // the courier earns $2 for the delivery
    await signInOwner(page)
    const owed = async () => Number((await db.from('drivers').select('pay_owed_usd').eq('id', courierId).single()).data?.pay_owed_usd)
    const run = (amountUsd: number) =>
      apiCall(page, '/api/finance/payouts', 'POST', { workspaceId, kind: 'drivers', idempotencyKey: randomUUID(), payouts: [{ id: courierId, amountUsd, note: '' }] })

    const before = await owed()
    expect(before).toBeGreaterThanOrEqual(2)
    expect((await run(cents(before + 0.01))).status).toBe(400)
    const paid = await run(2)
    expect(paid.status, JSON.stringify(paid.body)).toBe(200)
    expect(await owed()).toBeCloseTo(before - 2, 2)

    await page.goto('/finance/courier-pay')
    await expect(page.locator('h1')).toContainText('Courier Pay')
    await expect(page.getByRole('tab', { name: /Pay run/ })).toBeVisible()
  })

  test('a shop statement lists the orders and ends at the shop balance, as JSON and PDF', async ({ page, browser, request }) => {
    const { db, shopId } = await seeded()
    await creditShop(15) // cash collected 18, delivery fee 3, so the shop is credited 15
    const url = (format: string) => `/api/statements/shop?shopId=${shopId}&from=${firstOfMonth()}&to=${today()}&format=${format}`

    // Not signed in
    expect((await request.get(url('json'))).status()).toBe(401)

    await signInOwner(page)
    const json = await apiCall(page, url('json'))
    expect(json.status, JSON.stringify(json.body)).toBe(200)
    const statement = json.body.statement
    const { data: shop } = await db.from('shops').select('balance_usd').eq('id', shopId).single()
    const listed = statement.lines.reduce((sum: number, line: { amount_usd: number }) => sum + Number(line.amount_usd), 0)
    expect(Number(statement.opening_usd) + listed).toBeCloseTo(Number(statement.closing_usd), 2)
    expect(Number(statement.closing_usd)).toBeCloseTo(Number(shop?.balance_usd), 2)
    expect(statement.lines.some((l: { kind: string; cod_usd: number; fee_usd: number; amount_usd: number }) => l.kind === 'order' && Number(l.cod_usd) === 18 && Number(l.fee_usd) === 3 && Number(l.amount_usd) === 15)).toBe(true)

    const pdf = await page.request.get(url('pdf'))
    expect(pdf.status()).toBe(200)
    expect(pdf.headers()['content-type']).toContain('application/pdf')
    expect(pdf.headers()['content-disposition']).toContain('attachment')
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-')

    // The shop's own merchant can download it too
    const merchantContext = await browser.newContext()
    const merchantPage = await merchantContext.newPage()
    await signInMerchant(merchantPage)
    expect((await merchantPage.request.get(url('json'))).status()).toBe(200)
    expect((await merchantPage.request.get(`/api/statements/shop?shopId=${randomUUID()}&from=${firstOfMonth()}&to=${today()}&format=json`)).status()).toBe(404)
    await merchantContext.close()

    // A start date after the end date is refused
    expect((await apiCall(page, `/api/statements/shop?shopId=${shopId}&from=${today()}&to=2020-01-01&format=json`)).status).toBe(400)
  })

  test('expenses feed the profit and loss report', async ({ page }) => {
    const { workspaceId } = await seeded()
    await signInOwner(page)
    const totals = async () =>
      (await apiCall(page, `/api/reports/pnl?workspaceId=${workspaceId}&from=${firstOfMonth()}&to=${today()}`)).body.report.totals
    const note = 'E2E fuel ' + Math.random().toString(36).slice(2, 7)
    const before = Number((await totals()).expenses_usd)

    const created = await apiCall(page, '/api/finance/expenses', 'POST', { workspaceId, date: today(), category: 'fuel', amountUsd: 12.5, amountLbp: 0, note })
    expect(created.status, JSON.stringify(created.body)).toBe(200)
    try {
      expect(Number((await totals()).expenses_usd)).toBeCloseTo(before + 12.5, 2)

      await page.goto('/finance/expenses')
      await expect(page.locator('h1')).toContainText('Expenses')
      await expect(page.getByText(note)).toBeVisible()

      await page.goto('/reports')
      await page.getByRole('button', { name: 'Profit & loss' }).click()
      await expect(page.locator('h1')).toContainText('Profit & Loss')
      await expect(page.getByText('Net profit').first()).toBeVisible()

      const bad = (body: object) => apiCall(page, '/api/finance/expenses', 'POST', { workspaceId, category: 'fuel', amountLbp: 0, note: '', ...body })
      expect((await bad({ date: '2062-01-01', amountUsd: 1 })).status).toBe(400) // a date in the far future
      expect((await bad({ date: today(), amountUsd: 0 })).status).toBe(400) // no amount
    } finally {
      await apiCall(page, '/api/finance/expenses', 'DELETE', { workspaceId, id: created.body.expense.id })
    }
    expect(Number((await totals()).expenses_usd)).toBeCloseTo(before, 2)
  })

  test('a percent courier is paid a share of the fee when an order is assigned', async ({ page }) => {
    const { db, workspaceId, shopId, areaId, otherCourierId } = await seeded()
    await signInOwner(page)
    const setPay = (body: object) => apiCall(page, `/api/drivers/${otherCourierId}`, 'PATCH', { workspaceId, ...body })
    let orderId: string | undefined
    try {
      expect((await setPay({ payMode: 'percent' })).status).toBe(400) // the percentage is missing
      expect((await setPay({ payMode: 'percent', payPercent: 25 })).status).toBe(200)
      const { data: order, error } = await db.from('orders').insert({
        workspace_id: workspaceId, shop_id: shopId, area_id: areaId, driver_id: otherCourierId, status: 'pending',
        code: 'LS-PCT' + Math.random().toString(36).slice(2, 7).toUpperCase(), usd_to_lbp_rate: 89500,
        collection_usd: 11, delivery_fee_usd: 8, driver_pay_usd: 3,
        recipient_name: 'E2E Customer', recipient_phone: '+961 3 555 666', recipient_address: 'Hamra Street 12',
      }).select('id, driver_pay_usd').single()
      expect(error?.message).toBeUndefined()
      orderId = order?.id
      expect(Number(order?.driver_pay_usd)).toBe(2) // 25% of $8, not the zone's rate
    } finally {
      await setPay({ payMode: 'fixed' })
      if (orderId) await db.from('orders').update({ status: 'cancelled' }).eq('id', orderId)
    }
  })

  test('weekly bonus rules can be added and removed, and a week that has not finished is refused', async ({ page }) => {
    const { workspaceId } = await seeded()
    await signInOwner(page)
    const name = 'E2E rule ' + Math.random().toString(36).slice(2, 6)
    const created = await apiCall(page, '/api/finance/bonus-rules', 'POST', { workspaceId, name, minDeliveries: 30, bonusUsd: 5 })
    expect(created.status, JSON.stringify(created.body)).toBe(200)
    try {
      await page.goto('/finance/courier-pay')
      await page.getByRole('tab', { name: /Bonuses/ }).click()
      await expect(page.getByText(name)).toBeVisible()

      const now = new Date()
      const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)))
      const thisWeek = await apiCall(page, '/api/finance/bonuses', 'POST', { workspaceId, weekStart: monday.toISOString().slice(0, 10) })
      expect(thisWeek.status).toBe(400)
      expect((await apiCall(page, '/api/finance/bonus-rules', 'POST', { workspaceId, name: 'bad', minDeliveries: 0, bonusUsd: 5 })).status).toBe(400)
    } finally {
      await apiCall(page, '/api/finance/bonus-rules', 'DELETE', { workspaceId, id: created.body.rule.id })
    }
  })

  test('merchants and strangers cannot reach finance data', async ({ page, request }) => {
    const { workspaceId, shopId } = await seeded()
    const calls = [
      () => ({ method: 'POST', path: '/api/finance/payouts', data: { workspaceId, kind: 'shops', idempotencyKey: randomUUID(), payouts: [{ id: shopId, amountUsd: 20, note: '' }] } }),
      () => ({ method: 'POST', path: '/api/finance/expenses', data: { workspaceId, date: today(), category: 'fuel', amountUsd: 1, amountLbp: 0, note: '' } }),
      () => ({ method: 'POST', path: '/api/finance/bonuses', data: { workspaceId, weekStart: '2026-01-05' } }),
      () => ({ method: 'GET', path: `/api/reports/pnl?workspaceId=${workspaceId}&from=${firstOfMonth()}&to=${today()}` }),
      () => ({ method: 'GET', path: `/api/reports/profit?workspaceId=${workspaceId}&from=${new Date(Date.now() - 86400000).toISOString()}&to=${new Date().toISOString()}` }),
    ]
    for (const make of calls) {
      const { method, path, data } = make() as { method: string; path: string; data?: object }
      const res = await request.fetch(path, { method, data })
      expect(res.status(), `${method} ${path} without signing in`).toBe(401)
    }

    await signInMerchant(page)
    for (const make of calls) {
      const { method, path, data } = make() as { method: string; path: string; data?: object }
      const res = await apiCall(page, path, method, data)
      expect(res.status, `${method} ${path} as a merchant`).toBe(403)
    }
    await page.goto('/finance/payouts')
    await expect(page).toHaveURL(/\/portal/)
  })

  test('the payout schedule saves, and every exchange rate change is logged with who made it', async ({ page }) => {
    const { db, workspaceId } = await seeded()
    await signInOwner(page)
    const { data: original } = await db.from('workspaces').select('usd_to_lbp, payout_days, payout_min_usd').eq('id', workspaceId).single()
    expect(original).toBeTruthy()
    try {
      const rate = Number(original?.usd_to_lbp) + 500
      const saved = await apiCall(page, '/api/settings', 'PATCH', { workspaceId, usdToLbp: rate, payoutDays: ['sunday', 'wednesday'], payoutMinUsd: 15 })
      expect(saved.status, JSON.stringify(saved.body)).toBe(200)
      expect([...saved.body.workspace.payout_days].sort()).toEqual(['sunday', 'wednesday'])
      expect(Number(saved.body.workspace.payout_min_usd)).toBe(15)

      const { data: latest } = await db.from('exchange_rates').select('rate, set_by').eq('workspace_id', workspaceId).order('set_at', { ascending: false }).limit(1)
      expect(Number(latest?.[0]?.rate)).toBe(rate)
      expect(latest?.[0]?.set_by).toBeTruthy()

      await page.goto('/settings')
      await expect(page.getByText('Exchange Rate History')).toBeVisible()

      expect((await apiCall(page, '/api/settings', 'PATCH', { workspaceId, payoutDays: ['funday'] })).status).toBe(400)
      expect((await apiCall(page, '/api/settings', 'PATCH', { workspaceId, logoUrl: 'http://example.com/logo.png' })).status).toBe(400) // https only
    } finally {
      await apiCall(page, '/api/settings', 'PATCH', {
        workspaceId, usdToLbp: Number(original?.usd_to_lbp), payoutDays: original?.payout_days ?? ['monday', 'thursday'], payoutMinUsd: Number(original?.payout_min_usd ?? 20),
      })
    }
  })
})
