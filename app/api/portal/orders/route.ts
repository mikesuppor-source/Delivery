import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { generateUniqueOrderCode, formatOrderCode, isOrderCodeUnique } from '@/lib/order-codes'
import { isValidLebanesePhone, formatLebanesePhone } from '@/lib/phone'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceClient = createServiceClient()

  // Find shop connected to this merchant user
  const { data: shop } = await serviceClient
    .from('shops')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!shop) {
    return NextResponse.json({ error: 'No merchant shop profile found for this account.' }, { status: 404 })
  }

  // Get orders for this shop
  const { data: orders, error: ordersErr } = await serviceClient
    .from('orders')
    .select(`
      id, code, status, collection_usd, delivery_fee_usd, shop_balance_usd,
      usd_to_lbp_rate, created_at, delivered_at, notes,
      recipient_name, recipient_phone, recipient_address,
      area:area_id(id, name, fee_usd),
      driver:driver_id(id, name, phone)
    `)
    .eq('shop_id', shop.id)
    .order('created_at', { ascending: false })

  if (ordersErr) {
    return NextResponse.json({ error: ordersErr.message }, { status: 500 })
  }

  // Get available delivery areas for order placement
  const { data: areas } = await serviceClient
    .from('delivery_areas')
    .select('id, name, fee_usd')
    .eq('workspace_id', shop.workspace_id)
    .eq('active', true)
    .order('name')

  // Get workspace exchange rate
  const { data: ws } = await serviceClient
    .from('workspaces')
    .select('name, usd_to_lbp')
    .eq('id', shop.workspace_id)
    .single()

  return NextResponse.json({
    shop,
    orders: orders || [],
    areas: areas || [],
    rate: Number(ws?.usd_to_lbp) || 89500,
    workspaceName: ws?.name || 'Cedar Delivery',
  })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceClient = createServiceClient()

  // Find shop connected to this user
  const { data: shop } = await serviceClient
    .from('shops')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!shop) {
    return NextResponse.json({ error: 'No merchant shop associated with this login.' }, { status: 403 })
  }

  const body = await req.json()
  const {
    recipientName,
    recipientPhone,
    recipientAddress,
    areaId,
    collectionUsd,
    notes,
    code: requestedCode,
  } = body

  // Validation
  if (!recipientName || !recipientName.trim()) {
    return NextResponse.json({ error: 'Recipient personal name is required.' }, { status: 400 })
  }

  if (!recipientPhone || !recipientPhone.trim()) {
    return NextResponse.json({ error: 'Recipient contact phone number is required.' }, { status: 400 })
  }

  if (!isValidLebanesePhone(recipientPhone)) {
    return NextResponse.json({
      error: 'Please enter a valid Lebanese recipient phone number (e.g. 70 123456, 03 123456, +961 71 123456).',
    }, { status: 400 })
  }

  if (!recipientAddress || !recipientAddress.trim()) {
    return NextResponse.json({ error: 'Recipient delivery address is required.' }, { status: 400 })
  }

  if (!areaId) {
    return NextResponse.json({ error: 'Please select a delivery destination area.' }, { status: 400 })
  }

  // Fetch delivery area
  const { data: area } = await serviceClient
    .from('delivery_areas')
    .select('id, name, fee_usd')
    .eq('id', areaId)
    .single()

  const deliveryFee = area ? Number(area.fee_usd) : 3.00

  // Fetch workspace exchange rate
  const { data: ws } = await serviceClient
    .from('workspaces')
    .select('usd_to_lbp')
    .eq('id', shop.workspace_id)
    .single()

  const rate = Number(ws?.usd_to_lbp) || 89500

  // Generate guaranteed unique, non-repeating order tracking code
  let finalCode = ''
  if (typeof requestedCode === 'string' && requestedCode.trim()) {
    const candidate = formatOrderCode(requestedCode)
    const isUnique = await isOrderCodeUnique(serviceClient, candidate)
    if (!isUnique) {
      return NextResponse.json({ error: `Tracking code "${candidate}" is already taken and cannot be repeated.` }, { status: 400 })
    }
    finalCode = candidate
  } else {
    // Auto-generate unique code using shop prefix if available (e.g. ZARA-XXXXXX or CD-XXXXXX)
    finalCode = await generateUniqueOrderCode(serviceClient, shop.prefix || 'CD')
  }

  const codAmount = Math.max(0, Number(collectionUsd) || 0)
  const driverPay = 1.00 // Standard baseline courier pay
  const shopNetBalance = codAmount - deliveryFee

  const { data: order, error: insertErr } = await serviceClient
    .from('orders')
    .insert({
      workspace_id: shop.workspace_id,
      shop_id: shop.id,
      code: finalCode,
      status: 'pending',
      collection_usd: codAmount,
      delivery_fee_usd: deliveryFee,
      driver_pay_usd: driverPay,
      shop_balance_usd: shopNetBalance,
      usd_to_lbp_rate: rate,
      recipient_name: recipientName.trim(),
      recipient_phone: formatLebanesePhone(recipientPhone),
      recipient_address: recipientAddress.trim(),
      notes: notes ? notes.trim() : null,
      area_id: areaId,
      created_by: user.id,
    })
    .select(`
      id, code, status, collection_usd, delivery_fee_usd, shop_balance_usd,
      usd_to_lbp_rate, created_at, notes,
      recipient_name, recipient_phone, recipient_address,
      shop:shop_id(name, phone),
      area:area_id(id, name, fee_usd)
    `)
    .single()

  if (insertErr || !order) {
    return NextResponse.json({ error: insertErr?.message || 'Failed to place order' }, { status: 500 })
  }

  // Audit log
  await serviceClient.from('audit_log').insert({
    workspace_id: shop.workspace_id,
    actor_id: user.id,
    actor_email: user.email,
    action: 'orders.merchant_order_placed',
    entity_type: 'orders',
    entity_id: order.id,
    diff: { code: order.code, shop: shop.name, collection: codAmount, fee: deliveryFee },
  })

  return NextResponse.json({
    success: true,
    message: `Order #${order.code} placed successfully!`,
    order,
  })
}
