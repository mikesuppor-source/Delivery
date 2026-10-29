import { NextResponse } from 'next/server'
import { api, ApiError, checked } from '@/lib/api'
import { id, money, parseBody, requiredText, z } from '@/lib/validation'
import { workspaceAccess } from '@/lib/access'
import type { Database } from '@/lib/supabase/database.types'

type WorkspaceUpdate = Database['public']['Tables']['workspaces']['Update']

const Settings = z.object({
  workspaceId: id,
  name: requiredText(200).optional(),
  currency: z.enum(['USD', 'LBP']).optional(),
  usdToLbp: money().optional(),
  defaultDriverPayUsd: money().optional(),
  defaultDeliveryFeeUsd: money().optional(),
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
  const { db, workspaceId } = await workspaceAccess(body.workspaceId, ['owner', 'manager'])
  const updates: WorkspaceUpdate = {}

  if (body.name !== undefined) updates.name = body.name
  if (body.currency !== undefined) updates.currency = body.currency
  if (body.usdToLbp !== undefined) {
    updates.usd_to_lbp = body.usdToLbp
    if (!updates.usd_to_lbp) throw new ApiError(400, 'Rate must be positive')
  }
  if (body.defaultDriverPayUsd !== undefined) updates.default_driver_pay_usd = body.defaultDriverPayUsd
  if (body.defaultDeliveryFeeUsd !== undefined) updates.default_delivery_fee_usd = body.defaultDeliveryFeeUsd
  if (body.notifyOrderCreated !== undefined) updates.notify_order_created = body.notifyOrderCreated
  if (body.notifyOutForDelivery !== undefined) updates.notify_out_for_delivery = body.notifyOutForDelivery
  if (body.notifyDelivered !== undefined) updates.notify_delivered = body.notifyDelivered
  if (body.notifyFailedAttempt !== undefined) updates.notify_failed_attempt = body.notifyFailedAttempt
  if (body.notifyHeld !== undefined) updates.notify_held = body.notifyHeld
  if (body.whatsappCloudToken !== undefined) updates.whatsapp_cloud_token = body.whatsappCloudToken
  if (body.whatsappPhoneNumberId !== undefined) updates.whatsapp_phone_number_id = body.whatsappPhoneNumberId

  const workspace = checked(
    await db.from('workspaces').update(updates).eq('id', workspaceId).select().single()
  )
  return NextResponse.json({ success: true, workspace })
})
