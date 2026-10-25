import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { api, checked } from '@/lib/api'
import { shopAccess } from '@/lib/access'
import { shopDomain, siteUrl, shopifyCredentials } from '@/lib/shopify-security'
export const GET=api(async req=>{
 const params=new URL(req.url).searchParams
 const {db,user,shop}=await shopAccess(params.get('shopId')||undefined)
 const domain=shopDomain(params.get('shop')||shop.shopify_domain)
 const {clientId}=shopifyCredentials()
 const state=randomBytes(32).toString('hex')
 checked(await db.from('oauth_states').insert({nonce:state,user_id:user.id,shop_id:shop.id,domain}).select('nonce'))
 const query=new URLSearchParams({client_id:clientId,scope:'read_orders,write_orders',redirect_uri:siteUrl()+'/api/shops/shopify/callback',state})
 const response=NextResponse.redirect('https://'+domain+'/admin/oauth/authorize?'+query)
 response.cookies.set('cedar_oauth_state',state,{httpOnly:true,secure:siteUrl().startsWith('https:'),sameSite:'lax',path:'/api/shops/shopify/callback',maxAge:600})
 return response
})
