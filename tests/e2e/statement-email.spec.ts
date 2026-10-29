import { randomUUID } from 'node:crypto'
import { test, expect } from 'playwright/test'
import { apiCall, seeded, signInMerchant, signInOwner } from './helpers'

const today = () => new Date().toISOString().slice(0, 10)
const firstOfMonth = () => today().slice(0, 8) + '01'

// CI has no mail server, so these checks cover who may ask and what happens when email is not set up.
// Sending itself is tested against a pretend SMTP server in tests/email.test.ts.
test.describe('Emailing a statement', () => {
  test('only staff may send, the address comes from the shop, and an unconfigured server says so', async ({ page, browser, request }) => {
    const { db, shopId } = await seeded()
    const send = (who: typeof page | typeof request, body: unknown) =>
      'evaluate' in who
        ? apiCall(who, '/api/statements/shop/email', 'POST', body)
        : who.post('/api/statements/shop/email', { data: body as object }).then(async res => ({ status: res.status(), body: await res.json().catch(() => ({})) }))
    const body = { shopId, from: firstOfMonth(), to: today(), lang: 'en' }

    // Not signed in
    expect((await send(request, body)).status).toBe(401)

    await signInOwner(page)
    // A bad request is refused before anything else
    expect((await send(page, { ...body, lang: 'fr' })).status).toBe(400)
    expect((await send(page, { ...body, from: 'yesterday' })).status).toBe(400)
    expect((await send(page, { ...body, shopId: randomUUID() })).status).toBe(404)
    // The request has no recipient field to abuse: an extra one is ignored, never used
    const owner = await send(page, { ...body, to_address: 'someone@elsewhere.test', email: 'someone@elsewhere.test' })
    expect([400, 503]).toContain(owner.status) // 503 when the server has no mail settings, 400 when the shop has no address
    if (owner.status === 503) expect(JSON.stringify(owner.body)).toMatch(/not set up/)

    // The shop's own merchant may download a statement but not send mail in the company's name
    const merchantContext = await browser.newContext()
    const merchantPage = await merchantContext.newPage()
    await signInMerchant(merchantPage)
    expect((await send(merchantPage, body)).status).toBe(403)
    await merchantContext.close()

    // The shop address is saved through the shop's own update, and only a real address is accepted
    const { data: shop } = await db.from('shops').select('workspace_id, contact_email').eq('id', shopId).single()
    const update = (contactEmail: string) => apiCall(page, `/api/shops/${shopId}`, 'PATCH', { workspaceId: shop!.workspace_id, contactEmail })
    try {
      expect((await update('not an address')).status).toBe(400)
      const saved = await update('  Accounts@Example.test ')
      expect(saved.status, JSON.stringify(saved.body)).toBe(200)
      expect(saved.body.shop.contact_email).toBe('Accounts@Example.test')
      expect((await update('')).body.shop.contact_email).toBeNull()
    } finally {
      await db.from('shops').update({ contact_email: shop!.contact_email }).eq('id', shopId)
    }
  })
})
