import { ApiError } from './api'
import { shopifyFetch, SHOPIFY_VERSION, siteUrl } from './shopify-security'
import { createServiceClient } from './supabase/server'
export async function installShopify(shopId:string,domain:string,token:string) {
 const db=createServiceClient()
 try {
  await db.from('shop_integrations').upsert({shop_id:shopId,access_token:token,updated_at:new Date().toISOString()},{onConflict:'shop_id'})
 } catch (e) { void e }
 const updateWithToken = await (db.from('shops') as any).update({shopify_domain:domain,shopify_access_token:token}).eq('id',shopId)
 if (updateWithToken.error) {
  await db.from('shops').update({shopify_domain:domain}).eq('id',shopId)
 }
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
