/**
 * lib/pricing.ts
 * Pure pricing logic — no server imports, safe to use in the browser and in tests.
 * Implements the pricing waterfall from BUILD_PLAN.md §4.1.
 */

/** Prices stored on a delivery zone (delivery_areas). */
export interface ZonePrice {
  fee_usd: number
  /** null means "use the workspace default". */
  driver_pay_usd: number | null
  return_fee_usd: number
  return_driver_pay_usd: number
}

/** Workspace-level fallback prices. */
export interface PricingDefaults {
  default_delivery_fee_usd: number | null
  default_driver_pay_usd: number | null
}

/** The four money values saved on an order at creation time. */
export interface OrderPrice {
  /** Customer delivery fee (what the company charges). */
  feeUsd: number
  /** What the company pays the courier per order. */
  driverPayUsd: number
  /** Fee charged to the shop on a return (COD = 0). */
  returnFeeUsd: number
  /** What the company pays the courier for a return. */
  returnDriverPayUsd: number
}

/** Breakdown shown in the price card on the order form. */
export interface PriceBreakdown {
  /** Total cash the courier collects from the customer. */
  customerPays: number
  /** Item value the shop receives after fees. */
  shopReceives: number
  /** What the courier earns for this delivery. */
  courierEarns: number
  /** Company profit: fee − courier pay. */
  companyKeeps: number
}

/**
 * Round a number to the nearest cent (2 decimal places).
 * Use this for every money value before writing to the database.
 */
export const money = (n: number): number => Math.round(n * 100) / 100

/**
 * Resolve the four prices for a new order.
 *
 * Waterfall (§4.1):
 *   customer fee  = shopFee → zone fee_usd → default_delivery_fee_usd → 3
 *   courier pay   = zone driver_pay_usd → default_driver_pay_usd → 1
 *   return fee    = zone return_fee_usd (default 2)
 *   return courier = zone return_driver_pay_usd (default 1)
 *
 * @param zone       The delivery area's prices, or null when no zone is set.
 * @param shopFee    The shop's special fee for this zone, or null if none.
 * @param defaults   Workspace-level default prices.
 */
export function priceOrder(
  zone: ZonePrice | null,
  shopFee: number | null,
  defaults: PricingDefaults,
): OrderPrice {
  const feeUsd = money(
    shopFee !== null && shopFee !== undefined
      ? shopFee
      : zone !== null
        ? zone.fee_usd
        : (defaults.default_delivery_fee_usd ?? 3),
  )

  const driverPayUsd = money(
    zone !== null && zone.driver_pay_usd !== null
      ? zone.driver_pay_usd
      : (defaults.default_driver_pay_usd ?? 1),
  )

  const returnFeeUsd = money(zone !== null ? zone.return_fee_usd : 2)
  const returnDriverPayUsd = money(zone !== null ? zone.return_driver_pay_usd : 1)

  return { feeUsd, driverPayUsd, returnFeeUsd, returnDriverPayUsd }
}

/**
 * Compute the cash-on-delivery amount for an order.
 *
 * @param itemUsd  The shop's declared item value (what the shop earns).
 * @param feeUsd   The customer delivery fee.
 * @param mode     "added" → customer pays item + fee; "free" → customer pays item only.
 */
export function collectionFor(
  itemUsd: number,
  feeUsd: number,
  mode: 'added' | 'free',
): number {
  return money(mode === 'added' ? itemUsd + feeUsd : itemUsd)
}

/**
 * Build the four-line price card shown on the order form.
 *
 * @param collectionUsd  Total cash collected from the customer (COD).
 * @param feeUsd         Customer delivery fee (company revenue from this order).
 * @param driverPayUsd   What the courier earns for this order.
 */
export function breakdown(
  collectionUsd: number,
  feeUsd: number,
  driverPayUsd: number,
): PriceBreakdown {
  const customerPays = money(collectionUsd)
  const shopReceives = money(collectionUsd - feeUsd)
  const courierEarns = money(driverPayUsd)
  const companyKeeps = money(feeUsd - driverPayUsd)
  return { customerPays, shopReceives, courierEarns, companyKeeps }
}
