import { NextResponse } from 'next/server'
import { api, ApiError, checked } from '@/lib/api'
import { id, money, parseBody, requiredText, z } from '@/lib/validation'
import { workspaceAccess } from '@/lib/access'
import { WEEKDAYS } from '@/lib/finance'
import type { Database } from '@/lib/supabase/database.types'

type WorkspaceUpdate = Database['public']['Tables']['workspaces']['Update']

const Settings = z.object({
  workspaceId: id,
  name: requiredText(200).optional(),
  currency: z.enum(['USD', 'LBP']).optional(),
  usdToLbp: money().optional(),
  defaultDriverPayUsd: money().optional(),
  defaultDeliveryFeeUsd: money().optional(),
  // Finance (Phase 6): payout days, the smallest payout a run will make, and the logo on statements
  payoutDays: z.array(z.enum(WEEKDAYS)).max(7).optional(),
  payoutMinUsd: money().optional(),
  logoUrl: z.string().max(500).url().refine(url => url.startsWith('https://'), 'Invalid logoUrl').nullable().optional(),
  notifyOrderCreated: z.boolean().optional(),
  notifyOutForDelivery: z.boolean().optional(),
  notifyDelivered: z.boolean().optional(),
  notifyFailedAttempt: z.boolean().optional(),
  notifyHeld: z.boolean().optional(),
  whatsappCloudToken: z.string().max(500).optional().nullable(),
  whatsappPhoneNumberId: z.string().max(100).optional().nullable(),
})

export const PATCH = api(async req => {
  const body = await parseBody(req, Settings)
  const { db, user, workspaceId } = await workspaceAccess(body.workspaceId, ['owner', 'manager'])
  const updates: WorkspaceUpdate = {}

  if (body.name !== undefined) updates.name = body.name
  if (body.currency !== undefined) updates.currency = body.currency
  if (body.usdToLbp !== undefined) {
    if (!body.usdToLbp) throw new ApiError(400, 'Rate must be positive')
    // Goes through set_workspace_rate so the exchange-rate history records who changed it
    const { error } = await db.rpc('set_workspace_rate', { p_workspace: workspaceId, p_rate: body.usdToLbp, p_user: user.id })
    if (error) throw new ApiError(error.code === 'P0001' ? 400 : 500, error.code === 'P0001' ? error.message : 'Database operation failed')
  }
  if (body.defaultDriverPayUsd !== undefined) updates.default_driver_pay_usd = body.defaultDriverPayUsd
  if (body.defaultDeliveryFeeUsd !== undefined) updates.default_delivery_fee_usd = body.defaultDeliveryFeeUsd
  if (body.payoutDays !== undefined) updates.payout_days = [...new Set(body.payoutDays)]
  if (body.payoutMinUsd !== undefined) updates.payout_min_usd = body.payoutMinUsd
  if (body.logoUrl !== undefined) updates.logo_url = body.logoUrl
  if (body.notifyOrderCreated !== undefined) updates.notify_order_created = body.notifyOrderCreated
  if (body.notifyOutForDelivery !== undefined) updates.notify_out_for_delivery = body.notifyOutForDelivery
  if (body.notifyDelivered !== undefined) updates.notify_delivered = body.notifyDelivered
  if (body.notifyFailedAttempt !== undefined) updates.notify_failed_attempt = body.notifyFailedAttempt
  if (body.notifyHeld !== undefined) updates.notify_held = body.notifyHeld
  if (body.whatsappCloudToken !== undefined) updates.whatsapp_cloud_token = body.whatsappCloudToken
  if (body.whatsappPhoneNumberId !== undefined) updates.whatsapp_phone_number_id = body.whatsappPhoneNumberId

  const workspace = checked(
    await (Object.keys(updates).length
      ? db.from('workspaces').update(updates).eq('id', workspaceId).select().single()
      : db.from('workspaces').select().eq('id', workspaceId).single())
  )
  return NextResponse.json({ success: true, workspace })
})
