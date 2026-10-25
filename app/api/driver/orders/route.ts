import { NextResponse } from 'next/server'
import { api, ApiError, checked, uuid } from '@/lib/api'
import { driverAccess } from '@/lib/access'
import { ORDER_SELECT, orderPatch } from '@/lib/orders'
import { savePod } from '@/lib/pod'
export const PATCH = api(async req => {
  const body=await req.json()
  const {db,driver}=await driverAccess(body.driverId)
  const order=checked(await db.from('orders').select('*').eq('id',uuid(body.orderId)).eq('driver_id',driver.id).eq('workspace_id',driver.workspace_id).single())
  if(!order) throw new ApiError(404,'Order not found')
  const updates=orderPatch(body,order,true)
  if(body.podPhoto) updates.pod_photo=await savePod(db,order.id,body.podPhoto,'photo')
  if(body.podSignature) updates.pod_signature=await savePod(db,order.id,body.podSignature,'signature')
  const updated=checked(await db.from('orders').update(updates).eq('id',order.id).eq('driver_id',driver.id).eq('updated_at',order.updated_at).select(ORDER_SELECT).maybeSingle())
  if(!updated) throw new ApiError(409,'Order changed. Refresh and try again.')
  return NextResponse.json({success:true,order:updated})
})
