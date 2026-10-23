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
  const {
    orderId,
    workspaceId,
    status,
    driverId,
    recipientName,
    recipientPhone,
    recipientAddress,
    notes,
    collectionUsd,
    deliveryFeeUsd,
    driverPayUsd,
    areaId,
  } = body

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
    } else if (status === 'returned') {
      // Automatic $2.00 fee for retail refunds / returns, customer COD set to 0
      if (deliveryFeeUsd === undefined) {
        updates.delivery_fee_usd = 2.00
      }
      if (collectionUsd === undefined) {
        updates.collection_usd = 0.00
      }
      if (driverPayUsd === undefined) {
        updates.driver_pay_usd = Math.min(1.00, Number(order.driver_pay_usd) || 1.00)
      }
      const finalCol = updates.collection_usd !== undefined ? Number(updates.collection_usd) : 0
      const finalFee = updates.delivery_fee_usd !== undefined ? Number(updates.delivery_fee_usd) : 2.00
      updates.shop_balance_usd = finalCol - finalFee // e.g. 0 - 2 = -2.00
    }
  }

  // Manager / Owner editing fields
  if (member.role === 'owner' || member.role === 'manager') {
    if (driverId !== undefined) {
      updates.driver_id = driverId || null
      if (driverId && order.status === 'pending') {
        updates.status = 'assigned'
      }
    }
    if (recipientName !== undefined) updates.recipient_name = recipientName ? String(recipientName).trim() : null
    if (recipientPhone !== undefined) updates.recipient_phone = recipientPhone ? String(recipientPhone).trim() : null
    if (recipientAddress !== undefined) updates.recipient_address = recipientAddress ? String(recipientAddress).trim() : null
    if (notes !== undefined) updates.notes = notes ? String(notes).trim() : null
    if (areaId !== undefined) updates.area_id = areaId || null

    if (collectionUsd !== undefined) updates.collection_usd = Number(collectionUsd)
    if (deliveryFeeUsd !== undefined) updates.delivery_fee_usd = Number(deliveryFeeUsd)
    if (driverPayUsd !== undefined) updates.driver_pay_usd = Number(driverPayUsd)

    // Recalculate shop balance if financials were changed
    const finalCollection = updates.collection_usd !== undefined ? Number(updates.collection_usd) : Number(order.collection_usd)
    const finalFee = updates.delivery_fee_usd !== undefined ? Number(updates.delivery_fee_usd) : Number(order.delivery_fee_usd)
    if (updates.collection_usd !== undefined || updates.delivery_fee_usd !== undefined) {
      updates.shop_balance_usd = finalCollection - finalFee
    }
  }

  const { data: updated, error } = await serviceClient
    .from('orders')
    .update(updates)
    .eq('id', orderId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Financial accounting when status transitions to delivered or returned:
  const wasDelivered = order.status === 'delivered'
  const isDelivered = updated.status === 'delivered'
  const wasReturned = order.status === 'returned'
  const isReturned = updated.status === 'returned'

  // Case A: Newly delivered
  if (!wasDelivered && isDelivered) {
    if (updated.driver_id) {
      const { data: drv } = await serviceClient
        .from('drivers')
        .select('cash_held_usd, pay_owed_usd')
        .eq('id', updated.driver_id)
        .single()

      if (drv) {
        // If it was previously returned, reverse the return driver pay first
        const prevReturnPay = wasReturned ? Number(order.driver_pay_usd) || 0 : 0
        await serviceClient
          .from('drivers')
          .update({
            cash_held_usd: Math.max(0, Number(drv.cash_held_usd) + Number(updated.collection_usd)),
            pay_owed_usd: Math.max(0, Number(drv.pay_owed_usd) - prevReturnPay + Number(updated.driver_pay_usd)),
          })
          .eq('id', updated.driver_id)
      }
    }

    if (updated.shop_id) {
      const { data: shp } = await serviceClient
        .from('shops')
        .select('balance_usd')
        .eq('id', updated.shop_id)
        .single()

      if (shp) {
        // If it was previously returned, reverse the previous return fee charge first
        const prevReturnNet = wasReturned ? Number(order.shop_balance_usd) || 0 : 0
        await serviceClient
          .from('shops')
          .update({
            balance_usd: Number(shp.balance_usd) - prevReturnNet + Number(updated.shop_balance_usd),
          })
          .eq('id', updated.shop_id)
      }
    }
  }

  // Case B: Newly returned (retail refund: charged as a billable $2 fee to merchant, credited to driver)
  if (!wasReturned && isReturned) {
    if (updated.driver_id) {
      const { data: drv } = await serviceClient
        .from('drivers')
        .select('cash_held_usd, pay_owed_usd')
        .eq('id', updated.driver_id)
        .single()

      if (drv) {
        // If previously delivered, customer was refunded COD cash, so deduct order.collection_usd from driver cash held
        const prevCol = wasDelivered ? Number(order.collection_usd) || 0 : 0
        const prevDriverPay = wasDelivered ? Number(order.driver_pay_usd) || 0 : 0
        await serviceClient
          .from('drivers')
          .update({
            cash_held_usd: Math.max(0, Number(drv.cash_held_usd) - prevCol),
            pay_owed_usd: Math.max(0, Number(drv.pay_owed_usd) - prevDriverPay + Number(updated.driver_pay_usd)),
          })
          .eq('id', updated.driver_id)
      }
    }

    if (updated.shop_id) {
      const { data: shp } = await serviceClient
        .from('shops')
        .select('balance_usd')
        .eq('id', updated.shop_id)
        .single()

      if (shp) {
        // If previously delivered, reverse previous COD credit, and apply -$2.00 return fee charge
        const prevShopNet = wasDelivered ? Number(order.shop_balance_usd) || 0 : 0
        await serviceClient
          .from('shops')
          .update({
            balance_usd: Number(shp.balance_usd) - prevShopNet + Number(updated.shop_balance_usd),
          })
          .eq('id', updated.shop_id)
      }
    }
  }

  // Case B: Already delivered, and driver assignment was modified
  if (wasDelivered && isDelivered && order.driver_id !== updated.driver_id) {
    // Deduct from previous driver if there was one
    if (order.driver_id) {
      const { data: oldDrv } = await serviceClient
        .from('drivers')
        .select('cash_held_usd, pay_owed_usd')
        .eq('id', order.driver_id)
        .single()

      if (oldDrv) {
        await serviceClient
          .from('drivers')
          .update({
            cash_held_usd: Math.max(0, Number(oldDrv.cash_held_usd) - Number(order.collection_usd)),
            pay_owed_usd: Math.max(0, Number(oldDrv.pay_owed_usd) - Number(order.driver_pay_usd)),
          })
          .eq('id', order.driver_id)
      }
    }

    // Add to new driver if one is assigned
    if (updated.driver_id) {
      const { data: newDrv } = await serviceClient
        .from('drivers')
        .select('cash_held_usd, pay_owed_usd')
        .eq('id', updated.driver_id)
        .single()

      if (newDrv) {
        await serviceClient
          .from('drivers')
          .update({
            cash_held_usd: Math.max(0, Number(newDrv.cash_held_usd) + Number(updated.collection_usd)),
            pay_owed_usd: Math.max(0, Number(newDrv.pay_owed_usd) + Number(updated.driver_pay_usd)),
          })
          .eq('id', updated.driver_id)
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
