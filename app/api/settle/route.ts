import { NextResponse } from 'next/server'
import { api, ApiError, checked, money, textField, uuid } from '@/lib/api'
import { workspaceAccess, validateReferences } from '@/lib/access'
export const POST=api(async req=>{
 const body=await req.json()
 const {db,user,workspaceId}=await workspaceAccess(body.workspaceId)
 if(!['shop_payment','driver_cash_remittance','driver_pay'].includes(body.type)) throw new ApiError(400,'Invalid settlement type')
 const key=uuid(body.idempotencyKey,'payment request ID')
 const amount=money(body.amountUsd,'amount'), lbp=money(body.amountLbp,'LBP amount')
 if(amount===0 && lbp===0) throw new ApiError(400,'Enter a positive payment')
 if(body.type==='shop_payment' ? !body.shopId||body.driverId||lbp : !body.driverId||body.shopId) throw new ApiError(400,'Select the correct settlement recipient')
 if(body.type==='driver_pay' && lbp) throw new ApiError(400,'Driver pay is in USD')
 if(body.type==='shop_payment' && !['payout_to_shop','collection_from_shop',undefined].includes(body.direction)) throw new ApiError(400,'Invalid payment direction')
 await validateReferences(db,workspaceId,{shops:body.shopId,drivers:body.driverId,orders:body.orderId})
 const ws=checked(await db.from('workspaces').select('usd_to_lbp').eq('id',workspaceId).single())
 const payload={workspace_id:workspaceId,type:body.type,amount_usd:body.direction==='collection_from_shop'?-amount:amount,amount_lbp:lbp,
   shop_id:body.shopId||null,driver_id:body.driverId||null,order_id:body.orderId||null,note:textField(body.note,'note',2000),
   usd_to_lbp:ws.usd_to_lbp,created_by:user.id,idempotency_key:key}
 const result=await db.from('settlements').insert(payload).select().single()
 if(result.error?.code==='23505') {
   const old=checked(await db.from('settlements').select('*').eq('workspace_id',workspaceId).eq('idempotency_key',key).single())
   if(old.created_by!==user.id || old.type!==payload.type || Number(old.amount_usd)!==payload.amount_usd || Number(old.amount_lbp)!==lbp || old.shop_id!==payload.shop_id || old.driver_id!==payload.driver_id || old.order_id!==payload.order_id || old.note!==payload.note) throw new ApiError(409,'Payment request ID already used for different details')
   return NextResponse.json({success:true,settlement:old})
 }
 return NextResponse.json({success:true,settlement:checked(result)})
})
