import { ApiError, checked, money, textField } from './api'
import { createServiceClient } from './supabase/server'
import { generateUniqueOrderCode } from './order-codes'
import { formatLebanesePhone } from './phone'
import { loadPricing } from './pricing-server'
export function matchArea(areas: {id:string;name:string;fee_usd:number;driver_pay_usd?:number|null;return_fee_usd?:number;return_driver_pay_usd?:number;default_driver_id?:string|null}[], terms: unknown[]) {
 const normalized=terms.filter((v):v is string=>typeof v==='string'&&!!v.trim()).map(v=>v.trim().toLowerCase())
 const matches=areas.filter(a=>normalized.includes(a.name.trim().toLowerCase()))
 return matches.length===1?matches[0]:undefined
}
export function collectibleUsd(payload: Record<string, any>, rate:number) {
 const currency=String(payload.currency||'').toUpperCase()
 if(!['USD','LBP'].includes(currency)) throw new ApiError(400,'Unsupported order currency: '+currency)
 const status=String(payload.financial_status||'').toLowerCase()
 if(payload.cancelled_at || ['paid','refunded','voided'].includes(status))return 0
 if(!['pending','authorized','partially_paid'].includes(status))throw new ApiError(400,'Unknown payment state; review order manually')
 if(status==='partially_paid' && payload.total_outstanding==null)throw new ApiError(400,'Partial payment requires an outstanding amount')
 const value=money(payload.total_outstanding??payload.total_price,'outstanding amount')
 return currency==='LBP'?Math.round(value/rate*100)/100:value
}
type Shop = { id: string; workspace_id: string; prefix?: string | null }

/** An order from any store, in Cedar's own shape. Each provider turns its payload into this; one function creates the order. */
export interface IncomingOrder {
  /** Columns that identify the order at its store, and the one used to spot a repeat (the store may send an order twice). */
  identity: { shopify_order_id?: string; shopify_order_number?: string; external_ref?: string }
  repeat: { column: 'shopify_order_id' | 'external_ref'; value: string }
  areaTerms: unknown[]
  /** Cash to collect in USD, worked out once the company exchange rate is known. */
  collectUsd: (rate: number) => number
  recipient: { name: string; phone: string; address: string }
  note: (areaMatched: boolean) => string
}

/** Creates the order for a shop, priced by the shop's own zone price. Returns {skipped:true} for an order Cedar already has. */
export async function createImportedOrder(shop: Shop, incoming: IncomingOrder) {
 const db=createServiceClient()
 const ws=checked(await db.from('workspaces').select('usd_to_lbp').eq('id',shop.workspace_id).single())
 const areas=checked(await db.from('delivery_areas').select('id,name,fee_usd,default_driver_id').eq('workspace_id',shop.workspace_id).eq('active',true))
 const area=matchArea(areas,incoming.areaTerms)
 let driverId=area?.default_driver_id||null
 if(driverId) {
  const {data:driver}=await db.from('drivers').select('id').eq('id',driverId).eq('workspace_id',shop.workspace_id).eq('active',true).maybeSingle()
  if(!driver)driverId=null
 }
 const collection=incoming.collectUsd(Number(ws.usd_to_lbp))
 const pricing=await loadPricing(db, {
  workspaceId: shop.workspace_id,
  areaId: area?.id || null,
  shopId: shop.id,
 })
 const code=await generateUniqueOrderCode(db,shop.prefix||'CD')
 const result=await db.from('orders').insert({
  workspace_id:shop.workspace_id,shop_id:shop.id,...incoming.identity,
  code,status:driverId?'assigned':'pending',driver_id:driverId,area_id:area?.id||null,collection_usd:collection,delivery_fee_usd:pricing.feeUsd,
  driver_pay_usd:pricing.driverPayUsd,usd_to_lbp_rate:ws.usd_to_lbp,
  recipient_name:incoming.recipient.name,recipient_phone:incoming.recipient.phone,recipient_address:incoming.recipient.address,
  notes:incoming.note(!!area).slice(0,4000)
  }).select('id,code,recipient_name,collection_usd').single()
 if(result.error?.code==='23505') {
  const {data:existing}=await db.from('orders').select('id,code').eq('shop_id',shop.id).eq(incoming.repeat.column,incoming.repeat.value).maybeSingle()
  if(existing)return {skipped:true as const,order:existing}
 }
 return {skipped:false as const,order:checked(result)}
}

export async function importShopifyOrder(shop: Shop, payload:Record<string,any>) {
 if(!payload.id)throw new ApiError(400,'Missing Shopify order ID')
 if(payload.test || payload.cancelled_at)return {skipped:true as const}
 const shipping=payload.shipping_address||payload.billing_address||{}
 return createImportedOrder(shop,{
  identity:{shopify_order_id:String(payload.id),shopify_order_number:String(payload.name||payload.order_number||payload.id)},
  repeat:{column:'shopify_order_id',value:String(payload.id)},
  areaTerms:[shipping.city,shipping.province],
  collectUsd:rate=>collectibleUsd(payload,rate),
  recipient:{
   name:textField(shipping.name||[shipping.first_name,shipping.last_name].filter(Boolean).join(' ')||'Shopify Customer','recipient',200),
   phone:formatLebanesePhone(String(shipping.phone||payload.customer?.phone||payload.phone||'')),
   address:[shipping.address1,shipping.address2,shipping.city,shipping.province,shipping.country].filter(Boolean).join(', ').slice(0,1000),
  },
  note:matched=>('Shopify '+String(payload.name||payload.id)+(matched?'':' | Area needs manual review')+' | '+String(payload.note||'')),
 })
}
