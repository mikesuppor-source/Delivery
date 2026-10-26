import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { api, ApiError, checked, textField, uuid } from '@/lib/api'
import { rateLimit } from '@/lib/rate-limit'
import { siteUrl } from '@/lib/shopify-security'
import { formatLebanesePhone, isValidLebanesePhone } from '@/lib/phone'
import { formatOrderCode } from '@/lib/order-codes'
export const POST=api(async req=>{
 const body=await req.json()
 const email=textField(body.email,'email',254,true).toLowerCase()
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400,'Enter a valid email address')
 const password=textField(body.password,'password',200,true)
 if(password.length<10) throw new ApiError(400,'Use a password of at least 10 characters')
 const name=textField(body.shopName,'shop name',200,true)
 const phone=textField(body.phone,'phone',40)
 if(phone && !isValidLebanesePhone(phone)) throw new ApiError(400,'Invalid Lebanese phone number')
 let configuredWs = process.env.MERCHANT_WORKSPACE_ID
 if (!configuredWs) {
  const { data: firstWs } = await createServiceClient().from('workspaces').select('id').order('created_at').limit(1).maybeSingle()
  configuredWs = firstWs?.id
 }
 const workspaceId=uuid(configuredWs,'configured merchant workspace')
 await rateLimit('signup:'+email,3)
 await rateLimit('signup-ip:'+(req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown'),10)
 const client=await createClient()
 const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:siteUrl()+'/portal/login'}})
 if(error || !data.user || !data.user.identities?.length) throw new ApiError(400,'Unable to register. If you already have an account, sign in or reset your password.')
 const db=createServiceClient()
 checked(await db.from('shops').insert({workspace_id:workspaceId,user_id:data.user.id,name,
   phone:phone?formatLebanesePhone(phone):null,address:textField(body.address,'address',1000),
   prefix:formatOrderCode(textField(body.prefix,'prefix',5))||'CD'}).select('id'))
 return NextResponse.json({success:true,requiresConfirmation:!data.session,message:'Check your email to confirm your account, then sign in.'})
})
