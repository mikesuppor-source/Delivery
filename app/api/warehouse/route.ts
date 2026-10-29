import { NextResponse } from 'next/server'
import { api, ApiError, checked } from '@/lib/api'
import { workspaceAccess } from '@/lib/access'

export const GET = api(async req => {
  const params = new URL(req.url).searchParams
  const workspaceId = params.get('workspaceId') || ''
  const hubId = params.get('hubId') || ''
  const tab = params.get('tab') || 'in_storage' // in_storage | ready | released
  const reason = params.get('reason') || ''
  const overdueOnly = params.get('overdue') === 'true'

  if (!workspaceId) {
    throw new ApiError(400, 'workspaceId query parameter is required')
  }

  const { db } = await workspaceAccess(workspaceId, ['owner', 'manager', 'driver', 'readonly'])

  let query = db
    .from('order_holds')
    .select(`
      id,
      workspace_id,
      order_id,
      hub_id,
      shelf_code,
      reason,
      note,
      deliver_after,
      held_at,
      held_by,
      released_at,
      released_by,
      release_note,
      hub:hub_id (
        id,
        name
      ),
      order:order_id (
        id,
        code,
        status,
        recipient_name,
        recipient_phone,
        recipient_address,
        collection_usd,
        delivery_fee_usd,
        storage_fee_usd,
        is_held,
        created_at,
        shop:shop_id (
          id,
          name
        ),
        area:area_id (
          id,
          name,
          storage_fee_per_day_usd,
          free_storage_days
        )
      )
    `)
    .eq('workspace_id', workspaceId)

  const todayStr = new Date().toISOString().slice(0, 10)

  if (tab === 'in_storage') {
    query = query.is('released_at', null)
  } else if (tab === 'ready') {
    query = query.is('released_at', null).lte('deliver_after', todayStr)
  } else if (tab === 'released') {
    query = query.not('released_at', 'is', null)
  }

  if (hubId) {
    query = query.eq('hub_id', hubId)
  }

  if (reason) {
    query = query.eq('reason', reason as any)
  }

  if (overdueOnly) {
    query = query.is('released_at', null).lt('deliver_after', todayStr)
  }

  query = query.order('held_at', { ascending: false })

  const rows = checked(await query)

  return NextResponse.json({ holds: rows })
})
