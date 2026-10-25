import { NextResponse } from 'next/server'
import { api, ApiError, checked, money, textField } from '@/lib/api'
import { workspaceAccess, validateReferences } from '@/lib/access'
import { matchArea } from '@/lib/import-orders'
import { generateUniqueOrderCode, formatOrderCode } from '@/lib/order-codes'
export const POST=api(async req=>{
 const body=await req.json()
 const {db,user,workspaceId}=await workspaceAccess(body.workspaceId)
 await validateReferences(db,workspaceId,{shops:body.shopId})
 if(!body.shopId || !Array.isArray(body.orders)||!body.orders.length||body.orders.length>200)throw new ApiError(400,'Select a shop and 1–200 orders')
 const ws=checked(await db.from('workspaces').select('usd_to_lbp').eq('id',workspaceId).single())
 const areas=checked(await db.from('delivery_areas').select('id,name,fee_usd,default_driver_id').eq('workspace_id',workspaceId).eq('active',true))
 const rows=[]
 for(const item of body.orders){
  const area=matchArea(areas,[item.areaName,item.city])
  const fee=area?Number(area.fee_usd):3
  rows.push({workspace_id:workspaceId,shop_id:body.shopId,status:'pending' as const,
   code:item.code?formatOrderCode(textField(item.code,'code',60,true)):await generateUniqueOrderCode(db),
   area_id:area?.id||null,collection_usd:money(item.collectionUsd??item.amount,'collection'),
   delivery_fee_usd:fee,driver_pay_usd:Math.max(1,fee-1),usd_to_lbp_rate:ws.usd_to_lbp,
   recipient_name:textField(item.recipientName||item.name,'recipient',200,true),
   recipient_phone:textField(item.recipientPhone||item.phone,'phone',40,true),
   recipient_address:textField(item.recipientAddress||item.address,'address',1000,true),
   notes:textField(item.notes,'notes',4000),created_by:user.id})
 }
 const orders=checked(await db.from('orders').insert(rows).select('id,code,status,recipient_name,collection_usd'))
 return NextResponse.json({success:true,count:orders.length,orders,message:orders.length+' orders imported'})
})
