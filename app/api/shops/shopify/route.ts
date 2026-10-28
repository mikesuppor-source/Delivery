import { NextResponse } from 'next/server'
import { api, ApiError, checked } from '@/lib/api'
import { shopAccess } from '@/lib/access'
import { siteUrl } from '@/lib/shopify-security'
export const GET=api(async req=>{
 const {shop}=await shopAccess(new URL(req.url).searchParams.get('shopId'))
 return NextResponse.json({shopId:shop.id,name:shop.name,shopify_domain:shop.shopify_domain,webhook_url:siteUrl()+'/api/webhooks/shopify'})
})
export const PATCH=api(async req=>{
 const body=await req.json()
 const {db,shop}=await shopAccess(body.shopId)
 // Domain changes require proof of store ownership through connect/OAuth.
 if(body.shopifyDomain!==undefined) throw new ApiError(400,'Reconnect the store to change its domain')
 if(body.regenerateKey) {
  const newKey=crypto.randomUUID()
  checked(await db.from('shop_integrations').upsert({shop_id:shop.id,api_key:newKey,updated_at:new Date().toISOString()},{onConflict:'shop_id'}).select('shop_id'))
 }
 return NextResponse.json({success:true})
})
