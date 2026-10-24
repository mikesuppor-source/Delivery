import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { OrderStatus } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { workspaceId, orderIds, action, driverId, status } = body

  if (!workspaceId || !Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json({ error: 'Missing workspaceId or orderIds' }, { status: 400 })
  }

  // Check caller role
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!member || (member.role !== 'owner' && member.role !== 'manager')) {
    return NextResponse.json({ error: 'Forbidden: only owners and managers can perform bulk operations' }, { status: 403 })
  }

  const serviceClient = createServiceClient()

  // Fetch current orders to process
  const { data: orders, error: fetchErr } = await serviceClient
    .from('orders')
    .select('*')
    .in('id', orderIds)
    .eq('workspace_id', workspaceId)

  if (fetchErr || !orders) {
    return NextResponse.json({ error: fetchErr?.message || 'Failed to fetch orders' }, { status: 500 })
  }

  // ─── Bulk Deletion ────────────────────────────────────────────────────────
  if (action === 'delete') {
    const validIds = orders.map(o => o.id)

    // Reverse financial balances for delivered/returned orders
    for (const ord of orders) {
      if (ord.shop_id && (ord.status === 'delivered' || ord.status === 'returned')) {
        const net = Number(ord.shop_balance_usd) || 0
        if (net !== 0) {
          const { data: shp } = await serviceClient
            .from('shops')
            .select('balance_usd')
            .eq('id', ord.shop_id)
            .single()
          if (shp) {
            await serviceClient
              .from('shops')
              .update({ balance_usd: Number(shp.balance_usd) - net })
              .eq('id', ord.shop_id)
          }
        }
      }

      if (ord.driver_id && ord.status === 'delivered') {
        const { data: drv } = await serviceClient
          .from('drivers')
          .select('cash_held_usd, pay_owed_usd')
          .eq('id', ord.driver_id)
          .single()
        if (drv) {
          await serviceClient
            .from('drivers')
            .update({
              cash_held_usd: Math.max(0, Number(drv.cash_held_usd) - (Number(ord.collection_usd) || 0)),
              pay_owed_usd: Math.max(0, Number(drv.pay_owed_usd) - (Number(ord.driver_pay_usd) || 0)),
            })
            .eq('id', ord.driver_id)
        }
      }
    }

    // Unlink settlements
    await serviceClient
      .from('settlements')
      .update({ order_id: null })
      .in('order_id', validIds)

    // Delete orders
    const { error: deleteErr } = await serviceClient
      .from('orders')
      .delete()
      .in('id', validIds)
      .eq('workspace_id', workspaceId)

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 })
    }

    await serviceClient.from('audit_log').insert({
      workspace_id: workspaceId,
      actor_id: user.id,
      actor_email: user.email,
      action: 'orders.bulk_deleted',
      entity_type: 'orders',
      diff: { count: validIds.length, codes: orders.map(o => o.code) },
    })

    return NextResponse.json({ success: true, count: validIds.length, deletedIds: validIds })
  }

  const updatedOrders = []

  for (const order of orders) {
    const updates: Record<string, unknown> = {}

    if (action === 'assign_driver') {
      if (!driverId) continue
      updates.driver_id = driverId
      if (order.status === 'pending') {
        updates.status = 'assigned'
      }
    } else if (action === 'update_status') {
      if (!status) continue
      updates.status = status as OrderStatus
      if (driverId) updates.driver_id = driverId

      if (status === 'delivered') {
        updates.delivered_at = new Date().toISOString()
      } else if (status === 'returned') {
        // Flat $2.00 fee, $0.00 collection, $1.00 driver pay
        updates.delivery_fee_usd = 2.00
        updates.collection_usd = 0.00
        updates.driver_pay_usd = Math.min(1.00, Number(order.driver_pay_usd) || 1.00)
        updates.shop_balance_usd = -2.00
      }
    }

    const { data: updated, error: updErr } = await serviceClient
      .from('orders')
      .update(updates)
      .eq('id', order.id)
      .select()
      .single()

    if (updErr || !updated) continue

    // Handle financial accounting if status changed
    const wasDelivered = order.status === 'delivered'
    const isDelivered = updated.status === 'delivered'
    const wasReturned = order.status === 'returned'
    const isReturned = updated.status === 'returned'

    // Newly delivered
    if (!wasDelivered && isDelivered && updated.driver_id) {
      const { data: drv } = await serviceClient
        .from('drivers')
        .select('cash_held_usd, pay_owed_usd')
        .eq('id', updated.driver_id)
        .single()

      if (drv) {
        const prevReturnPay = wasReturned ? Number(order.driver_pay_usd) || 0 : 0
        await serviceClient
          .from('drivers')
          .update({
            cash_held_usd: Math.max(0, Number(drv.cash_held_usd) + Number(updated.collection_usd)),
            pay_owed_usd: Math.max(0, Number(drv.pay_owed_usd) - prevReturnPay + Number(updated.driver_pay_usd)),
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

    // Newly returned
    if (!wasReturned && isReturned && updated.driver_id) {
      const { data: drv } = await serviceClient
        .from('drivers')
        .select('cash_held_usd, pay_owed_usd')
        .eq('id', updated.driver_id)
        .single()

      if (drv) {
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

      if (updated.shop_id) {
        const { data: shp } = await serviceClient
          .from('shops')
          .select('balance_usd')
          .eq('id', updated.shop_id)
          .single()

        if (shp) {
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

    updatedOrders.push(updated)
  }

  // Audit log entry
  await serviceClient.from('audit_log').insert({
    workspace_id: workspaceId,
    actor_id: user.id,
    actor_email: user.email,
    action: 'orders.bulk_updated',
    entity_type: 'orders',
    diff: { action, count: updatedOrders.length, orderIds },
  })

  return NextResponse.json({ success: true, count: updatedOrders.length, orders: updatedOrders })
}
