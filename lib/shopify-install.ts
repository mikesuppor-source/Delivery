import { ApiError, checked } from './api'
import { shopifyFetch, SHOPIFY_VERSION, siteUrl } from './shopify-security'
import { createServiceClient } from './supabase/server'
export async function installShopify(shopId:string,domain:string,token:string) {
 const db=createServiceClient()
 // The token goes to shop_integrations (service role only); the shop row keeps just the domain
 checked(await db.from('shop_integrations').upsert({shop_id:shopId,access_token:token,updated_at:new Date().toISOString()},{onConflict:'shop_id'}).select('shop_id'))
 checked(await db.from('shops').update({shopify_domain:domain}).eq('id',shopId).select('id'))
 const parsed=token.startsWith('{')?JSON.parse(token).access_token:token
 const headers={'Content-Type':'application/json','X-Shopify-Access-Token':parsed}
 const address=siteUrl()+'/api/webhooks/shopify'
 const list=await shopifyFetch(domain,'/admin/api/'+SHOPIFY_VERSION+'/webhooks.json',{headers})
 if(!list.ok) throw new ApiError(502,'Store connected, but webhook listing failed. Reconnect to retry.')
 const existing=await list.json()
 if(!existing.webhooks?.some((h:{topic:string;address:string})=>h.topic==='orders/create' && h.address===address)){
  const response=await shopifyFetch(domain,'/admin/api/'+SHOPIFY_VERSION+'/webhooks.json',{method:'POST',headers,body:JSON.stringify({webhook:{topic:'orders/create',address,format:'json'}})})
  if(!response.ok) throw new ApiError(502,'Store connected, but webhook installation failed. Reconnect to retry.')
 }
}
