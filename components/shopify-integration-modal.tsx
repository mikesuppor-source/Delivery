'use client'
import { useState } from 'react'
import { Modal } from './modal'
import { syncShopify } from '@/lib/shopify-client'
interface Props {isOpen:boolean;onClose:()=>void;shop:{id:string;name:string;shopify_domain?:string|null};onOrderCreated?:(order:unknown)=>void}
export function ShopifyIntegrationModal({isOpen,onClose,shop,onOrderCreated}:Props){
 const [domain,setDomain]=useState(shop.shopify_domain||''),[token,setToken]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 async function connect(e:React.FormEvent){e.preventDefault();setBusy(true);setMessage('')
  try{
   const res=await fetch('/api/shops/shopify/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({shopId:shop.id,shopifyDomain:domain,accessToken:token})})
   const data=await res.json();if(!res.ok)throw new Error(data.error)
   setToken('');setMessage(data.message)
  }catch(e){setMessage(e instanceof Error?e.message:'Connection failed')}finally{setBusy(false)}
 }
 async function sync(){setBusy(true);setMessage('')
  try{const result=await syncShopify(shop.id);setMessage(result.message);onOrderCreated?.(null)}catch(e){setMessage(e instanceof Error?e.message:'Sync failed')}finally{setBusy(false)}
 }
 return <Modal isOpen={isOpen} onClose={onClose} title={'Shopify — '+shop.name}>
 <p>Authorize your store to import orders. Webhooks are verified using Shopify signatures.</p>
 <label>Store domain<input value={domain} onChange={e=>setDomain(e.target.value)} placeholder="store.myshopify.com"/></label>
 <a className="btn btn-primary" href={'/api/shops/shopify/auth?shopId='+encodeURIComponent(shop.id)+'&shop='+encodeURIComponent(domain)}>Authorize with Shopify</a>
 <details><summary>Connect using a store access token</summary><form onSubmit={connect}>
 <label>Admin access token<input type="password" autoComplete="off" value={token} required onChange={e=>setToken(e.target.value)}/></label>
 <button disabled={busy} className="btn btn-primary">Verify and connect</button></form></details>
 <button disabled={busy} onClick={sync} className="btn btn-secondary">Sync all orders</button>
 {message&&<p role="status">{message}</p>}</Modal>
}
