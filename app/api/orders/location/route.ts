import { NextResponse } from 'next/server'
import { api, ApiError, checked } from '@/lib/api'
import { parseBody, text, z } from '@/lib/validation'
import { createServiceClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
const SharePin=z.object({
 token:z.string().regex(/^[a-f0-9]{64}$/),
 lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180),
 extraNotes:text(500),
})
export const POST=api(async req=>{
 const body=await parseBody(req,SharePin)
 await rateLimit('location:'+body.token,5)
 const db=createServiceClient()
 const {data:order}=await db.from('orders').select('id,recipient_address,notes,updated_at').eq('tracking_token',body.token).in('status',['pending','assigned','picked_up','failed']).gt('created_at',new Date(Date.now()-30*86400000).toISOString()).maybeSingle()
 if(!order)throw new ApiError(404,'Location sharing is unavailable for this delivery')
 const note=body.extraNotes
 const notesText=note?((order.notes||'')+' [Location: '+note+']').slice(-4000):order.notes
 checked(await db.from('orders').update({location_lat:body.lat,location_lng:body.lng,notes:notesText}).eq('id',order.id).select('id').maybeSingle())
 return NextResponse.json({success:true,address:'GPS pin shared with courier'})
})
