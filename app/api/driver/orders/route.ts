import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { OrderStatus } from '@/lib/roles'

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { orderId, driverId, status, notes } = body

    if (!orderId || !driverId) {
      return NextResponse.json({ error: 'orderId and driverId are required' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    // 1. Verify that order exists and is assigned to this driver
    const { data: order, error: orderFetchErr } = await serviceClient
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (orderFetchErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.driver_id !== driverId) {
      return NextResponse.json({ error: 'Forbidden: order is not assigned to this courier' }, { status: 403 })
    }

    // 2. Fetch driver record for financial tracking
    const { data: driver, error: driverFetchErr } = await serviceClient
      .from('drivers')
      .select('*')
      .eq('id', driverId)
      .single()

    if (driverFetchErr || !driver) {
      return NextResponse.json({ error: 'Driver record not found' }, { status: 404 })
    }

    // 3. Prepare updates
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (status) {
      updates.status = status as OrderStatus
      if (status === 'delivered') {
        updates.delivered_at = new Date().toISOString()
      } else if (status === 'picked_up') {
        // Clear delivered_at if re-opened
        updates.delivered_at = null
      }
    }

    if (notes !== undefined) {
      updates.notes = notes ? String(notes).trim() : null
    }

    // 4. Update the order
    const { data: updatedOrder, error: updateErr } = await serviceClient
      .from('orders')
      .update(updates)
      .eq('id', orderId)
      .select(`
        id, code, status, collection_usd, delivery_fee_usd, driver_pay_usd,
        shop_balance_usd, usd_to_lbp_rate, created_at, delivered_at,
        recipient_name, recipient_phone, recipient_address, notes,
        shop:shop_id(id, name, phone),
        area:area_id(id, name)
      `)
      .single()

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // 5. Handle financial accounting if transitioning to delivered or returned
    const wasDelivered = order.status === 'delivered'
    const isDelivered = status === 'delivered'

    if (!wasDelivered && isDelivered) {
      // Newly delivered: driver collects cash and earns driver pay
      await serviceClient
        .from('drivers')
        .update({
          cash_held_usd: Number(driver.cash_held_usd || 0) + Number(order.collection_usd || 0),
          pay_owed_usd: Number(driver.pay_owed_usd || 0) + Number(order.driver_pay_usd || 0),
        })
        .eq('id', driverId)

      // Add positive balance to shop
      if (order.shop_id) {
        const { data: shop } = await serviceClient
          .from('shops')
          .select('balance_usd')
          .eq('id', order.shop_id)
          .single()

        if (shop) {
          await serviceClient
            .from('shops')
            .update({
              balance_usd: Number(shop.balance_usd || 0) + Number(order.shop_balance_usd || 0),
            })
            .eq('id', order.shop_id)
        }
      }
    } else if (wasDelivered && !isDelivered) {
      // Reverted from delivered back to in-transit: roll back collected cash & driver pay
      await serviceClient
        .from('drivers')
        .update({
          cash_held_usd: Math.max(0, Number(driver.cash_held_usd || 0) - Number(order.collection_usd || 0)),
          pay_owed_usd: Math.max(0, Number(driver.pay_owed_usd || 0) - Number(order.driver_pay_usd || 0)),
        })
        .eq('id', driverId)

      if (order.shop_id) {
        const { data: shop } = await serviceClient
          .from('shops')
          .select('balance_usd')
          .eq('id', order.shop_id)
          .single()

        if (shop) {
          await serviceClient
            .from('shops')
            .update({
              balance_usd: Number(shop.balance_usd || 0) - Number(order.shop_balance_usd || 0),
            })
            .eq('id', order.shop_id)
        }
      }
    }

    // 6. Log audit event
    await serviceClient.from('audit_log').insert({
      workspace_id: order.workspace_id,
      actor_id: driver.user_id || null,
      actor_email: driver.phone || driver.name,
      action: `order.driver_status_change`,
      entity_type: 'order',
      entity_id: order.id,
      diff: {
        driver_name: driver.name,
        old_status: order.status,
        new_status: status,
      },
    })

    return NextResponse.json({
      success: true,
      order: updatedOrder,
    })
  } catch (err: unknown) {
    console.error('Driver order status update error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
