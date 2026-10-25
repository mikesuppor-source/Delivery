import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { formatLebanesePhone } from '@/lib/phone'

export async function POST(req: NextRequest) {
  try {
    let shopId: string | null = null

    try {
      const body = await req.json()
      shopId = body.shopId
    } catch {
      // fallback to query
    }

    if (!shopId) {
      const { searchParams } = new URL(req.url)
      shopId = searchParams.get('shopId')
    }

    if (!shopId) {
      return NextResponse.json({ error: 'shopId is required' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    const { data: shop, error: shopErr } = await serviceClient
      .from('shops')
      .select('id, name, workspace_id, prefix, api_key, shopify_domain, shopify_access_token')
      .eq('id', shopId)
      .single()

    if (shopErr || !shop) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
    }

    if (!shop.shopify_domain || !shop.shopify_access_token) {
      return NextResponse.json({
        error: 'Shop is not connected to Shopify (missing domain or access token). Reconnect the store via 1-click install.',
      }, { status: 400 })
    }

    // Fetch existing orders from Shopify via REST API
    const shopifyRes = await fetch(
      `https://${shop.shopify_domain}/admin/api/2024-01/orders.json?status=any&limit=50`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': shop.shopify_access_token,
        },
      }
    )

    if (!shopifyRes.ok) {
      const errText = await shopifyRes.text()
      return NextResponse.json({
        error: `Shopify API returned error (${shopifyRes.status}): ${errText.slice(0, 200)}`,
      }, { status: 400 })
    }

    const data = await shopifyRes.json()
    const shopifyOrders = Array.isArray(data.orders) ? data.orders : []

    // Fetch workspace exchange rate & delivery areas
    const { data: workspace } = await serviceClient
      .from('workspaces')
      .select('id, usd_to_lbp')
      .eq('id', shop.workspace_id)
      .single()

    const exchangeRate = Number(workspace?.usd_to_lbp) || 89500

    const { data: areas } = await serviceClient
      .from('delivery_areas')
      .select('id, name, fee_usd, default_driver_id')
      .eq('workspace_id', shop.workspace_id)
      .eq('active', true)

    let importedCount = 0
    const importedOrders: any[] = []

    for (const payload of shopifyOrders) {
      const shopifyOrderId = String(payload.id || '')
      const shopifyOrderNumber = String(payload.order_number || payload.name || '').replace(/^#/, '')

      if (!shopifyOrderId || shopifyOrderId === '0') continue

      // Check if already imported
      const { data: existing } = await serviceClient
        .from('orders')
        .select('id, code')
        .eq('shop_id', shop.id)
        .eq('shopify_order_id', shopifyOrderId)
        .maybeSingle()

      if (existing) continue

      // Recipient details
      const shipping = payload.shipping_address || payload.billing_address || {}
      const customer = payload.customer || {}

      const recipientName = (
        shipping.name ||
        `${shipping.first_name || customer.first_name || ''} ${shipping.last_name || customer.last_name || ''}`
      ).trim() || 'Shopify Customer'

      const rawPhone = shipping.phone || customer.phone || payload.phone || ''
      const recipientPhone = formatLebanesePhone(rawPhone) || rawPhone || 'No Phone'

      const addressParts = [
        shipping.address1,
        shipping.address2,
        shipping.city,
        shipping.province,
        shipping.country,
      ].filter(Boolean)

      const recipientAddress = addressParts.join(', ') || 'Address not specified in Shopify'

      // Match area
      const city = (shipping.city || '').toLowerCase().trim()
      const province = (shipping.province || '').toLowerCase().trim()

      const matchedArea = (areas || []).find(a => {
        const aName = a.name.toLowerCase()
        return city.includes(aName) || aName.includes(city) || province.includes(aName) || aName.includes(province)
      })

      const areaId = matchedArea?.id || null
      const deliveryFeeUsd = matchedArea ? Number(matchedArea.fee_usd) : 3.0
      const driverPayUsd = Math.max(1.0, deliveryFeeUsd - 1.0)
      const assignedDriverId = matchedArea?.default_driver_id || null

      // COD calculation
      const totalPrice = parseFloat(payload.total_price || '0')
      const financialStatus = (payload.financial_status || '').toLowerCase()
      const gatewayNames: string[] = Array.isArray(payload.payment_gateway_names)
        ? payload.payment_gateway_names.map((g: any) => String(g).toLowerCase())
        : []

      const isCod =
        financialStatus === 'pending' ||
        financialStatus === 'authorized' ||
        gatewayNames.some(g => g.includes('cash') || g.includes('cod') || g.includes('manual'))

      const collectionUsd = isCod ? totalPrice : 0

      // Line items
      const lineItems = Array.isArray(payload.line_items) ? payload.line_items : []
      const itemsSummary = lineItems
        .slice(0, 4)
        .map((item: any) => `${item.quantity}x ${item.title}${item.variant_title ? ` (${item.variant_title})` : ''}`)
        .join(', ')

      const notesParts = [
        `Shopify #${shopifyOrderNumber}`,
        itemsSummary,
        payload.note ? `Note: ${payload.note}` : null,
        !isCod ? 'PREPAID ORDER ($0 COD)' : null,
      ].filter(Boolean)

      const notes = notesParts.join(' | ')

      // Unique Barcode Code
      const shopPrefix = (shop.prefix || shop.name.slice(0, 3)).toUpperCase().replace(/[^A-Z0-9]/g, '')
      const cleanNum = shopifyOrderNumber.replace(/\D/g, '') || Math.floor(1000 + Math.random() * 9000).toString()
      let code = `CED-${shopPrefix}-${cleanNum}`

      const { data: codeCheck } = await serviceClient
        .from('orders')
        .select('id')
        .eq('code', code)
        .maybeSingle()

      if (codeCheck) {
        code = `CED-${shopPrefix}-${cleanNum}-${Math.floor(10 + Math.random() * 89)}`
      }

      const { data: newOrder } = await serviceClient
        .from('orders')
        .insert({
          workspace_id: shop.workspace_id,
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
          notes,
          shopify_order_id: shopifyOrderId,
          shopify_order_number: `#${shopifyOrderNumber}`,
        })
        .select('id, code, shopify_order_number, recipient_name, collection_usd')
        .single()

      if (newOrder) {
        importedCount++
        importedOrders.push(newOrder)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${importedCount} new order(s) from Shopify store ${shop.shopify_domain}!`,
      importedCount,
      totalShopifyOrders: shopifyOrders.length,
      orders: importedOrders,
    })
  } catch (err: unknown) {
    console.error('Shopify Sync Error:', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Error syncing Shopify orders',
    }, { status: 500 })
  }
}
