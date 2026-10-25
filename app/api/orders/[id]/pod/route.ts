import { NextResponse } from 'next/server'
import { api,ApiError,uuid } from '@/lib/api'
import { authenticated } from '@/lib/access'
import { createServiceClient } from '@/lib/supabase/server'
export const GET=api(async(req,ctx:{params:Promise<{id:string}>})=>{
 const {client}=await authenticated()
 const id=uuid((await ctx.params).id)
 const {data:order}=await client.from('orders').select('pod_photo,pod_signature').eq('id',id).maybeSingle()
 if(!order)throw new ApiError(404,'Order not found')
 const kind=new URL(req.url).searchParams.get('kind')
 const value=kind==='signature'?order.pod_signature:order.pod_photo
 if(!value)throw new ApiError(404,'Proof not available')
 if(value.startsWith('data:image/')){
  const match=value.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/)
  if(!match)throw new ApiError(404,'Invalid legacy proof')
  return new NextResponse(Buffer.from(match[2],'base64'),{headers:{'Content-Type':'image/'+match[1],'Cache-Control':'no-store'}})
 }
 if(!value.startsWith(id+'/'))throw new ApiError(403,'Invalid proof path')
 const {data,error}=await createServiceClient().storage.from('delivery-proof').createSignedUrl(value,60)
 if(error||!data)throw new ApiError(502,'Unable to retrieve proof')
 return NextResponse.redirect(data.signedUrl)
})
