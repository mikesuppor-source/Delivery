import { NextResponse } from 'next/server'
import { api,ApiError,checked,textField } from '@/lib/api'
import { authenticated } from '@/lib/access'
import { createServiceClient } from '@/lib/supabase/server'
export const POST=api(async req=>{
 const {user}=await authenticated()
 if(!user.email_confirmed_at||!user.email)throw new ApiError(403,'Verify your email before accepting')
 const body=await req.json()
 const token=textField(body.token,'invitation token',64,true)
 checked(await createServiceClient().rpc('accept_staff_invite',{p_token:token,p_user:user.id,p_email:user.email,p_name:textField(body.displayName,'name',200,true)}))
 return NextResponse.json({success:true})
})
