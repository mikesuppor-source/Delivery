import { NextResponse } from 'next/server'
import { api, ApiError } from '@/lib/api'
import { createServiceClient } from '@/lib/supabase/server'
import { shopDomain, shopifyCredentials, verifyWebhook } from '@/lib/shopify-security'
import { importShopifyOrder } from '@/lib/import-orders'
export const GET=api(async()=>NextResponse.json({status:'online',service:'Cedar signed Shopify webhook'}))
export const POST=api(async req=>{
 const raw=await req.text()
 if(Buffer.byteLength(raw)>2_000_000)throw new ApiError(413,'Webhook too large')
 if(!verifyWebhook(raw,req.headers.get('x-shopify-hmac-sha256')||'',shopifyCredentials().secret))throw new ApiError(401,'Invalid webhook signature')
 const domain=shopDomain(req.headers.get('x-shopify-shop-domain'))
 const topic=req.headers.get('x-shopify-topic')
 if(topic!=='orders/create')throw new ApiError(400,'Unsupported webhook topic')
 const db=createServiceClient()
 const {data:shop}=await db.from('shops').select('id,workspace_id,prefix').eq('shopify_domain',domain).eq('active',true).maybeSingle()
 if(!shop)throw new ApiError(404,'Connected shop not found')
 const result=await importShopifyOrder(shop,JSON.parse(raw))
 return NextResponse.json({success:true,...result})
})
