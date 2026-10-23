import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { OrderStatus } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    workspaceId,
    shopId,
    driverId,
    areaId,
    collectionUsd,
    deliveryFeeUsd,
    driverPayUsd,
    recipientName,
    recipientPhone,
    recipientAddress,
    notes,
  } = body

  // Check caller role
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!member || (member.role !== 'owner' && member.role !== 'manager')) {
    return NextResponse.json({ error: 'Forbidden: only owners and managers can create orders' }, { status: 403 })
  }

  // Get current workspace exchange rate
  const { data: ws } = await supabase
    .from('workspaces')
    .select('usd_to_lbp')
    .eq('id', workspaceId)
    .single()

  const usdToLbpRate = ws?.usd_to_lbp || 89500

  const serviceClient = createServiceClient()

  const { data: order, error } = await serviceClient
    .from('orders')
    .insert({
      workspace_id: workspaceId,
      shop_id: shopId || null,
      driver_id: driverId || null,
      area_id: areaId || null,
      status: driverId ? 'assigned' : 'pending',
      collection_usd: Number(collectionUsd) || 0,
      delivery_fee_usd: Number(deliveryFeeUsd) || 0,
      driver_pay_usd: Number(driverPayUsd) || 0,
      usd_to_lbp_rate: usdToLbpRate,
      recipient_name: recipientName || null,
      recipient_phone: recipientPhone || null,
      recipient_address: recipientAddress || null,
      notes: notes || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Log action
  await serviceClient.from('audit_log').insert({
    workspace_id: workspaceId,
    actor_id: user.id,
    actor_email: user.email,
    action: 'order.created',
    entity_type: 'order',
    entity_id: order.id,
    diff: { code: order.code, collection: order.collection_usd },
  })

  return NextResponse.json({ success: true, order })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { orderId, workspaceId, status, driverId } = body

  // Fetch membership
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const serviceClient = createServiceClient()

  // Get current order
  const { data: order } = await serviceClient
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  // Drivers can only update their own assigned orders
  if (member.role === 'driver') {
    const { data: driver } = await serviceClient
      .from('drivers')
      .select('id')
      .eq('user_id', user.id)
      .eq('workspace_id', workspaceId)
      .single()

    if (!driver || order.driver_id !== driver.id) {
      return NextResponse.json({ error: 'Forbidden: you can only update orders assigned to you' }, { status: 403 })
    }
  }

  const updates: Record<string, unknown> = {}
  if (status) {
    updates.status = status as OrderStatus
    if (status === 'delivered') {
      updates.delivered_at = new Date().toISOString()
    }
  }
  if (driverId !== undefined && (member.role === 'owner' || member.role === 'manager')) {
    updates.driver_id = driverId || null
    if (driverId && order.status === 'pending') {
      updates.status = 'assigned'
    }
  }

  const { data: updated, error } = await serviceClient
    .from('orders')
    .update(updates)
    .eq('id', orderId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If newly delivered, update driver cash_held and pay_owed
  if (status === 'delivered' && order.status !== 'delivered' && updated.driver_id) {
    const { data: drv } = await serviceClient
      .from('drivers')
      .select('cash_held_usd, pay_owed_usd')
      .eq('id', updated.driver_id)
      .single()

    if (drv) {
      await serviceClient
        .from('drivers')
        .update({
          cash_held_usd: Number(drv.cash_held_usd) + Number(updated.collection_usd),
          pay_owed_usd: Number(drv.pay_owed_usd) + Number(updated.driver_pay_usd),
        })
        .eq('id', updated.driver_id)
    }

    if (updated.shop_id) {
      const { data: shp } = await serviceClient
        .from('shops')
        .select('balance_usd')
        .eq('id', updated.shop_id)
        .single()

      if (shp) {
        await serviceClient
          .from('shops')
          .update({
            balance_usd: Number(shp.balance_usd) + Number(updated.shop_balance_usd),
          })
          .eq('id', updated.shop_id)
      }
    }
  }

  await serviceClient.from('audit_log').insert({
    workspace_id: workspaceId,
    actor_id: user.id,
    actor_email: user.email,
    action: 'order.updated',
    entity_type: 'order',
    entity_id: orderId,
    diff: updates,
  })

  return NextResponse.json({ success: true, order: updated })
}
