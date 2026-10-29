import { randomUUID } from 'node:crypto'
import { test, expect, type Page } from 'playwright/test'
import { apiCall, seeded, signInMerchant, signInOwner } from './helpers'

const RECEIPT_BUCKET = 'expense-receipts'
const today = () => new Date().toISOString().slice(0, 10)
// A real 1x1 PNG, and the start of a PDF: only the first bytes matter to the upload check
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')

/** Sends a receipt the way the Expenses screen does, from inside the signed-in page. */
function upload(page: Page, workspaceId: string, expenseId: string, name: string, type: string, bytes: Buffer) {
  return page.evaluate(
    async ({ workspaceId, expenseId, name, type, bytes }) => {
      const form = new FormData()
      form.set('workspaceId', workspaceId)
      form.set('expenseId', expenseId)
      form.set('file', new File([new Uint8Array(bytes)], name, { type }))
      const res = await fetch('/api/finance/expenses/receipt', { method: 'POST', body: form })
      return { status: res.status, body: await res.json().catch(() => ({})) }
    },
    { workspaceId, expenseId, name, type, bytes: [...bytes] },
  )
}

test.describe('Expense receipts', () => {
  test('a receipt is attached, opened, replaced and removed, and goes away with its expense', async ({ page }) => {
    test.slow()
    const { db, workspaceId } = await seeded()
    await signInOwner(page)
    const created = await apiCall(page, '/api/finance/expenses', 'POST', {
      workspaceId, date: today(), category: 'fuel', amountUsd: 7, amountLbp: 0, note: 'E2E receipt ' + randomUUID().slice(0, 8),
    })
    expect(created.status, JSON.stringify(created.body)).toBe(200)
    const expenseId: string = created.body.expense.id
    const pathOf = async () => (await db.from('expenses').select('receipt_path').eq('id', expenseId).single()).data?.receipt_path ?? null
    const stored = async (path: string) => {
      const { data, error } = await db.storage.from(RECEIPT_BUCKET).download(path)
      return error || !data ? null : Buffer.from(await data.arrayBuffer())
    }

    try {
      // Attach a photo: it is kept in the company's own folder, and the bytes are the ones that were sent
      const first = await upload(page, workspaceId, expenseId, 'slip.png', 'image/png', PNG)
      expect(first.status, JSON.stringify(first.body)).toBe(200)
      const photoPath = await pathOf()
      expect(photoPath).toMatch(new RegExp(`^${workspaceId}/${expenseId}/[0-9a-f-]{36}\\.png$`))
      expect((await stored(photoPath!))?.equals(PNG)).toBe(true)

      // An owner opens it through a short-lived link
      const opened = await page.request.get(`/api/finance/expenses/receipt?workspaceId=${workspaceId}&expenseId=${expenseId}`)
      expect(opened.status()).toBe(200)
      expect(opened.headers()['content-type']).toContain('image/png')
      expect((await opened.body()).equals(PNG)).toBe(true)

      // A second upload replaces the first and the old file is deleted
      const second = await upload(page, workspaceId, expenseId, 'invoice.pdf', 'application/pdf', PDF)
      expect(second.status, JSON.stringify(second.body)).toBe(200)
      const pdfPath = await pathOf()
      expect(pdfPath).toMatch(/\.pdf$/)
      expect(pdfPath).not.toBe(photoPath)
      expect(await stored(photoPath!)).toBeNull()
      expect((await stored(pdfPath!))?.equals(PDF)).toBe(true)

      // Removing takes it off the expense and deletes the file
      const removed = await apiCall(page, '/api/finance/expenses/receipt', 'DELETE', { workspaceId, expenseId })
      expect(removed.status).toBe(200)
      expect(await pathOf()).toBeNull()
      expect(await stored(pdfPath!)).toBeNull()
      expect((await page.request.get(`/api/finance/expenses/receipt?workspaceId=${workspaceId}&expenseId=${expenseId}`)).status()).toBe(404)

      // Deleting the expense deletes its receipt too
      expect((await upload(page, workspaceId, expenseId, 'again.png', 'image/png', PNG)).status).toBe(200)
      const lastPath = await pathOf()
      expect(await stored(lastPath!)).not.toBeNull()
      expect((await apiCall(page, '/api/finance/expenses', 'DELETE', { workspaceId, id: expenseId })).status).toBe(200)
      expect(await stored(lastPath!)).toBeNull()
    } finally {
      await db.from('expenses').delete().eq('id', expenseId)
    }
  })

  test('only photos and PDFs are accepted, whatever the file is called, and they must be small', async ({ page }) => {
    const { db, workspaceId } = await seeded()
    await signInOwner(page)
    const created = await apiCall(page, '/api/finance/expenses', 'POST', { workspaceId, date: today(), category: 'other', amountUsd: 2, amountLbp: 0, note: 'E2E bad receipts' })
    const expenseId: string = created.body.expense.id
    try {
      const html = await upload(page, workspaceId, expenseId, 'receipt.png', 'image/png', Buffer.from('<html><script>alert(1)</script></html>'))
      expect(html.status).toBe(400)
      const svg = await upload(page, workspaceId, expenseId, 'receipt.svg', 'image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'))
      expect(svg.status).toBe(400)
      const huge = await upload(page, workspaceId, expenseId, 'huge.png', 'image/png', Buffer.concat([PNG, Buffer.alloc(2_600_000)]))
      expect([400, 413]).toContain(huge.status)
      const stranger = await upload(page, workspaceId, randomUUID(), 'slip.png', 'image/png', PNG)
      expect(stranger.status).toBe(404) // an expense that is not this company's
      expect((await db.from('expenses').select('receipt_path').eq('id', expenseId).single()).data?.receipt_path).toBeNull()
    } finally {
      await db.from('expenses').delete().eq('id', expenseId)
    }
  })

  test('only the company\'s own staff can open or change a receipt', async ({ page, request }) => {
    const { db, workspaceId } = await seeded()
    const { data: expense } = await db.from('expenses').insert({
      workspace_id: workspaceId, date: today(), category: 'other', amount_usd: 1, usd_to_lbp: 89500, note: 'E2E private receipt',
    }).select('id').single()
    const expenseId = expense!.id
    const path = `${workspaceId}/${expenseId}/private.png`
    try {
      await db.storage.from(RECEIPT_BUCKET).upload(path, PNG, { contentType: 'image/png' })
      await db.from('expenses').update({ receipt_path: path }).eq('id', expenseId)
      const url = `/api/finance/expenses/receipt?workspaceId=${workspaceId}&expenseId=${expenseId}`

      // Not signed in
      expect((await request.get(url, { maxRedirects: 0 })).status()).toBe(401)

      // A merchant is signed in, but is not staff
      await signInMerchant(page)
      expect((await apiCall(page, url)).status).toBe(403)
      expect((await upload(page, workspaceId, expenseId, 'slip.png', 'image/png', PNG)).status).toBe(403)
      expect((await apiCall(page, '/api/finance/expenses/receipt', 'DELETE', { workspaceId, expenseId })).status).toBe(403)
      expect((await db.from('expenses').select('receipt_path').eq('id', expenseId).single()).data?.receipt_path).toBe(path)
    } finally {
      await db.storage.from(RECEIPT_BUCKET).remove([path])
      await db.from('expenses').delete().eq('id', expenseId)
    }
  })

  test('the Expenses screen attaches a receipt to a new expense and links to it', async ({ page }) => {
    test.slow()
    const { db, workspaceId } = await seeded()
    const note = 'E2E screen receipt ' + randomUUID().slice(0, 8)
    await signInOwner(page)
    await page.goto('/finance/expenses')
    await page.getByRole('button', { name: 'Add expense' }).first().click()
    await page.getByLabel('Amount in USD').fill('6.50')
    await page.getByPlaceholder('What was this for?').fill(note)
    await page.locator('input[type=file]').setInputFiles({ name: 'till-slip.png', mimeType: 'image/png', buffer: PNG })
    await page.getByRole('button', { name: 'Add expense' }).last().click()

    const row = page.locator('tr', { hasText: note })
    await expect(row.getByRole('link', { name: 'View' })).toBeVisible({ timeout: 30_000 })
    const opened = await page.request.get((await row.getByRole('link', { name: 'View' }).getAttribute('href'))!)
    expect(opened.status()).toBe(200)
    expect((await opened.body()).equals(PNG)).toBe(true)

    // Tidy up through the API so the receipt file goes too
    const { data } = await db.from('expenses').select('id').eq('workspace_id', workspaceId).eq('note', note).single()
    expect((await apiCall(page, '/api/finance/expenses', 'DELETE', { workspaceId, id: data!.id })).status).toBe(200)
  })
})
