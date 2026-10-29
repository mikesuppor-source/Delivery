import { SupabaseClient } from '@supabase/supabase-js'
import { sendPushToDriver } from '@/lib/push'

export interface AreaDriverSummary {
  areaId: string
  areaName: string
  assignedCount: number
  driversInPool: number
}

/**
 * Finds the best driver from an area's designated courier pool using fair load balancing (least busy).
 */
export async function findBestDriverForArea(
  db: SupabaseClient<any, any, any>,
  workspaceId: string,
  areaId: string,
  activeLoadsMap?: Map<string, number>
): Promise<string | null> {
  // 1. Fetch area and its courier pool
  const { data: area, error: areaErr } = await db
    .from('delivery_areas')
    .select('id, name, default_driver_id, assigned_driver_ids')
    .eq('id', areaId)
    .eq('workspace_id', workspaceId)
    .eq('active', true)
    .maybeSingle()

  if (areaErr || !area) return null

  // Collect candidate driver IDs
  const poolIds: string[] = []
  if (Array.isArray(area.assigned_driver_ids) && area.assigned_driver_ids.length > 0) {
    for (const dId of area.assigned_driver_ids) {
      if (dId && !poolIds.includes(dId)) poolIds.push(dId)
    }
  }
  if (area.default_driver_id && !poolIds.includes(area.default_driver_id)) {
    poolIds.push(area.default_driver_id)
  }

  if (poolIds.length === 0) return null

  // 2. Filter only active drivers in this workspace
  const { data: activeDrivers, error: drvErr } = await db
    .from('drivers')
    .select('id, last_location_at')
    .in('id', poolIds)
    .eq('workspace_id', workspaceId)
    .eq('active', true)

  if (drvErr || !activeDrivers || activeDrivers.length === 0) return null

  const offlineCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const onlineCandidates = activeDrivers.filter(d => !d.last_location_at || d.last_location_at >= offlineCutoff)
  const candidateDrivers = onlineCandidates.length > 0 ? onlineCandidates : activeDrivers
  const validDriverIds = candidateDrivers.map(d => d.id)
  if (validDriverIds.length === 1) return validDriverIds[0]

  // 3. Count active orders ('assigned' or 'picked_up') for each candidate to balance the workload
  const loads = new Map<string, number>()

  if (activeLoadsMap) {
    for (const dId of validDriverIds) {
      loads.set(dId, activeLoadsMap.get(dId) ?? 0)
    }
  } else {
    const { data: activeOrders } = await db
      .from('orders')
      .select('driver_id')
      .eq('workspace_id', workspaceId)
      .in('driver_id', validDriverIds)
      .in('status', ['assigned', 'picked_up'])

    for (const dId of validDriverIds) loads.set(dId, 0)
    if (activeOrders) {
      for (const ord of activeOrders) {
        if (ord.driver_id && loads.has(ord.driver_id)) {
          loads.set(ord.driver_id, (loads.get(ord.driver_id) || 0) + 1)
        }
      }
    }
  }

  // Pick the driver with the minimum current load
  let bestDriverId = validDriverIds[0]
  let minLoad = Infinity

  for (const dId of validDriverIds) {
    const currentLoad = loads.get(dId) ?? 0
    if (currentLoad < minLoad) {
      minLoad = currentLoad
      bestDriverId = dId
    }
  }

  // Update caller's load map if provided
  if (activeLoadsMap) {
    activeLoadsMap.set(bestDriverId, (activeLoadsMap.get(bestDriverId) || 0) + 1)
  }

  return bestDriverId
}

/**
 * Batch auto-assigns pending orders across all areas based on courier pools.
 */
