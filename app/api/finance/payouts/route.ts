import { NextResponse } from 'next/server'
import { api, ApiError, checked } from '@/lib/api'
import { id, parseBody, text, z } from '@/lib/validation'
import { workspaceAccess } from '@/lib/access'

const Payout = z.object({
  id,
  amountUsd: z.number().positive().max(99999999),
  note: text(200),
})
const PayoutRun = z.object({
  workspaceId: id,
  kind: z.enum(['shops', 'drivers']),
  // The screen makes one per click, so a retried request is recognised and pays nothing twice
  idempotencyKey: id,
  payouts: z.array(Payout).min(1).max(200),
})

/**
 * POST /api/finance/payouts
 * Pays several shops (what they are owed) or couriers (their pay) in one locked step.
 * The database function refuses to pay more than a balance, repeats a finished run's result for
 * the same key, and rolls everything back if any line is wrong.
 */
export const POST = api(async req => {
  const body = await parseBody(req, PayoutRun)
  const { db, user, workspaceId } = await workspaceAccess(body.workspaceId)
  const table = body.kind
  const key = table === 'shops' ? 'shop_id' : 'driver_id'

  const ids = [...new Set(body.payouts.map(p => p.id))]
  if (ids.length !== body.payouts.length) throw new ApiError(400, 'Each ' + (table === 'shops' ? 'shop' : 'courier') + ' can appear once')
  const { data: owned } = await db.from(table).select('id').eq('workspace_id', workspaceId).in('id', ids)
  if ((owned || []).length !== ids.length) throw new ApiError(400, 'Invalid ' + table + ' reference for this workspace')

  if (body.kind === 'shops') {
    const { payout_min_usd } = checked(await db.from('workspaces').select('payout_min_usd').eq('id', workspaceId).single())
    const minimum = Number(payout_min_usd)
    if (body.payouts.some(p => p.amountUsd < minimum)) throw new ApiError(400, 'Payouts start at $' + minimum.toFixed(2))
  }

  const payouts = body.payouts.map(p => ({ [key]: p.id, amount_usd: p.amountUsd, note: p.note || null }))
  const args = { p_workspace: workspaceId, p_payouts: payouts, p_key: body.idempotencyKey, p_user: user.id }
  const run = checked(await (table === 'shops' ? db.rpc('run_shop_payouts', args) : db.rpc('run_driver_payouts', args)))
  return NextResponse.json({ success: true, run })
})
