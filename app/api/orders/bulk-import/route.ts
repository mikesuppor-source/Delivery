import { NextResponse } from 'next/server'
import { api, checked, money, textField } from '@/lib/api'
import { id, parseBody, z } from '@/lib/validation'
import { workspaceAccess, validateReferences } from '@/lib/access'
import { matchArea } from '@/lib/import-orders'
import { priceOrder } from '@/lib/pricing'
import { generateUniqueOrderCode, formatOrderCode } from '@/lib/order-codes'
const ImportBatch=z.object({workspaceId:id,shopId:id,orders:z.array(z.record(z.string(),z.any())).min(1).max(200)})
export const POST=api(async req=>{
 const body=await parseBody(req,ImportBatch)
 const {db,user,workspaceId}=await workspaceAccess(body.workspaceId)
 await validateReferences(db,workspaceId,{shops:body.shopId})
 const ws=checked(await db.from('workspaces').select('usd_to_lbp,default_delivery_fee_usd,default_driver_pay_usd').eq('id',workspaceId).single())
 // Fetch zone list and shop special prices once per request — no N+1
 const areas=checked(await db.from('delivery_areas').select('id,name,fee_usd,driver_pay_usd,return_fee_usd,return_driver_pay_usd,default_driver_id').eq('workspace_id',workspaceId).eq('active',true))
 const shopPrices=checked(await db.from('shop_area_prices').select('area_id,fee_usd').eq('shop_id',body.shopId))
 const shopPriceMap=new Map(shopPrices.map(p=>[p.area_id,Number(p.fee_usd)]))
 const wsDefaults={
  default_delivery_fee_usd:ws.default_delivery_fee_usd!=null?Number(ws.default_delivery_fee_usd):null,
  default_driver_pay_usd:ws.default_driver_pay_usd!=null?Number(ws.default_driver_pay_usd):null,
 }
 const rows=[]
 for(const item of body.orders){
  const area=matchArea(areas,[item.areaName,item.city])
  const shopFee=area?(shopPriceMap.get(area.id)??null):null
  const pricing=priceOrder(
   area?{
    fee_usd:Number(area.fee_usd),
    driver_pay_usd:area.driver_pay_usd!=null?Number(area.driver_pay_usd):null,
    return_fee_usd:Number(area.return_fee_usd),
    return_driver_pay_usd:Number(area.return_driver_pay_usd),
   }:null,
   shopFee,
   wsDefaults,
  )
  const rawType = String(item.serviceType || item.type || '').toLowerCase()
  const serviceType: 'delivery' | 'replacement' | 'pickup' = rawType.includes('replace') || rawType.includes('\u062a\u0628\u062f\u064a\u0644')
    ? 'replacement'
    : (rawType.includes('pickup') || rawType.includes('\u0645\u0631\u062a\u062c\u0639') || rawType.includes('\u0627\u0633\u062a\u0644\u0627\u0645') ? 'pickup' : 'delivery')
  const isBreakable = Boolean(item.isBreakable ?? item.breakable ?? (item.fragile === true || item.fragile === '1' || item.breakable === 0 || item.breakable === '0'))

  rows.push({workspace_id:workspaceId,shop_id:body.shopId,status:'pending' as const,
   code:item.code?formatOrderCode(textField(item.code,'code',60,true)):await generateUniqueOrderCode(db),
   area_id:area?.id||null,collection_usd:money(item.collectionUsd??item.amount,'collection'),
   delivery_fee_usd:pricing.feeUsd,driver_pay_usd:pricing.driverPayUsd,usd_to_lbp_rate:ws.usd_to_lbp,
   service_type:serviceType,
   weight_kg:Math.max(0.1, Number(item.weightKg || item.weight) || 1.0),
   is_breakable:isBreakable,
   carrier_tracking_code:textField(item.carrierTrackingCode || item.octopusCode || item.trackingCode, 'carrier tracking code', 100),
   destination_governorate:textField(item.governorate, 'governorate', 100),
   destination_caza:textField(item.caza, 'caza', 100),
   destination_town:textField(item.town, 'town', 100),
   recipient_name:textField(item.recipientName||item.name,'recipient',200,true),
   recipient_phone:textField(item.recipientPhone||item.phone,'phone',40,true),
   recipient_address:textField(item.recipientAddress||item.address,'address',1000,true),
   notes:textField(item.notes,'notes',4000),created_by:user.id})
 }
 const orders=checked(await db.from('orders').insert(rows).select('id,code,status,recipient_name,collection_usd'))
 return NextResponse.json({success:true,count:orders.length,orders,message:orders.length+' orders imported'})
})
