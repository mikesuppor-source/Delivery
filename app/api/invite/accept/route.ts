import { NextResponse } from 'next/server'
import { api,ApiError,checked,textField } from '@/lib/api'
import { authenticated } from '@/lib/access'
import { createServiceClient } from '@/lib/supabase/server'
export const POST=api(async req=>{
 const {user}=await authenticated()
 if(!user.email_confirmed_at||!user.email)throw new ApiError(403,'Verify your email before accepting')
 const body=await req.json()
 const token=textField(body.token,'invitation token',64,true)
 const db=createServiceClient()
 const rpcResult=await db.rpc('accept_staff_invite',{p_token:token,p_user:user.id,p_email:user.email,p_name:textField(body.displayName,'name',200,true)})
 if(rpcResult.error && (rpcResult.error as any).code==='42883') {
  const name=textField(body.displayName,'name',200,true)
  const {data:inv}=await db.from('invitations').select('*').eq('token',token).is('accepted_at',null).gt('expires_at',new Date().toISOString()).maybeSingle()
  if(!inv || inv.email.toLowerCase()!==user.email.toLowerCase()) throw new ApiError(400,'Invalid or expired invitation')
  await db.from('workspace_members').upsert({workspace_id:inv.workspace_id,user_id:user.id,role:inv.role,display_name:name,joined_at:new Date().toISOString()},{onConflict:'workspace_id,user_id'})
  if(inv.role==='driver') {
   const {data:existingDriver}=await db.from('drivers').select('id').eq('workspace_id',inv.workspace_id).eq('user_id',user.id).maybeSingle()
   if(!existingDriver) {
    await db.from('drivers').insert({workspace_id:inv.workspace_id,user_id:user.id,name})
   }
  }
  await db.from('invitations').update({accepted_at:new Date().toISOString()}).eq('id',inv.id)
 } else {
  checked(rpcResult)
 }
 return NextResponse.json({success:true})
})
