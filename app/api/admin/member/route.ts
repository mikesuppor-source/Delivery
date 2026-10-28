import { NextResponse } from 'next/server'
import { api,ApiError,checked } from '@/lib/api'
import { id,parseBody,z } from '@/lib/validation'
const ChangeRole=z.object({workspaceId:id,memberId:id,role:z.enum(['manager','driver','readonly'])})
const RemoveMember=z.object({workspaceId:id,memberId:id})
import { workspaceAccess } from '@/lib/access'
export const PATCH=api(async req=>{
 const body=await parseBody(req,ChangeRole)
 const {db,workspaceId}=await workspaceAccess(body.workspaceId,['owner'])
 const target=checked(await db.from('workspace_members').update({role:body.role}).eq('id',body.memberId).eq('workspace_id',workspaceId).neq('role','owner').select('id').maybeSingle())
 if(!target)throw new ApiError(403,'Member not found or protected owner')
 return NextResponse.json({success:true})
})
export const DELETE=api(async req=>{
 const body=await parseBody(req,RemoveMember)
 const {db,user,workspaceId}=await workspaceAccess(body.workspaceId,['owner'])
 const memberId = body.memberId
 const { data: existingMember } = await db.from('workspace_members').select('user_id, role').eq('id', memberId).eq('workspace_id', workspaceId).maybeSingle()
 const target=checked(await db.from('workspace_members').delete().eq('id',memberId).eq('workspace_id',workspaceId).neq('role','owner').neq('user_id',user.id).select('id').maybeSingle())
 if(!target)throw new ApiError(403,'Member not found or protected owner')
 if(existingMember?.role === 'driver' && existingMember.user_id) {
   await db.from('drivers').update({ active: false, user_id: null }).eq('workspace_id', workspaceId).eq('user_id', existingMember.user_id)
 }
 return NextResponse.json({success:true})
})
