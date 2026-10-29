/**
 * lib/pricing-server.ts
 * Server-side pricing loader. Reads zone prices, shop special prices and
 * workspace defaults from the database and calls the pure priceOrder function.
 *
 * Import only from server code (API routes, server actions). Never bundle into
 * the browser — it imports the service client.
 */

import { createServiceClient } from './supabase/server'
import { priceOrder, money } from './pricing'
import type { OrderPrice, ZonePrice, PricingDefaults } from './pricing'

// Re-export the shared types so callers only need one import.
export type { OrderPrice, ZonePrice, PricingDefaults }

type Db = ReturnType<typeof createServiceClient>

interface PricingContext {
  workspaceId: string
  /** null when no zone is selected (e.g. walk-in order with unknown destination). */
  areaId: string | null
  /** null for walk-in orders, desk quick orders without a shop, etc. */
  shopId: string | null
}

/**
 * Load all pricing inputs for a new order and resolve the four prices.
 *
 * Reads three things in parallel:
 *   1. The delivery zone's prices.
 *   2. The shop's special fee for this zone (shop_area_prices).
 *   3. The workspace default prices.
 *
 * Then calls priceOrder() which applies the waterfall from §4.1.
 */
export async function loadPricing(
  db: Db,
  { workspaceId, areaId, shopId }: PricingContext,
): Promise<OrderPrice> {
  const [zoneRow, shopPriceRow, wsRow] = await Promise.all([
    areaId
      ? db
          .from('delivery_areas')
          .select('fee_usd, driver_pay_usd, return_fee_usd, return_driver_pay_usd')
          .eq('id', areaId)
          .eq('workspace_id', workspaceId)
          .eq('active', true)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    areaId && shopId
      ? db
          .from('shop_area_prices')
          .select('fee_usd')
          .eq('shop_id', shopId)
          .eq('area_id', areaId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    db
      .from('workspaces')
      .select('default_delivery_fee_usd, default_driver_pay_usd')
      .eq('id', workspaceId)
      .single(),
  ])

  const zone: ZonePrice | null = zoneRow.data
    ? {
        fee_usd: Number(zoneRow.data.fee_usd),
        driver_pay_usd:
          zoneRow.data.driver_pay_usd !== null ? Number(zoneRow.data.driver_pay_usd) : null,
        return_fee_usd: Number(zoneRow.data.return_fee_usd),
        return_driver_pay_usd: Number(zoneRow.data.return_driver_pay_usd),
      }
    : null

  const shopFee: number | null =
    shopPriceRow.data !== null ? Number(shopPriceRow.data.fee_usd) : null

  const defaults: PricingDefaults = {
    default_delivery_fee_usd:
      wsRow.data?.default_delivery_fee_usd !== null && wsRow.data?.default_delivery_fee_usd !== undefined
        ? Number(wsRow.data.default_delivery_fee_usd)
        : null,
    default_driver_pay_usd:
      wsRow.data?.default_driver_pay_usd !== null && wsRow.data?.default_driver_pay_usd !== undefined
        ? Number(wsRow.data.default_driver_pay_usd)
        : null,
  }

  return priceOrder(zone, shopFee, defaults)
}

/**
 * Load the return prices for an existing order using its stored area_id.
 * Called when an order transitions to "returned".
 *
 * Falls back to the workspace defaults (and then hardcoded $2 / $1) exactly
 * like priceOrder does, so old behaviour is preserved for orders with no zone.
 */
export async function loadReturnPricing(
  db: Db,
  order: { workspace_id: string; area_id: string | null; shop_id: string | null },
): Promise<{ returnFeeUsd: number; returnDriverPayUsd: number }> {
  const pricing = await loadPricing(db, {
    workspaceId: order.workspace_id,
    areaId: order.area_id,
    shopId: order.shop_id,
  })
  return {
    returnFeeUsd: money(pricing.returnFeeUsd),
    returnDriverPayUsd: money(pricing.returnDriverPayUsd),
  }
}
