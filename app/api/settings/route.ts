import { NextResponse } from 'next/server'
import { api,ApiError,checked,money,textField } from '@/lib/api'
import { workspaceAccess } from '@/lib/access'
export const PATCH=api(async req=>{
 const body=await req.json()
 const {db,workspaceId}=await workspaceAccess(body.workspaceId,['owner'])
 const updates:{name?:string;currency?:string;usd_to_lbp?:number}={}
 if(body.name!==undefined)updates.name=textField(body.name,'workspace name',200,true)
 if(body.currency!==undefined){
  if(!['USD','LBP'].includes(body.currency))throw new ApiError(400,'Unsupported currency')
  updates.currency=body.currency
 }
 if(body.usdToLbp!==undefined){updates.usd_to_lbp=money(body.usdToLbp,'exchange rate');if(!updates.usd_to_lbp)throw new ApiError(400,'Rate must be positive')}
 const workspace=checked(await db.from('workspaces').update(updates).eq('id',workspaceId).select().single())
 return NextResponse.json({success:true,workspace})
})
