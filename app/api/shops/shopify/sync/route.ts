import { NextResponse } from 'next/server'
import { api, ApiError } from '@/lib/api'
import { shopAccess } from '@/lib/access'
import { getValidShopifyAccessToken } from '@/lib/shopify-auth'
import { shopifyFetch, SHOPIFY_VERSION } from '@/lib/shopify-security'
import { importShopifyOrder } from '@/lib/import-orders'
export const POST=api(async req=>{
 const body=await req.json()
 const {shop}=await shopAccess(body.shopId)
 if(!shop.shopify_domain)throw new ApiError(400,'Connect Shopify first')
 const token=await getValidShopifyAccessToken({...shop,shopify_domain:shop.shopify_domain})
 const path=body.cursor?String(body.cursor):'/admin/api/'+SHOPIFY_VERSION+'/orders.json?status=any&limit=100'
 const response=await shopifyFetch(shop.shopify_domain,path,{headers:{'X-Shopify-Access-Token':token}})
 if(!response.ok)throw new ApiError(502,'Shopify request failed. Retry or reconnect the store.')
 const payload=await response.json()
 const orders=[],failures=[]
 let skipped=0
 for(const item of payload.orders||[]) {
  try {const result=await importShopifyOrder(shop,item); if(result.skipped)skipped++;else orders.push(result.order)}
  catch(error){failures.push({id:String(item.id),error:error instanceof Error?error.message:'Import failed'})}
 }
 const next=response.headers.get('link')?.split(',').find(part=>part.includes('rel="next"'))?.match(/<([^>]+)>/)?.[1]||null
 return NextResponse.json({success:failures.length===0,orders,importedCount:orders.length,skipped,failures,nextCursor:next,message:orders.length+' orders imported'+(failures.length?'; '+failures.length+' need review':'')})
})
