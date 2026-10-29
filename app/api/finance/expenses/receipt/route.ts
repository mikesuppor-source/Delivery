import { NextResponse } from 'next/server'
import { api, ApiError, checked, uuid } from '@/lib/api'
import { id, parseBody, z } from '@/lib/validation'
import { workspaceAccess } from '@/lib/access'
import { writeAuditLog } from '@/lib/auth'
import { MAX_RECEIPT_BYTES, RECEIPT_BUCKET, receiptPath, sniffReceipt } from '@/lib/receipts'
import type { createServiceClient } from '@/lib/supabase/server'

const RemoveReceipt = z.object({ workspaceId: id, expenseId: id })

/** One of this company's own expenses, or a 404: nobody can reach another company's receipt by guessing an ID. */
async function ownExpense(db: ReturnType<typeof createServiceClient>, workspaceId: string, expenseId: string) {
  return checked(await db.from('expenses').select('id, receipt_path').eq('id', expenseId).eq('workspace_id', workspaceId).maybeSingle())
}

/**
 * POST /api/finance/expenses/receipt: a form upload (workspaceId, expenseId, file).
 * Attaches a photo or PDF to an expense, replacing the one it had.
 */
export const POST = api(async req => {
  const form = await req.formData().catch(() => { throw new ApiError(400, 'Send the receipt as a file upload') })
  const { db, user, workspaceId } = await workspaceAccess(form.get('workspaceId'))
  const expenseId = uuid(form.get('expenseId'), 'expense ID')
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) throw new ApiError(400, 'Choose a receipt file')
  if (file.size > MAX_RECEIPT_BYTES) throw new ApiError(413, 'The receipt must be under 2.5 MB. Use a smaller photo, or a PDF.')

  // The sender's file name and type prove nothing: look at the bytes
  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = sniffReceipt(bytes)
  if (!kind) throw new ApiError(400, 'The receipt must be a JPEG, PNG or WebP photo, or a PDF')

  const expense = await ownExpense(db, workspaceId, expenseId)
  const path = receiptPath(workspaceId, expenseId, kind.ext)
  const upload = await db.storage.from(RECEIPT_BUCKET).upload(path, bytes, { contentType: kind.mime, upsert: false })
  if (upload.error) {
    console.error('Receipt upload failed', upload.error.message)
    throw new ApiError(502, 'The receipt could not be saved. Please try again.')
  }
  const saved = await db.from('expenses').update({ receipt_path: path }).eq('id', expenseId).eq('workspace_id', workspaceId).select('id').maybeSingle()
  if (saved.error || !saved.data) {
    await db.storage.from(RECEIPT_BUCKET).remove([path]) // do not keep a file that nothing points to
    throw new ApiError(502, 'The receipt could not be saved. Please try again.')
  }
  if (expense.receipt_path) await db.storage.from(RECEIPT_BUCKET).remove([expense.receipt_path])
  await writeAuditLog({
    workspaceId, actorId: user.id, actorEmail: user.email ?? '', action: 'expense.receipt_added', entityType: 'expense', entityId: expenseId,
    diff: { type: kind.mime, bytes: file.size, replaced: Boolean(expense.receipt_path) },
  })
  return NextResponse.json({ success: true })
})

/**
 * GET /api/finance/expenses/receipt?workspaceId=&expenseId=
 * Opens the receipt through a storage link that stops working after a minute.
 */
export const GET = api(async req => {
  const params = new URL(req.url).searchParams
  const { db, workspaceId } = await workspaceAccess(params.get('workspaceId'))
  const expense = await ownExpense(db, workspaceId, uuid(params.get('expenseId'), 'expense ID'))
  if (!expense.receipt_path) throw new ApiError(404, 'This expense has no receipt')
  const signed = await db.storage.from(RECEIPT_BUCKET).createSignedUrl(expense.receipt_path, 60)
  if (signed.error || !signed.data) throw new ApiError(404, 'The receipt file could not be found')
  return NextResponse.redirect(signed.data.signedUrl)
})

/** DELETE /api/finance/expenses/receipt: takes the receipt off an expense and deletes the file. */
export const DELETE = api(async req => {
  const body = await parseBody(req, RemoveReceipt)
  const { db, user, workspaceId } = await workspaceAccess(body.workspaceId)
  const expense = await ownExpense(db, workspaceId, body.expenseId)
  if (!expense.receipt_path) return NextResponse.json({ success: true })
  checked(await db.from('expenses').update({ receipt_path: null }).eq('id', expense.id).eq('workspace_id', workspaceId).select('id').maybeSingle())
  await db.storage.from(RECEIPT_BUCKET).remove([expense.receipt_path])
  await writeAuditLog({ workspaceId, actorId: user.id, actorEmail: user.email ?? '', action: 'expense.receipt_removed', entityType: 'expense', entityId: expense.id, diff: {} })
  return NextResponse.json({ success: true })
})
