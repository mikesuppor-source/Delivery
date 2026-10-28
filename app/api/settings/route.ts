import { NextResponse } from 'next/server'
import { api,ApiError,checked } from '@/lib/api'
import { id,money,parseBody,requiredText,z } from '@/lib/validation'
const Settings=z.object({
 workspaceId:id,name:requiredText(200).optional(),currency:z.enum(['USD','LBP']).optional(),
 usdToLbp:money().optional(),defaultDriverPayUsd:money().optional(),defaultDeliveryFeeUsd:money().optional(),
})
import { workspaceAccess } from '@/lib/access'
export const PATCH=api(async req=>{
 const body=await parseBody(req,Settings)
 const {db,workspaceId}=await workspaceAccess(body.workspaceId,['owner','manager'])
 const updates:{name?:string;currency?:string;usd_to_lbp?:number;default_driver_pay_usd?:number;default_delivery_fee_usd?:number}={}
 if(body.name!==undefined)updates.name=body.name
 if(body.currency!==undefined)updates.currency=body.currency
 if(body.usdToLbp!==undefined){updates.usd_to_lbp=body.usdToLbp;if(!updates.usd_to_lbp)throw new ApiError(400,'Rate must be positive')}
 if(body.defaultDriverPayUsd!==undefined)updates.default_driver_pay_usd=body.defaultDriverPayUsd
 if(body.defaultDeliveryFeeUsd!==undefined)updates.default_delivery_fee_usd=body.defaultDeliveryFeeUsd
 const workspace=checked(await db.from('workspaces').update(updates).eq('id',workspaceId).select().single())
 return NextResponse.json({success:true,workspace})
})
