import { createServiceClient } from './supabase/server'
import { getValidShopifyAccessToken } from './shopify-auth'
import { shopifyFetch, SHOPIFY_VERSION, siteUrl } from './shopify-security'

/**
 * Pushes fulfillment and Cedar tracking info back to Shopify when an order is delivered
 */
export async function fulfillShopifyOrder(db: ReturnType<typeof createServiceClient>, orderId: string) {
  try {
    const { data: order } = await db
      .from('orders')
      .select('id, code, tracking_token, shopify_order_id, shop_id')
      .eq('id', orderId)
      .maybeSingle()

    if (!order?.shopify_order_id || !order.shop_id) return { success: false, skipped: true }

    const { data: shop } = await db
      .from('shops')
      .select('id, shopify_domain')
      .eq('id', order.shop_id)
      .maybeSingle()

    if (!shop?.shopify_domain) return { success: false, skipped: true }

    const token = await getValidShopifyAccessToken({ id: shop.id, shopify_domain: shop.shopify_domain })
    const trackingUrl = `${siteUrl()}/track/${order.tracking_token || order.code}`

    // 1. Try modern fulfillment_orders endpoint (Shopify 2023+)
    const foRes = await shopifyFetch(
      shop.shopify_domain,
      `/admin/api/${SHOPIFY_VERSION}/orders/${order.shopify_order_id}/fulfillment_orders.json`,
      { headers: { 'X-Shopify-Access-Token': token } }
    )

    if (foRes.ok) {
      const foData = await foRes.json()
      const openFo = foData.fulfillment_orders?.find(
        (fo: { status: string; id: number }) => fo.status === 'open' || fo.status === 'in_progress'
      )
      if (openFo) {
        const createRes = await shopifyFetch(
          shop.shopify_domain,
          `/admin/api/${SHOPIFY_VERSION}/fulfillments.json`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
            body: JSON.stringify({
              fulfillment: {
                line_items_by_fulfillment_order: [{ fulfillment_order_id: openFo.id }],
                tracking_info: {
                  number: order.code,
                  url: trackingUrl,
                  company: 'Cedar Delivery Desk',
                },
                notify_customer: true,
              },
            }),
          }
        )
        if (createRes.ok) return { success: true }
      }
    }

    // 2. Fallback to direct legacy order fulfillment endpoint
    const directRes = await shopifyFetch(
      shop.shopify_domain,
      `/admin/api/${SHOPIFY_VERSION}/orders/${order.shopify_order_id}/fulfillments.json`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({
          fulfillment: {
            tracking_number: order.code,
            tracking_url: trackingUrl,
            tracking_company: 'Cedar Delivery Desk',
            notify_customer: true,
          },
        }),
      }
    )

    return { success: directRes.ok }
  } catch (err) {
    console.error('fulfillShopifyOrder notification error:', err)
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
