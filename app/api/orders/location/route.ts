import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { orderId, code, lat, lng, extraNotes } = await req.json()

    if (!orderId && !code) {
      return NextResponse.json({ error: 'orderId or code is required' }, { status: 400 })
    }

    if (!lat || !lng) {
      return NextResponse.json({ error: 'Latitude and Longitude are required' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    // 1. Fetch current order
    let query = serviceClient.from('orders').select('id, code, recipient_address, notes')
    if (orderId) {
      query = query.eq('id', orderId)
    } else {
      query = query.ilike('code', String(code).trim())
    }

    const { data: order, error: fetchErr } = await query.single()
    if (fetchErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // 2. Build updated address containing the exact Google Maps pin
    const pinUrl = `https://maps.google.com/?q=${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`
    let updatedAddress = pinUrl
    if (order.recipient_address && !order.recipient_address.includes('http') && !order.recipient_address.includes(pinUrl)) {
      updatedAddress = `${order.recipient_address.trim()} (${pinUrl})`
    }

    // Append extra notes if customer provided apartment / floor info
    let updatedNotes = order.notes
    if (extraNotes && extraNotes.trim()) {
      const noteEntry = `[Customer GPS Note: ${extraNotes.trim()}]`
      updatedNotes = order.notes ? `${order.notes} ${noteEntry}` : noteEntry
    }

    // 3. Update the order
    const { data: updatedOrder, error: updateErr } = await serviceClient
      .from('orders')
      .update({
        recipient_address: updatedAddress,
        notes: updatedNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)
      .select('id, code, recipient_address, notes')
      .single()

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      address: updatedOrder.recipient_address,
      message: 'Your live GPS pin was successfully shared with your courier!',
    })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error updating location' },
      { status: 500 }
    )
  }
}