export async function batchAutoAssignOrders(
  db: SupabaseClient<any, any, any>,
  workspaceId: string
): Promise<{
  assignedCount: number
  assignedCodes: string[]
  areaSummaries: AreaDriverSummary[]
}> {
  // 1. Fetch active delivery areas with courier pools
  const { data: areas, error: areaErr } = await db
    .from('delivery_areas')
    .select('id, name, default_driver_id, assigned_driver_ids')
    .eq('workspace_id', workspaceId)
    .eq('active', true)

  if (areaErr || !areas || areas.length === 0) {
    return { assignedCount: 0, assignedCodes: [], areaSummaries: [] }
  }

  // 2. Fetch all active drivers with GPS telemetry
  const { data: activeDrivers } = await db
    .from('drivers')
    .select('id, last_location_at')
    .eq('workspace_id', workspaceId)
    .eq('active', true)

  const { data: wsData } = await db
    .from('workspaces')
    .select('max_driver_load')
    .eq('id', workspaceId)
    .maybeSingle()

  const maxDriverLoad = wsData?.max_driver_load ?? 50
  const offlineCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()

  // Build set of eligible drivers: active, not offline (> 30 min with stale GPS)
  const eligibleDrivers = (activeDrivers || []).filter(d => {
    if (d.last_location_at && d.last_location_at < offlineCutoff) {
      // Driver hasn't reported GPS in over 30 minutes
      return false
    }
    return true
  })

  // If all drivers have stale GPS (e.g. testing), fall back to active drivers so dispatch isn't permanently blocked
  const effectiveDrivers = eligibleDrivers.length > 0 ? eligibleDrivers : (activeDrivers || [])
  const activeDriverSet = new Set(effectiveDrivers.map(d => d.id))

  // Build area to driver pool map
  const areaPoolMap = new Map<string, string[]>()
  for (const a of areas) {
    const pool: string[] = []
    if (Array.isArray(a.assigned_driver_ids)) {
      for (const dId of a.assigned_driver_ids) {
        if (dId && activeDriverSet.has(dId) && !pool.includes(dId)) pool.push(dId)
      }
    }
    if (a.default_driver_id && activeDriverSet.has(a.default_driver_id) && !pool.includes(a.default_driver_id)) {
      pool.push(a.default_driver_id)
    }
    if (pool.length > 0) {
      areaPoolMap.set(a.id, pool)
    }
  }

  if (areaPoolMap.size === 0) {
    return { assignedCount: 0, assignedCodes: [], areaSummaries: [] }
  }

  // 3. Preload current active loads for all drivers in all pools
  const allPoolDriverIds = Array.from(new Set(Array.from(areaPoolMap.values()).flat()))
  const { data: existingActiveOrders } = await db
    .from('orders')
    .select('driver_id')
    .eq('workspace_id', workspaceId)
    .in('driver_id', allPoolDriverIds)
    .in('status', ['assigned', 'picked_up'])

  const driverLoads = new Map<string, number>()
  for (const dId of allPoolDriverIds) driverLoads.set(dId, 0)
  if (existingActiveOrders) {
    for (const ord of existingActiveOrders) {
      if (ord.driver_id && driverLoads.has(ord.driver_id)) {
        driverLoads.set(ord.driver_id, (driverLoads.get(ord.driver_id) || 0) + 1)
      }
    }
  }

  // 4. Fetch all pending unassigned orders
  const { data: unassignedOrders, error: ordErr } = await db
    .from('orders')
    .select('id, code, area_id')
    .eq('workspace_id', workspaceId)
    .is('driver_id', null)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (ordErr || !unassignedOrders || unassignedOrders.length === 0) {
    return { assignedCount: 0, assignedCodes: [], areaSummaries: [] }
  }

  let assignedCount = 0
  const assignedCodes: string[] = []
  const areaCounts = new Map<string, number>()
  const driverAssignedOrders = new Map<string, string[]>()

  for (const order of unassignedOrders) {
    if (!order.area_id || !areaPoolMap.has(order.area_id)) continue

    const candidatePool = areaPoolMap.get(order.area_id)!
    if (candidatePool.length === 0) continue

    // Find the driver with the lowest load in this area pool that is not over max load
    let chosenDriverId: string | null = null
    let minLoad = Infinity

    for (const dId of candidatePool) {
      const load = driverLoads.get(dId) ?? 0
      if (load < maxDriverLoad && load < minLoad) {
        minLoad = load
        chosenDriverId = dId
      }
    }

    if (!chosenDriverId) continue

    // Assign order to chosen driver
    const { data: updated, error: updErr } = await db
      .from('orders')
      .update({
        driver_id: chosenDriverId,
        status: 'assigned',
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)
      .eq('status', 'pending')
      .is('driver_id', null)
      .select('id')

    if (!updErr && updated?.length) {
      assignedCount++
      assignedCodes.push(order.code)
      // Increment chosen driver load so the next order balances to the next courier
      driverLoads.set(chosenDriverId, (driverLoads.get(chosenDriverId) || 0) + 1)
      areaCounts.set(order.area_id, (areaCounts.get(order.area_id) || 0) + 1)
      const list = driverAssignedOrders.get(chosenDriverId) || []
      list.push(order.code)
      driverAssignedOrders.set(chosenDriverId, list)
    }
  }

  // Dispatch background push notifications to all couriers assigned in this batch
  for (const [dId, codes] of driverAssignedOrders.entries()) {
    const count = codes.length
    sendPushToDriver(dId, {
      title: 'Cedar Delivery — New Orders Assigned',
      body: `${count} new order${count === 1 ? '' : 's'} assigned to your run sheet (${codes.slice(0, 3).join(', ')}${count > 3 ? '...' : ''})`,
      url: `/driver/${dId}`,
      tag: `batch-dispatch-${dId}`,
    }).catch(e => console.error('[Batch Push Error]:', e))
  }

  const areaSummaries: AreaDriverSummary[] = []
  for (const [areaId, count] of areaCounts.entries()) {
    const area = areas.find(a => a.id === areaId)
    const pool = areaPoolMap.get(areaId) || []
    areaSummaries.push({
      areaId,
      areaName: area?.name || 'Area',
      assignedCount: count,
      driversInPool: pool.length,
    })
  }

  return { assignedCount, assignedCodes, areaSummaries }
}
