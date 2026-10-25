import { NextResponse } from 'next/server'
import { api,ApiError,checked,textField,uuid } from '@/lib/api'
import { workspaceAccess } from '@/lib/access'
import { siteUrl } from '@/lib/shopify-security'
export const POST=api(async req=>{
 const body=await req.json()
 const {db,user,workspaceId}=await workspaceAccess(body.workspaceId,['owner'])
 const email=textField(body.email,'email',254,true).toLowerCase()
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['manager','driver','readonly'].includes(body.role))throw new ApiError(400,'Invalid email or role')
 const invite=checked(await db.from('invitations').insert({workspace_id:workspaceId,email,role:body.role,invited_by:user.id}).select('id,token').single())
 const inviteUrl=siteUrl()+'/invite/'+invite.token
 const {error}=await db.auth.admin.inviteUserByEmail(email,{redirectTo:inviteUrl})
 // Existing users can accept with their own password and the exact invitation link.
 return NextResponse.json({success:true,invitationId:invite.id,inviteUrl,emailSent:!error,message:error?'Invitation created, but email was not sent. Share the invitation link with the intended user.':'Invitation email sent'})
})
export const DELETE=api(async req=>{
 const body=await req.json()
 const {db,workspaceId}=await workspaceAccess(body.workspaceId,['owner'])
 checked(await db.from('invitations').delete().eq('id',uuid(body.inviteId)).eq('workspace_id',workspaceId).select('id'))
 return NextResponse.json({success:true})
})
