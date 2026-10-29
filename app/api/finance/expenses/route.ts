import { NextResponse } from 'next/server'
import { api, ApiError, checked } from '@/lib/api'
import { id, money, parseBody, text, z } from '@/lib/validation'
import { workspaceAccess } from '@/lib/access'
import { writeAuditLog } from '@/lib/auth'
import { EXPENSE_CATEGORIES } from '@/lib/finance'
import { RECEIPT_BUCKET } from '@/lib/receipts'

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Expense = {
  date: Day,
  category: z.enum(EXPENSE_CATEGORIES),
  amountUsd: money(),
  amountLbp: money(),
  note: text(500),
}
const CreateExpense = z.object({ workspaceId: id, ...Expense })
const ChangeExpense = z.object({
  workspaceId: id,
  id,
  date: Day.optional(),
  category: Expense.category.optional(),
  amountUsd: z.number().min(0).max(99999999).optional(),
  amountLbp: z.number().min(0).max(99999999999).optional(),
  note: text(500).optional(),
})
const RemoveExpense = z.object({ workspaceId: id, id })

/** An expense is a real date in a sensible window: typos like 2062 are rejected. */
function checkDate(date: string) {
  const day = new Date(date + 'T00:00:00Z')
  const tomorrow = Date.now() + 86400000
  if (Number.isNaN(day.getTime()) || date !== day.toISOString().slice(0, 10) || day.getTime() > tomorrow || date < '2020-01-01') {
    throw new ApiError(400, 'Invalid date')
  }
}

/** Company expenses (fuel, salaries, rent...). The exchange rate is locked when the expense is booked. */
export const POST = api(async req => {
  const body = await parseBody(req, CreateExpense)
  const { db, user, workspaceId } = await workspaceAccess(body.workspaceId)
  checkDate(body.date)
  if (body.amountUsd === 0 && body.amountLbp === 0) throw new ApiError(400, 'Enter an amount')
  const { usd_to_lbp } = checked(await db.from('workspaces').select('usd_to_lbp').eq('id', workspaceId).single())
  const expense = checked(await db.from('expenses').insert({
    workspace_id: workspaceId, date: body.date, category: body.category,
    amount_usd: body.amountUsd, amount_lbp: body.amountLbp, usd_to_lbp: Number(usd_to_lbp),
    note: body.note || null, created_by: user.id,
  }).select().single())
  return NextResponse.json({ success: true, expense })
})

export const PATCH = api(async req => {
  const body = await parseBody(req, ChangeExpense)
  const { db, user, workspaceId } = await workspaceAccess(body.workspaceId)
  const updates: { date?: string; category?: string; amount_usd?: number; amount_lbp?: number; note?: string | null } = {}
  if (body.date !== undefined) { checkDate(body.date); updates.date = body.date }
  if (body.category !== undefined) updates.category = body.category
  if (body.amountUsd !== undefined) updates.amount_usd = Math.round(body.amountUsd * 100) / 100
  if (body.amountLbp !== undefined) updates.amount_lbp = Math.round(body.amountLbp * 100) / 100
  if (body.note !== undefined) updates.note = body.note || null
  if (!Object.keys(updates).length) throw new ApiError(400, 'Nothing to change')
  const expense = checked(await db.from('expenses').update(updates).eq('id', body.id).eq('workspace_id', workspaceId).select().maybeSingle())
  await writeAuditLog({ workspaceId, actorId: user.id, actorEmail: user.email ?? '', action: 'expense.updated', entityType: 'expense', entityId: expense.id, diff: updates })
  return NextResponse.json({ success: true, expense })
})

export const DELETE = api(async req => {
  const body = await parseBody(req, RemoveExpense)
  const { db, user, workspaceId } = await workspaceAccess(body.workspaceId)
  const expense = checked(await db.from('expenses').delete().eq('id', body.id).eq('workspace_id', workspaceId).select().maybeSingle())
  if (expense.receipt_path) await db.storage.from(RECEIPT_BUCKET).remove([expense.receipt_path])
  await writeAuditLog({
    workspaceId, actorId: user.id, actorEmail: user.email ?? '', action: 'expense.deleted', entityType: 'expense', entityId: expense.id,
    diff: { date: expense.date, category: expense.category, amount_usd: expense.amount_usd, amount_lbp: expense.amount_lbp, note: expense.note },
  })
  return NextResponse.json({ success: true })
})
