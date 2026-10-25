import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { shopDomain,verifyOAuth,verifyWebhook } from '../lib/shopify-security'
import { orderPatch } from '../lib/orders'
import { matchArea,collectibleUsd } from '../lib/import-orders'
test('Shopify host validation rejects credential exfiltration destinations',()=>{
 for(const host of ['evil.example','store.myshopify.com.evil.example','store.myshopify.com:443','store.myshopify.com@evil.example','https://store.myshopify.com/admin','localhost','127.0.0.1'])assert.throws(()=>shopDomain(host))
 assert.equal(shopDomain('https://my-store.myshopify.com/'),'my-store.myshopify.com')
})
test('OAuth signature and raw webhook HMAC reject modifications',()=>{
 const secret='test secret',params=new URLSearchParams({code:'abc',shop:'my-store.myshopify.com',state:'xyz',timestamp:'123'})
 const message=[...params].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('&')
 params.set('hmac',createHmac('sha256',secret).update(message).digest('hex'))
 assert.equal(verifyOAuth(params,secret),true);params.set('shop','evil.myshopify.com');assert.equal(verifyOAuth(params,secret),false)
 const raw='{"id":1}',signature=createHmac('sha256',secret).update(raw).digest('base64')
 assert.equal(verifyWebhook(raw,signature,secret),true);assert.equal(verifyWebhook(raw+' ',signature,secret),false)
})
test('notes-only edit does not manufacture a status transition',()=>{
 assert.deepEqual(orderPatch({notes:'note'},{status:'delivered'},true),{notes:'note'})
 assert.throws(()=>orderPatch({status:'delivered'},{status:'pending'},true))
 assert.throws(()=>orderPatch({collectionUsd:-10},{},false))
})
test('mixed tender must match the amount due',()=>{
 const order={status:'picked_up',collection_usd:100,usd_to_lbp_rate:100000}
 assert.throws(()=>orderPatch({status:'delivered',podCollectedUsd:20,podCollectedLbp:0},order,true))
 assert.equal(orderPatch({status:'delivered',podCollectedUsd:20,podCollectedLbp:8000000},order,true).pod_collected_usd,20)
})
test('area matching rejects empty and ambiguous addresses',()=>{
 const areas=[{id:'a',name:'Beirut',fee_usd:3},{id:'b',name:'Tripoli',fee_usd:5}]
 assert.equal(matchArea(areas,['','']),undefined)
 assert.equal(matchArea(areas,['Beirut','Tripoli']),undefined)
 assert.equal(matchArea(areas,[' Beirut '])?.id,'a')
})
test('Shopify paid/manual orders and non-USD currency are handled correctly',()=>{
 assert.equal(collectibleUsd({currency:'USD',financial_status:'paid',total_price:'100',payment_gateway_names:['manual']},100000),0)
 assert.equal(collectibleUsd({currency:'LBP',financial_status:'pending',total_price:'1000000'},100000),10)
 assert.throws(()=>collectibleUsd({currency:'EUR',financial_status:'pending',total_price:'10'},100000))
 assert.throws(()=>collectibleUsd({currency:'USD',financial_status:'partially_paid',total_price:'10'},100000))
})
