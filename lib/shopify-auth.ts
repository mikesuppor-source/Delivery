import { createServiceClient } from './supabase/server'
import { ApiError } from './api'
import { shopDomain, shopifyCredentials, shopifyFetch } from './shopify-security'
export function parseStoredToken(raw:string|null|undefined) {
 if(!raw)return null
 if(raw.trim().startsWith('{')) { try{return JSON.parse(raw)}catch{throw new ApiError(503,'Reconnect Shopify')} }
 return {access_token:raw}
}
export async function getValidShopifyAccessToken(shop:{id:string;shopify_domain:string;shopify_access_token?:string|null}) {
 const domain=shopDomain(shop.shopify_domain)
 const db=createServiceClient()
 let rawToken: string | null = null
 try {
  const {data:record}=await db.from('shop_integrations').select('access_token').eq('shop_id',shop.id).maybeSingle()
  if(record?.access_token) rawToken=record.access_token
 } catch (e) { void e }
 if(!rawToken) {
  if(shop.shopify_access_token) {
   rawToken=shop.shopify_access_token
  } else {
   const {data:shopRow}=await (db.from('shops') as any).select('*').eq('id',shop.id).maybeSingle()
   rawToken=shopRow?.shopify_access_token||null
  }
 }
 const auth=parseStoredToken(rawToken)
 if(!auth?.access_token) throw new ApiError(400,'Reconnect Shopify')
 if(!auth.expires_at || auth.expires_at>Date.now()+180000)return auth.access_token as string
 if(!auth.refresh_token)throw new ApiError(400,'Shopify authorization expired. Reconnect the store.')
 const {clientId,secret}=shopifyCredentials()
 const response=await shopifyFetch(domain,'/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:clientId,client_secret:secret,grant_type:'refresh_token',refresh_token:auth.refresh_token})})
 if(!response.ok)throw new ApiError(502,'Shopify token refresh failed. Retry or reconnect.')
 const token=await response.json()
 if(!token.access_token)throw new ApiError(502,'Invalid token refresh response')
 const refreshedTokenStr=JSON.stringify({access_token:token.access_token,refresh_token:token.refresh_token||auth.refresh_token,expires_at:Date.now()+Number(token.expires_in)*1000})
 try {
  await db.from('shop_integrations').update({access_token:refreshedTokenStr}).eq('shop_id',shop.id)
 } catch (e) { void e }
 try {
  await (db.from('shops') as any).update({shopify_access_token:refreshedTokenStr}).eq('id',shop.id)
 } catch (e) { void e }
 return token.access_token as string
}
