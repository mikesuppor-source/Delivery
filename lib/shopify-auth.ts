import { createServiceClient } from './supabase/server'
import { ApiError, checked } from './api'
import { shopDomain, shopifyCredentials, shopifyFetch } from './shopify-security'
export function parseStoredToken(raw:string|null|undefined) {
 if(!raw)return null
 if(raw.trim().startsWith('{')) { try{return JSON.parse(raw)}catch{throw new ApiError(503,'Reconnect Shopify')} }
 return {access_token:raw}
}
export async function getValidShopifyAccessToken(shop:{id:string;shopify_domain:string}) {
 const domain=shopDomain(shop.shopify_domain)
 const db=createServiceClient()
 // Shopify tokens live only in shop_integrations (migration 009), never on the shops row
 const {data:record,error}=await db.from('shop_integrations').select('access_token').eq('shop_id',shop.id).maybeSingle()
 if(error)throw new ApiError(500,'Database operation failed')
 const auth=parseStoredToken(record?.access_token)
 if(!auth?.access_token) throw new ApiError(400,'Reconnect Shopify')
 if(!auth.expires_at || auth.expires_at>Date.now()+180000)return auth.access_token as string
 if(!auth.refresh_token)throw new ApiError(400,'Shopify authorization expired. Reconnect the store.')
 const {clientId,secret}=shopifyCredentials()
 const response=await shopifyFetch(domain,'/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:clientId,client_secret:secret,grant_type:'refresh_token',refresh_token:auth.refresh_token})})
 if(!response.ok)throw new ApiError(502,'Shopify token refresh failed. Retry or reconnect.')
 const token=await response.json()
 if(!token.access_token)throw new ApiError(502,'Invalid token refresh response')
 const refreshedTokenStr=JSON.stringify({access_token:token.access_token,refresh_token:token.refresh_token||auth.refresh_token,expires_at:Date.now()+Number(token.expires_in)*1000})
 checked(await db.from('shop_integrations').update({access_token:refreshedTokenStr,updated_at:new Date().toISOString()}).eq('shop_id',shop.id).select('shop_id'))
 return token.access_token as string
}
