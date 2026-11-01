import { NextResponse } from 'next/server'
import { api, ApiError } from '@/lib/api'
import { callerOf, driverAccess, shopAccess, validateReferences, workspaceAccess } from '@/lib/access'
import { savePod } from '@/lib/pod'
import type { Database } from '@/lib/supabase/database.types'

type PickupUpdate = Database['public']['Tables']['pickups']['Update']

export const GET = api(async req => {
  const url = new URL(req.url)
  const workspaceId = url.searchParams.get('workspaceId')
  const shopId = url.searchParams.get('shopId')
  const driverId = url.searchParams.get('driverId')
  const status = url.searchParams.get('status')

  // Couriers see their own pickups, a shop sees its own, and owners and managers see their company's
  const access = driverId ? await driverAccess(driverId) : shopId ? await shopAccess(shopId) : workspaceId ? await workspaceAccess(workspaceId) : null
  if (!access) throw new ApiError(400, 'workspaceId, shopId or driverId is required')
  const { db } = access

  // Query pickups
  let query = db
    .from('pickups')
    .select(`
      *,
      shop:shop_id(id, name, phone, address),
      driver:driver_id(id, name, phone)
    `)
    .order('requested_at', { ascending: false })

  if (workspaceId) {
    query = query.eq('workspace_id', workspaceId)
  }
  if (shopId) {
    query = query.eq('shop_id', shopId)
  }
  if (driverId) {
    query = query.eq('driver_id', driverId)
  }
  if (status) {
    query = query.eq('status', status as any)
  }

  const { data: pickups, error } = await query
  if (error) throw new ApiError(500, error.message)

  return NextResponse.json({ success: true, pickups: pickups || [] })
})

export const POST = api(async req => {
  const body = await req.json()
  const { workspaceId, shopId, parcelCount = 1, note } = body

  if (!workspaceId) throw new ApiError(400, 'workspaceId is required')
  if (!shopId) throw new ApiError(400, 'shopId is required')
  if (Number(parcelCount) < 1) throw new ApiError(400, 'parcelCount must be at least 1')

  // The shop's own login, or an owner or manager of its company
  const { db, shop: owned } = await shopAccess(shopId)
  if (owned.workspace_id !== workspaceId) throw new ApiError(404, 'Shop not found in this workspace')

  // Verify shop belongs to workspace
  const { data: shop, error: shopErr } = await db
    .from('shops')
    .select('id, workspace_id')
    .eq('id', shopId)
    .eq('workspace_id', workspaceId)
    .single()

  if (shopErr || !shop) throw new ApiError(404, 'Shop not found in this workspace')

  const { data: pickup, error: insertErr } = await db
    .from('pickups')
    .insert({
      workspace_id: workspaceId,
      shop_id: shopId,
      parcel_count: Number(parcelCount),
      note: note || null,
      status: 'requested',
    })
    .select(`
      *,
      shop:shop_id(id, name, phone, address),
      driver:driver_id(id, name, phone)
    `)
    .single()

  if (insertErr) throw new ApiError(500, insertErr.message)

  return NextResponse.json({ success: true, pickup })
})

export const PATCH = api(async req => {
  const body = await req.json()
  const { pickupId, driverId, status, proofPhoto, orderIds, note } = body

  if (!pickupId) throw new ApiError(400, 'pickupId is required')

  const caller = await callerOf()
  const db = caller.db
  const { data: pickup, error: fetchErr } = await db
    .from('pickups')
    .select('*')
    .eq('id', pickupId)
    .single()

  if (fetchErr || !pickup) throw new ApiError(404, 'Pickup not found')

  // A courier may only collect a pickup that is theirs or that nobody has taken yet; everything else is for owners and managers
  let collectorId: string | null = null
  if (caller.driverId) {
    if (status !== 'collected' || (pickup.driver_id && pickup.driver_id !== caller.driverId)) throw new ApiError(403, 'You cannot change this pickup')
    const { data: me } = await db.from('drivers').select('workspace_id').eq('id', caller.driverId).maybeSingle()
    if (me?.workspace_id !== pickup.workspace_id) throw new ApiError(403, 'You cannot change this pickup')
    collectorId = caller.driverId
  } else {
    await workspaceAccess(pickup.workspace_id, ['owner', 'manager'], caller.user!)
    if (driverId) await validateReferences(db, pickup.workspace_id, { drivers: driverId })
  }

  // If marking collected
  if (status === 'collected') {
    let photoPath: string | null = null
    if (proofPhoto) {
      photoPath = await savePod(db, pickup.id, proofPhoto, 'pickup')
    }

    const { data: rpcRes, error: rpcErr } = await db.rpc('collect_pickup', {
      p_pickup_id: pickup.id,
      p_driver_id: collectorId || driverId || pickup.driver_id || undefined,
      p_proof_photo_path: photoPath || undefined,
      p_order_ids: orderIds && orderIds.length > 0 ? orderIds : undefined,
    })

    if (rpcErr) throw new ApiError(500, rpcErr.message)
    return NextResponse.json({ success: true, result: rpcRes })
  }

  // Manager updates (e.g. assigning courier or cancelling)
  const updates: PickupUpdate = {}
  if (driverId !== undefined) updates.driver_id = driverId || null
  if (status !== undefined) updates.status = status
  if (note !== undefined) updates.note = note

  const { data: updated, error: updateErr } = await db
    .from('pickups')
    .update(updates)
    .eq('id', pickupId)
    .select(`
      *,
      shop:shop_id(id, name, phone, address),
      driver:driver_id(id, name, phone)
    `)
    .single()

  if (updateErr) throw new ApiError(500, updateErr.message)

  return NextResponse.json({ success: true, pickup: updated })
})
