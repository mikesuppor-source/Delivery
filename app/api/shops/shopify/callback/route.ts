import { NextResponse } from 'next/server'
import { api, ApiError, checked } from '@/lib/api'
import { shopAccess } from '@/lib/access'
import { createServiceClient } from '@/lib/supabase/server'
import { shopDomain, siteUrl, shopifyCredentials, verifyOAuth, equalSignature, shopifyFetch } from '@/lib/shopify-security'
import { installShopify } from '@/lib/shopify-install'
export const GET=api(async req=>{
 const params=new URL(req.url).searchParams
 const domain=shopDomain(params.get('shop'))
 const {clientId,secret}=shopifyCredentials()
 if(!verifyOAuth(params,secret)) throw new ApiError(403,'Invalid Shopify callback signature')
 const state=params.get('state')||''
 if(!equalSignature(state,req.cookies.get('cedar_oauth_state')?.value||'')) throw new ApiError(403,'Invalid OAuth state')
 const db=createServiceClient()
 const {data:pending}=await db.from('oauth_states').select('*').eq('nonce',state).eq('domain',domain).gt('expires_at',new Date().toISOString()).maybeSingle()
 if(!pending) throw new ApiError(403,'OAuth request expired or already used')
 const {user}=await shopAccess(pending.shop_id)
 if(user.id!==pending.user_id) throw new ApiError(403,'OAuth session changed')
 const consumed=checked(await db.from('oauth_states').delete().eq('nonce',state).select('nonce'))
 if(consumed.length!==1) throw new ApiError(409,'OAuth request already used')
 const code=params.get('code')
 if(!code) throw new ApiError(400,'Missing authorization code')
 const result=await shopifyFetch(domain,'/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:clientId,client_secret:secret,code,expiring:'1'})})
 if(!result.ok) throw new ApiError(502,'Shopify token exchange failed')
 const token=await result.json()
 if(!token.access_token) throw new ApiError(502,'Shopify did not return an access token')
 await installShopify(pending.shop_id,domain,JSON.stringify({access_token:token.access_token,refresh_token:token.refresh_token,expires_at:token.expires_in?Date.now()+token.expires_in*1000:undefined}))
 const response=NextResponse.redirect(siteUrl()+'/portal')
 response.cookies.delete('cedar_oauth_state')
 return response
})
