import { NextResponse } from 'next/server'
import { api, ApiError, checked } from '@/lib/api'
import { id, money, parseBody, z } from '@/lib/validation'
import { workspaceAccess, validateReferences } from '@/lib/access'

const ShopPricesBody = z.object({
  workspaceId: id,
  prices: z.array(
    z.object({
      areaId: id,
      /** null → delete the special price and fall back to the zone fee. */
      feeUsd: money().nullable(),
    }),
  ).min(1).max(200),
})

/** PUT /api/shops/[id]/prices — upsert or delete per-zone special prices for a shop. */
export const PUT = api(async (req, { params }) => {
  const shopId = (await params).id as string
  const body = await parseBody(req, ShopPricesBody)
  const { db, workspaceId } = await workspaceAccess(body.workspaceId, ['owner', 'manager'])

  // Verify the shop belongs to this workspace
  await validateReferences(db, workspaceId, { shops: shopId })

  // Verify every areaId belongs to this workspace in one query
  const areaIds = [...new Set(body.prices.map(p => p.areaId))]
  const { data: validAreas } = await db
    .from('delivery_areas')
    .select('id')
    .eq('workspace_id', workspaceId)
    .in('id', areaIds)
  const validSet = new Set((validAreas || []).map(a => a.id))
  const invalid = areaIds.find(id => !validSet.has(id))
  if (invalid) throw new ApiError(400, `Delivery area ${invalid} does not belong to this workspace`)

  const toUpsert = body.prices.filter(p => p.feeUsd !== null)
  const toDelete = body.prices.filter(p => p.feeUsd === null).map(p => p.areaId)

  if (toUpsert.length > 0) {
    const { error } = await db.from('shop_area_prices').upsert(
      toUpsert.map(p => ({
        workspace_id: workspaceId,
        shop_id: shopId,
        area_id: p.areaId,
        fee_usd: p.feeUsd as number,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'shop_id,area_id' },
    )
    if (error) throw new ApiError(500, error.message)
  }

  if (toDelete.length > 0) {
    const { error } = await db
      .from('shop_area_prices')
      .delete()
      .eq('shop_id', shopId)
      .eq('workspace_id', workspaceId)
      .in('area_id', toDelete)
    if (error) throw new ApiError(500, error.message)
  }

  // Return the current state after changes
  const prices = checked(
    await db
      .from('shop_area_prices')
      .select('area_id, fee_usd, updated_at')
      .eq('shop_id', shopId)
      .eq('workspace_id', workspaceId),
  )

  return NextResponse.json({ success: true, prices })
})

/** GET /api/shops/[id]/prices — list this shop's special prices. */
export const GET = api(async (req, { params }) => {
  const shopId = (await params).id as string
  const workspaceId = new URL(req.url).searchParams.get('workspaceId') || ''
  const { db } = await workspaceAccess(workspaceId, ['owner', 'manager', 'readonly'])
  await validateReferences(db, workspaceId, { shops: shopId })
  const prices = checked(
    await db
      .from('shop_area_prices')
      .select('area_id, fee_usd, updated_at')
      .eq('shop_id', shopId)
      .eq('workspace_id', workspaceId),
  )
  return NextResponse.json({ prices })
})
