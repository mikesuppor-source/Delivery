import { NextResponse } from 'next/server'
import { api, ApiError, checked } from '@/lib/api'
import { flag, id, idList, money, parseBody, requiredText, serviceType, text, weightKg, z } from '@/lib/validation'
import { shopAccess } from '@/lib/access'
import { generateUniqueOrderCode, formatOrderCode } from '@/lib/order-codes'
import { ORDER_SELECT } from '@/lib/orders'
import { isValidLebanesePhone, formatLebanesePhone } from '@/lib/phone'
import { loadPricing } from '@/lib/pricing-server'
const PlaceOrder=z.object({
 areaId:id,code:text(60),recipientPhone:requiredText(40),recipientName:requiredText(200),recipientAddress:requiredText(1000),
 collectionUsd:money(),serviceType,weightKg,isBreakable:flag,paymentMethod:text(40),
 destinationGovernorate:text(100),destinationCaza:text(100),destinationTown:text(100),notes:text(4000),
})
const CancelOrder=z.object({action:z.literal('cancel'),orderId:id,reason:text(1000)})
const CancelOrders=z.object({orderIds:idList.optional(),orderId:id.optional()}).refine(b=>b.orderIds||b.orderId,{message:'Select between 1 and 200 records'})
export const GET=api(async req=>{
 const {db,shop}=await shopAccess()
 const page=Math.max(0,Math.floor(Number(new URL(req.url).searchParams.get('page'))||0))
 const result=await db.from('orders').select(ORDER_SELECT,{count:'exact'}).eq('shop_id',shop.id).order('created_at',{ascending:false}).order('id').range(page*100,page*100+99)
 return NextResponse.json({orders:checked(result),count:result.count,page})
})
export const POST=api(async req=>{
 const {db,shop,user}=await shopAccess()
 const body=await parseBody(req,PlaceOrder)
 const phone=body.recipientPhone
 if(!isValidLebanesePhone(phone))throw new ApiError(400,'Invalid Lebanese phone number')
 // Verify the area belongs to this workspace before loading pricing
 const area=checked(await db.from('delivery_areas').select('id').eq('id',body.areaId).eq('workspace_id',shop.workspace_id).eq('active',true).maybeSingle())
 if(!area)throw new ApiError(400,'Invalid delivery area')
 const ws=checked(await db.from('workspaces').select('usd_to_lbp').eq('id',shop.workspace_id).single())
 const pricing=await loadPricing(db,{workspaceId:shop.workspace_id,areaId:body.areaId,shopId:shop.id})
 const code=body.code?formatOrderCode(body.code):await generateUniqueOrderCode(db,shop.prefix||'CD')
 if(!code)throw new ApiError(400,'Invalid order code')
 const order=checked(await db.from('orders').insert({workspace_id:shop.workspace_id,shop_id:shop.id,area_id:area.id,code,status:'pending',
  usd_to_lbp_rate:ws.usd_to_lbp,collection_usd:body.collectionUsd,delivery_fee_usd:pricing.feeUsd,driver_pay_usd:pricing.driverPayUsd,
  service_type:body.serviceType,
  weight_kg:body.weightKg,
  is_breakable:body.isBreakable,
  payment_method:body.paymentMethod || 'cash_usd',
  destination_governorate:body.destinationGovernorate,
  destination_caza:body.destinationCaza,
  destination_town:body.destinationTown,
  recipient_name:body.recipientName,recipient_phone:formatLebanesePhone(phone),
  recipient_address:body.recipientAddress,notes:body.notes,created_by:user.id
 }).select(ORDER_SELECT).single())
 return NextResponse.json({success:true,order,message:'Order placed'})
})
export const PATCH=api(async req=>{
 const {db,shop}=await shopAccess()
 const body=await parseBody(req,CancelOrder)
 const order=checked(await db.from('orders').update({status:'cancelled',notes:'Cancelled by merchant: '+body.reason})
  .eq('id',body.orderId).eq('shop_id',shop.id).eq('status','pending').select(ORDER_SELECT).maybeSingle())
 if(!order)throw new ApiError(409,'Only pending orders can be cancelled')
 return NextResponse.json({success:true,order,message:'Order cancelled'})
})
export const DELETE=api(async req=>{
 const {db,shop}=await shopAccess()
 const body=await parseBody(req,CancelOrders)
 const selected=body.orderIds||[body.orderId as string]
 const orders=checked(await db.from('orders').select('id,status').eq('shop_id',shop.id).in('id',selected))
 if(orders.length!==selected.length||orders.some(o=>o.status!=='pending'))throw new ApiError(409,'Only your pending orders can be cancelled. Delivery records are retained.')
 const cancelled=checked(await db.from('orders').update({status:'cancelled'}).eq('shop_id',shop.id).eq('status','pending').in('id',selected).select('id'))
 return NextResponse.json({success:true,deletedIds:cancelled.map(o=>o.id),message:'Pending orders cancelled; records retained'})
})
