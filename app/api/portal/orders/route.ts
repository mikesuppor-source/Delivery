import { NextResponse } from 'next/server'
import { api, ApiError, checked, money, textField, ids, uuid } from '@/lib/api'
import { shopAccess } from '@/lib/access'
import { generateUniqueOrderCode, formatOrderCode } from '@/lib/order-codes'
import { ORDER_SELECT } from '@/lib/orders'
import { isValidLebanesePhone, formatLebanesePhone } from '@/lib/phone'
export const GET=api(async req=>{
 const {db,shop}=await shopAccess()
 const page=Math.max(0,Math.floor(Number(new URL(req.url).searchParams.get('page'))||0))
 const result=await db.from('orders').select(ORDER_SELECT,{count:'exact'}).eq('shop_id',shop.id).order('created_at',{ascending:false}).order('id').range(page*100,page*100+99)
 return NextResponse.json({orders:checked(result),count:result.count,page})
})
export const POST=api(async req=>{
 const {db,shop,user}=await shopAccess()
 const body=await req.json()
 const phone=textField(body.recipientPhone,'phone',40,true)
 if(!isValidLebanesePhone(phone))throw new ApiError(400,'Invalid Lebanese phone number')
 const area=checked(await db.from('delivery_areas').select('*').eq('id',uuid(body.areaId)).eq('workspace_id',shop.workspace_id).eq('active',true).single())
 const ws=checked(await db.from('workspaces').select('usd_to_lbp').eq('id',shop.workspace_id).single())
 const code=body.code?formatOrderCode(textField(body.code,'code',60,true)):await generateUniqueOrderCode(db,shop.prefix||'CD')
 if(!code)throw new ApiError(400,'Invalid order code')
 const order=checked(await db.from('orders').insert({workspace_id:shop.workspace_id,shop_id:shop.id,area_id:area.id,code,status:'pending',
  usd_to_lbp_rate:ws.usd_to_lbp,collection_usd:money(body.collectionUsd,'collection'),delivery_fee_usd:area.fee_usd,driver_pay_usd:1,
  recipient_name:textField(body.recipientName,'recipient',200,true),recipient_phone:formatLebanesePhone(phone),
  recipient_address:textField(body.recipientAddress,'address',1000,true),notes:textField(body.notes,'notes',4000),created_by:user.id
 }).select(ORDER_SELECT).single())
 return NextResponse.json({success:true,order,message:'Order placed'})
})
export const PATCH=api(async req=>{
 const {db,shop}=await shopAccess()
 const body=await req.json()
 if(body.action!=='cancel')throw new ApiError(400,'Unsupported action')
 const order=checked(await db.from('orders').update({status:'cancelled',notes:'Cancelled by merchant: '+textField(body.reason,'reason',1000)})
  .eq('id',uuid(body.orderId)).eq('shop_id',shop.id).eq('status','pending').select(ORDER_SELECT).maybeSingle())
 if(!order)throw new ApiError(409,'Only pending orders can be cancelled')
 return NextResponse.json({success:true,order,message:'Order cancelled'})
})
export const DELETE=api(async req=>{
 const {db,shop}=await shopAccess()
 const body=await req.json()
 const selected=ids(body.orderIds||[body.orderId])
 const orders=checked(await db.from('orders').select('id,status').eq('shop_id',shop.id).in('id',selected))
 if(orders.length!==selected.length||orders.some(o=>o.status!=='pending'))throw new ApiError(409,'Only your pending orders can be cancelled. Delivery records are retained.')
 const cancelled=checked(await db.from('orders').update({status:'cancelled'}).eq('shop_id',shop.id).eq('status','pending').in('id',selected).select('id'))
 return NextResponse.json({success:true,deletedIds:cancelled.map(o=>o.id),message:'Pending orders cancelled; records retained'})
})
