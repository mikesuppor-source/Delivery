import { NextResponse } from 'next/server'
import { api,ApiError,checked,uuid } from '@/lib/api'
import { workspaceAccess } from '@/lib/access'
export const PATCH=api(async req=>{
 const body=await req.json()
 const {db,workspaceId}=await workspaceAccess(body.workspaceId,['owner'])
 if(!['manager','driver','readonly'].includes(body.role))throw new ApiError(400,'Invalid staff role')
 const target=checked(await db.from('workspace_members').update({role:body.role}).eq('id',uuid(body.memberId)).eq('workspace_id',workspaceId).neq('role','owner').select('id').maybeSingle())
 if(!target)throw new ApiError(403,'Member not found or protected owner')
 return NextResponse.json({success:true})
})
export const DELETE=api(async req=>{
 const body=await req.json()
 const {db,user,workspaceId}=await workspaceAccess(body.workspaceId,['owner'])
 const memberId = uuid(body.memberId)
 const { data: existingMember } = await db.from('workspace_members').select('user_id, role').eq('id', memberId).eq('workspace_id', workspaceId).maybeSingle()
 const target=checked(await db.from('workspace_members').delete().eq('id',memberId).eq('workspace_id',workspaceId).neq('role','owner').neq('user_id',user.id).select('id').maybeSingle())
 if(!target)throw new ApiError(403,'Member not found or protected owner')
 if(existingMember?.role === 'driver' && existingMember.user_id) {
   await db.from('drivers').update({ active: false, user_id: null }).eq('workspace_id', workspaceId).eq('user_id', existingMember.user_id)
 }
 return NextResponse.json({success:true})
})
