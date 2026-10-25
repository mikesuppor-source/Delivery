import { NextResponse } from 'next/server'
import { api, ApiError, textField } from '@/lib/api'
import { shopAccess } from '@/lib/access'
import { shopDomain, shopifyFetch, SHOPIFY_VERSION, siteUrl } from '@/lib/shopify-security'
import { installShopify } from '@/lib/shopify-install'
export const POST=api(async req=>{
 const body=await req.json()
 const {shop}=await shopAccess(body.shopId)
 const domain=shopDomain(body.shopifyDomain)
 const token=textField(body.accessToken,'access token',4096,true)
 const response=await shopifyFetch(domain,'/admin/api/'+SHOPIFY_VERSION+'/shop.json',{headers:{'X-Shopify-Access-Token':token}})
 if(!response.ok) throw new ApiError(400,'Shopify could not verify these store credentials')
 const info=await response.json()
 if(shopDomain(info.shop?.myshopify_domain)!==domain) throw new ApiError(400,'Store domain mismatch')
 await installShopify(shop.id,domain,token)
 return NextResponse.json({success:true,shop:{id:shop.id,name:shop.name,shopify_domain:domain},webhook_installed:true,webhook_url:siteUrl()+'/api/webhooks/shopify',message:'Store connected and signed webhook installed.'})
})
