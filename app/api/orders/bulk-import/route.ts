import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { formatLebanesePhone } from '@/lib/phone'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { workspaceId, shopId, orders } = body

    if (!workspaceId || !shopId) {
      return NextResponse.json({ error: 'workspaceId and shopId are required' }, { status: 400 })
    }

    if (!Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json({ error: 'orders array must contain at least 1 order' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    // 1. Verify shop & workspace
    const { data: shop, error: shopErr } = await serviceClient
      .from('shops')
      .select('id, name, prefix, workspace_id')
      .eq('id', shopId)
      .single()

    if (shopErr || !shop) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
    }

    const { data: workspace } = await serviceClient
      .from('workspaces')
      .select('id, usd_to_lbp')
      .eq('id', workspaceId)
      .single()

    const exchangeRate = Number(workspace?.usd_to_lbp) || 89500

    // 2. Fetch delivery areas for zone matching
    const { data: areas } = await serviceClient
      .from('delivery_areas')
      .select('id, name, fee_usd, default_driver_id')
      .eq('workspace_id', workspaceId)
      .eq('active', true)

    const shopPrefix = (shop.prefix || shop.name.slice(0, 3)).toUpperCase().replace(/[^A-Z0-9]/g, '')
    const baseTimestamp = Date.now().toString().slice(-4)

    // 3. Prepare rows for batch insert
    const insertRows = orders.map((o: any, idx: number) => {
      const recipientName = String(o.recipientName || o.name || 'Customer').trim()
      const rawPhone = String(o.recipientPhone || o.phone || '').trim()
      const recipientPhone = formatLebanesePhone(rawPhone) || rawPhone
      const recipientAddress = String(o.recipientAddress || o.address || 'Address pending').trim()

      // Area matching
      const targetAreaText = (String(o.areaName || o.city || '')).toLowerCase().trim()
      let matchedArea = (areas || []).find(a => {
        const aName = a.name.toLowerCase()
        return aName.includes(targetAreaText) || targetAreaText.includes(aName)
      })

      const areaId = matchedArea?.id || null
      const deliveryFeeUsd = matchedArea ? Number(matchedArea.fee_usd) : 3.0
      const driverPayUsd = Math.max(1.0, deliveryFeeUsd - 1.0)
      const assignedDriverId = matchedArea?.default_driver_id || null
      const collectionUsd = parseFloat(String(o.collectionUsd || o.amount || 0)) || 0

      // Unique Barcode Code
      const customCode = o.code ? String(o.code).replace(/^#/, '').trim() : null
      const code = customCode
        ? `CED-${shopPrefix}-${customCode}`
        : `CED-${shopPrefix}-${baseTimestamp}${Math.floor(100 + idx)}`

      const shopifyOrderNum = o.shopifyOrderNumber || (o.shopifyOrderId ? `#${o.shopifyOrderId}` : null)

      return {
        workspace_id: workspaceId,
        shop_id: shop.id,
        code,
        status: assignedDriverId ? 'assigned' : 'pending',
        driver_id: assignedDriverId,
        area_id: areaId,
        recipient_name: recipientName,
        recipient_phone: recipientPhone,
        recipient_address: recipientAddress,
        collection_usd: collectionUsd,
        delivery_fee_usd: deliveryFeeUsd,
        driver_pay_usd: driverPayUsd,
        shop_balance_usd: Math.max(0, collectionUsd - deliveryFeeUsd),
        usd_to_lbp_rate: exchangeRate,
        notes: o.notes ? String(o.notes).trim() : null,
        shopify_order_id: o.shopifyOrderId ? String(o.shopifyOrderId) : null,
        shopify_order_number: shopifyOrderNum,
      }
    })

    // 4. Batch insert into Supabase
    const { data: inserted, error: insertErr } = await serviceClient
      .from('orders')
      .insert(insertRows)
      .select('id, code, recipient_name, collection_usd, status, created_at')

    if (insertErr) {
      console.error('Batch insert error:', insertErr)
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      count: inserted?.length || 0,
      orders: inserted,
      message: `Successfully imported ${inserted?.length || 0} orders for ${shop.name}!`,
    })
  } catch (err: unknown) {
    console.error('Bulk import error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error importing orders' },
      { status: 500 }
    )
  }
}
