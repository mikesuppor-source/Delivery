import { NextResponse } from 'next/server'
import { apiV1 } from '@/lib/api-v1'

/** GET /api/v1/zones: the delivery zones and what this shop pays for each (its own price when it has one). */
export const GET = apiV1(async ({ db, workspaceId, shop }) => {
  const [zones, special] = await Promise.all([
    db.from('delivery_areas').select('id, name, fee_usd').eq('workspace_id', workspaceId).eq('active', true).order('name'),
    db.from('shop_area_prices').select('area_id, fee_usd').eq('shop_id', shop.id),
  ])
  const own = new Map((special.data ?? []).map(row => [row.area_id, Number(row.fee_usd)]))
  return NextResponse.json({ zones: (zones.data ?? []).map(z => ({ id: z.id, name: z.name, deliveryFeeUsd: own.get(z.id) ?? Number(z.fee_usd) })) })
})
