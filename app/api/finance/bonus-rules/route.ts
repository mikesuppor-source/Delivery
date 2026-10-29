import { NextResponse } from 'next/server'
import { api, ApiError, checked } from '@/lib/api'
import { id, parseBody, requiredText, z } from '@/lib/validation'
import { workspaceAccess } from '@/lib/access'

const Rule = {
  name: requiredText(100),
  minDeliveries: z.number().int().min(1).max(10000),
  bonusUsd: z.number().positive().max(99999),
}
const CreateRule = z.object({ workspaceId: id, ...Rule })
const ChangeRule = z.object({
  workspaceId: id,
  id,
  name: Rule.name.optional(),
  minDeliveries: Rule.minDeliveries.optional(),
  bonusUsd: Rule.bonusUsd.optional(),
  active: z.boolean().optional(),
})
const RemoveRule = z.object({ workspaceId: id, id })

/** Weekly bonus rules: "30 deliveries in a week earns $5". Only the highest rule reached is paid. */
export const POST = api(async req => {
  const body = await parseBody(req, CreateRule)
  const { db, workspaceId } = await workspaceAccess(body.workspaceId)
  const rule = checked(await db.from('driver_bonus_rules')
    .insert({ workspace_id: workspaceId, name: body.name, min_deliveries: body.minDeliveries, bonus_usd: body.bonusUsd })
    .select().single())
  return NextResponse.json({ success: true, rule })
})

export const PATCH = api(async req => {
  const body = await parseBody(req, ChangeRule)
  const { db, workspaceId } = await workspaceAccess(body.workspaceId)
  const updates: { name?: string; min_deliveries?: number; bonus_usd?: number; active?: boolean } = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.minDeliveries !== undefined) updates.min_deliveries = body.minDeliveries
  if (body.bonusUsd !== undefined) updates.bonus_usd = body.bonusUsd
  if (body.active !== undefined) updates.active = body.active
  if (!Object.keys(updates).length) throw new ApiError(400, 'Nothing to change')
  const rule = checked(await db.from('driver_bonus_rules').update(updates).eq('id', body.id).eq('workspace_id', workspaceId).select().maybeSingle())
  return NextResponse.json({ success: true, rule })
})

/** Bonuses already paid keep their record; they just lose the link to the removed rule. */
export const DELETE = api(async req => {
  const body = await parseBody(req, RemoveRule)
  const { db, workspaceId } = await workspaceAccess(body.workspaceId)
  checked(await db.from('driver_bonus_rules').delete().eq('id', body.id).eq('workspace_id', workspaceId).select('id').maybeSingle())
  return NextResponse.json({ success: true })
})
