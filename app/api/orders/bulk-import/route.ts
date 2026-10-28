import { NextResponse } from 'next/server'
import { api, checked, money, textField } from '@/lib/api'
import { id, parseBody, z } from '@/lib/validation'
import { workspaceAccess, validateReferences } from '@/lib/access'
import { matchArea } from '@/lib/import-orders'
import { generateUniqueOrderCode, formatOrderCode } from '@/lib/order-codes'
const ImportBatch=z.object({workspaceId:id,shopId:id,orders:z.array(z.record(z.string(),z.any())).min(1).max(200)})
export const POST=api(async req=>{
 const body=await parseBody(req,ImportBatch)
 const {db,user,workspaceId}=await workspaceAccess(body.workspaceId)
 await validateReferences(db,workspaceId,{shops:body.shopId})
 const ws=checked(await db.from('workspaces').select('usd_to_lbp').eq('id',workspaceId).single())
 const areas=checked(await db.from('delivery_areas').select('id,name,fee_usd,default_driver_id').eq('workspace_id',workspaceId).eq('active',true))
 const rows=[]
 for(const item of body.orders){
  const area=matchArea(areas,[item.areaName,item.city])
  const fee=area?Number(area.fee_usd):3
  const rawType = String(item.serviceType || item.type || '').toLowerCase()
  const serviceType: 'delivery' | 'replacement' | 'pickup' = rawType.includes('replace') || rawType.includes('تبديل')
    ? 'replacement'
    : (rawType.includes('pickup') || rawType.includes('مرتجع') || rawType.includes('استلام') ? 'pickup' : 'delivery')
  const isBreakable = Boolean(item.isBreakable ?? item.breakable ?? (item.fragile === true || item.fragile === '1' || item.breakable === 0 || item.breakable === '0'))

  rows.push({workspace_id:workspaceId,shop_id:body.shopId,status:'pending' as const,
   code:item.code?formatOrderCode(textField(item.code,'code',60,true)):await generateUniqueOrderCode(db),
   area_id:area?.id||null,collection_usd:money(item.collectionUsd??item.amount,'collection'),
   delivery_fee_usd:fee,driver_pay_usd:Math.max(1,fee-1),usd_to_lbp_rate:ws.usd_to_lbp,
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
