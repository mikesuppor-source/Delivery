import { NextResponse } from 'next/server'
import { api, ApiError, checked, textField } from '@/lib/api'
import { createServiceClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
export const POST=api(async req=>{
 const body=await req.json()
 if(typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))throw new ApiError(403,'Use the private tracking link')
 if(typeof body.lat!=='number'||typeof body.lng!=='number'||!Number.isFinite(body.lat)||!Number.isFinite(body.lng)||Math.abs(body.lat)>90||Math.abs(body.lng)>180)throw new ApiError(400,'Invalid coordinates')
 await rateLimit('location:'+body.token,5)
 const db=createServiceClient()
 let order: any = null
 try {
  const {data}=await db.from('orders').select('id,recipient_address,notes,updated_at').eq('tracking_token',body.token).in('status',['pending','assigned','picked_up','failed']).gt('created_at',new Date(Date.now()-30*86400000).toISOString()).maybeSingle()
  order = data
 } catch (e) { void e }
 if(!order)throw new ApiError(404,'Location sharing is unavailable for this delivery')
 const note=textField(body.extraNotes,'location instructions',500)
 const notesText=note?((order.notes||'')+' [Location: '+note+']').slice(-4000):order.notes
 let updateResult = await db.from('orders').update({location_lat:body.lat,location_lng:body.lng,notes:notesText}).eq('id',order.id).select('id').maybeSingle()
 if(updateResult.error && (updateResult.error as any).code === '42703') {
  updateResult = await db.from('orders').update({notes:notesText}).eq('id',order.id).select('id').maybeSingle()
 }
 checked(updateResult)
 return NextResponse.json({success:true,address:'GPS pin shared with courier'})
})
