import { NextResponse } from 'next/server'
import { api, ApiError, checked, ids } from '@/lib/api'
import { workspaceAccess, validateReferences } from '@/lib/access'
import { ORDER_SELECT, orderPatch } from '@/lib/orders'
import { fulfillShopifyOrder } from '@/lib/shopify-fulfillment'
export const POST = api(async req => {
  const body=await req.json()
  const {db,workspaceId}=await workspaceAccess(body.workspaceId)
  const selected=ids(body.orderIds)
  if(!['delete','assign_driver','update_status'].includes(body.action)) throw new ApiError(400,'Invalid bulk action')
  await validateReferences(db,workspaceId,{drivers:body.driverId})
  const orders=checked(await db.from('orders').select('*').in('id',selected).eq('workspace_id',workspaceId))
  if(orders.length!==selected.length) throw new ApiError(403,'Some orders are not accessible')
  if(body.action==='delete' && orders.some(o=>o.status!=='pending')) throw new ApiError(409,'Only pending orders may be cancelled')
  const updatedOrders=[], failures=[]
  for(const order of orders) {
    try {
      const patch=body.action==='delete'?{status:'cancelled' as const}:orderPatch(body.action==='assign_driver'?{driverId:body.driverId}:body,order)
      const updated=checked(await db.from('orders').update(patch).eq('id',order.id).eq('updated_at',order.updated_at).select(ORDER_SELECT).maybeSingle())
      if(!updated) throw new ApiError(409,'Order changed concurrently')
      updatedOrders.push(updated)
      if (updated.status === 'delivered') {
        fulfillShopifyOrder(db, order.id).catch(e => console.error('Shopify fulfillment sync failed:', e))
      }
    } catch(error) { failures.push({id:order.id,error:error instanceof Error?error.message:'Update failed'}) }
  }
  return NextResponse.json({success:failures.length===0,count:updatedOrders.length,orders:updatedOrders,deletedIds:body.action==='delete'?updatedOrders.map(o=>o.id):undefined,failures})
})
