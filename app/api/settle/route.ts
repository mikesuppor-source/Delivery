import { NextResponse } from 'next/server'
import { api, ApiError, checked } from '@/lib/api'
import { id, money, optionalId, parseBody, text, z } from '@/lib/validation'
import { workspaceAccess, validateReferences } from '@/lib/access'
const Settlement=z.object({
 workspaceId:id,type:z.enum(['shop_payment','driver_cash_remittance','driver_pay']),idempotencyKey:id,
 amountUsd:money(),amountLbp:money(),shopId:optionalId,driverId:optionalId,orderId:optionalId,
 direction:z.enum(['payout_to_shop','collection_from_shop']).optional(),note:text(2000),
})
export const POST=api(async req=>{
 const body=await parseBody(req,Settlement)
 const {db,user,workspaceId}=await workspaceAccess(body.workspaceId)
 const key=body.idempotencyKey
 const amount=body.amountUsd, lbp=body.amountLbp
 if(amount===0 && lbp===0) throw new ApiError(400,'Enter a positive payment')
 if(body.type==='shop_payment' ? !body.shopId||body.driverId||lbp : !body.driverId||body.shopId) throw new ApiError(400,'Select the correct settlement recipient')
 if(body.type==='driver_pay' && lbp) throw new ApiError(400,'Driver pay is in USD')
 await validateReferences(db,workspaceId,{shops:body.shopId,drivers:body.driverId,orders:body.orderId})
 const ws=checked(await db.from('workspaces').select('usd_to_lbp').eq('id',workspaceId).single())
 const payload={workspace_id:workspaceId,type:body.type,amount_usd:body.direction==='collection_from_shop'?-amount:amount,amount_lbp:lbp,
   shop_id:body.shopId||null,driver_id:body.driverId||null,order_id:body.orderId||null,note:body.note,
   usd_to_lbp:ws.usd_to_lbp,created_by:user.id,idempotency_key:key}
 const result=await db.from('settlements').insert(payload).select().single()
 if(result.error?.code==='23505') {
   const old=checked(await db.from('settlements').select('*').eq('workspace_id',workspaceId).eq('idempotency_key',key).single())
   if(old.created_by!==user.id || old.type!==payload.type || Number(old.amount_usd)!==payload.amount_usd || Number(old.amount_lbp)!==lbp || old.shop_id!==payload.shop_id || old.driver_id!==payload.driver_id || old.order_id!==payload.order_id || old.note!==payload.note) throw new ApiError(409,'Payment request ID already used for different details')
   return NextResponse.json({success:true,settlement:old})
 }
 return NextResponse.json({success:true,settlement:checked(result)})
})
