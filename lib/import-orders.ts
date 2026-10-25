import { ApiError, checked, money, textField } from './api'
import { createServiceClient } from './supabase/server'
import { generateUniqueOrderCode } from './order-codes'
import { formatLebanesePhone } from './phone'
export function matchArea(areas: {id:string;name:string;fee_usd:number;default_driver_id?:string|null}[], terms: unknown[]) {
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
export async function importShopifyOrder(shop: {id:string;workspace_id:string;prefix?:string|null}, payload:Record<string,any>) {
 if(!payload.id)throw new ApiError(400,'Missing Shopify order ID')
 if(payload.test || payload.cancelled_at)return {skipped:true}
 const db=createServiceClient()
 const ws=checked(await db.from('workspaces').select('usd_to_lbp').eq('id',shop.workspace_id).single())
 const areas=checked(await db.from('delivery_areas').select('id,name,fee_usd,default_driver_id').eq('workspace_id',shop.workspace_id).eq('active',true))
 const shipping=payload.shipping_address||payload.billing_address||{}
 const area=matchArea(areas,[shipping.city,shipping.province])
 let driverId=area?.default_driver_id||null
 if(driverId) {
  const {data:driver}=await db.from('drivers').select('id').eq('id',driverId).eq('workspace_id',shop.workspace_id).eq('active',true).maybeSingle()
  if(!driver)driverId=null
 }
 const collection=collectibleUsd(payload,Number(ws.usd_to_lbp))
 const fee=area?Number(area.fee_usd):3
 const code=await generateUniqueOrderCode(db,shop.prefix||'CD')
 const result=await db.from('orders').insert({
  workspace_id:shop.workspace_id,shop_id:shop.id,shopify_order_id:String(payload.id),shopify_order_number:String(payload.name||payload.order_number||payload.id),
  code,status:driverId?'assigned':'pending',driver_id:driverId,area_id:area?.id||null,collection_usd:collection,delivery_fee_usd:fee,
  driver_pay_usd:Math.max(1,fee-1),usd_to_lbp_rate:ws.usd_to_lbp,
  recipient_name:textField(shipping.name||[shipping.first_name,shipping.last_name].filter(Boolean).join(' ')||'Shopify Customer','recipient',200),
  recipient_phone:formatLebanesePhone(String(shipping.phone||payload.customer?.phone||payload.phone||'')),
  recipient_address:[shipping.address1,shipping.address2,shipping.city,shipping.province,shipping.country].filter(Boolean).join(', ').slice(0,1000),
  notes:('Shopify '+String(payload.name||payload.id)+(area?'':' | Area needs manual review')+' | '+String(payload.note||'')).slice(0,4000)
 }).select('id,code,tracking_token,recipient_name,collection_usd').single()
 if(result.error?.code==='23505') {
  const {data:existing}=await db.from('orders').select('id,code').eq('shop_id',shop.id).eq('shopify_order_id',String(payload.id)).maybeSingle()
  if(existing)return {skipped:true,order:existing}
 }
 return {skipped:false,order:checked(result)}
}
