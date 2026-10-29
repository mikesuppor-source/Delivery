/**
 * tests/receipts.test.ts
 * Expense receipts come from a browser, so the type is judged by the file's own bytes, and the storage path
 * is always built on the server from the company and expense IDs.
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { MAX_RECEIPT_BYTES, receiptLink, receiptPath, sniffReceipt } from '../lib/receipts.js'

const bytes = (...values: number[]) => new Uint8Array(values)
const text = (value: string) => new TextEncoder().encode(value)
const WORKSPACE = '11111111-1111-4111-8111-111111111111'
const EXPENSE = '22222222-2222-4222-8222-222222222222'

describe('receipt files', () => {
  it('accepts photos and PDFs by their first bytes', () => {
    assert.deepEqual(sniffReceipt(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16)), { ext: 'jpg', mime: 'image/jpeg' })
    assert.deepEqual(sniffReceipt(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)), { ext: 'png', mime: 'image/png' })
    assert.deepEqual(sniffReceipt(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50)), { ext: 'webp', mime: 'image/webp' })
    assert.deepEqual(sniffReceipt(text('%PDF-1.7\n')), { ext: 'pdf', mime: 'application/pdf' })
  })

  it('refuses anything else, whatever the file is called', () => {
    assert.equal(sniffReceipt(text('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')), null)
    assert.equal(sniffReceipt(text('<!doctype html><script>alert(1)</script>')), null)
    assert.equal(sniffReceipt(text('MZ\u0090\u0000 a program')), null)
    assert.equal(sniffReceipt(text('RIFF....WAVE')), null) // RIFF, but not WebP
    assert.equal(sniffReceipt(bytes(0xff, 0xd8)), null) // too short to be a JPEG
    assert.equal(sniffReceipt(new Uint8Array()), null)
  })

  it('keeps every file in its own company and expense folder, under a name nobody can guess', () => {
    const first = receiptPath(WORKSPACE, EXPENSE, 'jpg')
    const second = receiptPath(WORKSPACE, EXPENSE, 'jpg')
    assert.match(first, new RegExp(`^${WORKSPACE}/${EXPENSE}/[0-9a-f-]{36}\\.jpg$`))
    assert.notEqual(first, second)
    assert.equal(receiptPath(WORKSPACE, EXPENSE, 'pdf', 'fixed'), `${WORKSPACE}/${EXPENSE}/fixed.pdf`)
  })

  it('fits inside the 3 MB request limit, and the link names both IDs', () => {
    assert.ok(MAX_RECEIPT_BYTES < 3_000_000)
    assert.equal(receiptLink(WORKSPACE, EXPENSE), `/api/finance/expenses/receipt?workspaceId=${WORKSPACE}&expenseId=${EXPENSE}`)
  })
})
