import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    workspaceId,
    type, // 'driver_cash_remittance' | 'shop_payment' | 'driver_pay'
    amountUsd,
    shopId,
    driverId,
    orderId,
    note,
  } = await req.json()

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!member || (member.role !== 'owner' && member.role !== 'manager')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Get current workspace exchange rate
  const { data: ws } = await supabase
    .from('workspaces')
    .select('usd_to_lbp')
    .eq('id', workspaceId)
    .single()

  const usdToLbp = ws?.usd_to_lbp || 89500
  const serviceClient = createServiceClient()
  const amount = Number(amountUsd) || 0

  // Insert settlement record
  const { data: settlement, error } = await serviceClient
    .from('settlements')
    .insert({
      workspace_id: workspaceId,
      type,
      amount_usd: amount,
      usd_to_lbp: usdToLbp,
      shop_id: shopId || null,
      driver_id: driverId || null,
      order_id: orderId || null,
      note: note || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Adjust balances based on settlement type
  if (type === 'driver_cash_remittance' && driverId) {
    const { data: drv } = await serviceClient
      .from('drivers')
      .select('cash_held_usd')
      .eq('id', driverId)
      .single()

    if (drv) {
      await serviceClient
        .from('drivers')
        .update({
          cash_held_usd: Math.max(0, Number(drv.cash_held_usd) - amount),
        })
        .eq('id', driverId)
    }
  } else if (type === 'driver_pay' && driverId) {
    const { data: drv } = await serviceClient
      .from('drivers')
      .select('pay_owed_usd')
      .eq('id', driverId)
      .single()

    if (drv) {
      await serviceClient
        .from('drivers')
        .update({
          pay_owed_usd: Math.max(0, Number(drv.pay_owed_usd) - amount),
        })
        .eq('id', driverId)
    }
  } else if (type === 'shop_payment' && shopId) {
    const { data: shp } = await serviceClient
      .from('shops')
      .select('balance_usd')
      .eq('id', shopId)
      .single()

    if (shp) {
      await serviceClient
        .from('shops')
        .update({
          balance_usd: Number(shp.balance_usd) - amount,
        })
        .eq('id', shopId)
    }
  }

  await serviceClient.from('audit_log').insert({
    workspace_id: workspaceId,
    actor_id: user.id,
    actor_email: user.email,
    action: `settlement.${type}`,
    entity_type: 'settlement',
    entity_id: settlement.id,
    diff: { amount, type, note },
  })

  return NextResponse.json({ success: true, settlement })
}
