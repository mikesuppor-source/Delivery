import { NextResponse } from 'next/server'
import { api,ApiError,checked,textField } from '@/lib/api'
import { createServiceClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
export const POST=api(async req=>{
 const body=await req.json()
 if(typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))throw new ApiError(403,'Use the private tracking link')
 if(typeof body.lat!=='number'||typeof body.lng!=='number'||!Number.isFinite(body.lat)||!Number.isFinite(body.lng)||Math.abs(body.lat)>90||Math.abs(body.lng)>180)throw new ApiError(400,'Invalid coordinates')
 await rateLimit('location:'+body.token,5)
 const db=createServiceClient()
 const {data:order}=await db.from('orders').select('id,recipient_address,notes,updated_at').eq('tracking_token',body.token).in('status',['pending','assigned','picked_up','failed']).gt('created_at',new Date(Date.now()-30*86400000).toISOString()).maybeSingle()
 if(!order)throw new ApiError(404,'Location sharing is unavailable for this delivery')
 const note=textField(body.extraNotes,'location instructions',500)
 const updated=checked(await db.from('orders').update({location_lat:body.lat,location_lng:body.lng,
  notes:note?((order.notes||'')+' [Location: '+note+']').slice(-4000):order.notes
 }).eq('id',order.id).eq('updated_at',order.updated_at).select('id').maybeSingle())
 if(!updated)throw new ApiError(409,'Delivery changed; refresh your tracking page')
 return NextResponse.json({success:true,address:'GPS pin shared with courier'})
})
