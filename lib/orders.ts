import type { Database } from './supabase/database.types'
import { ApiError, money, textField } from './api'
import type { OrderStatus } from './roles'
export const ORDER_SELECT = '*, shop:shop_id(id,name,phone), driver:driver_id(id,name,phone), area:area_id(id,name,fee_usd)'
const statuses = ['pending','assigned','picked_up','delivered','failed','returned','cancelled']
export function orderPatch(body: Record<string, unknown>, order: Record<string, unknown>, driver = false) {
  const updates: Record<string, unknown> = {}
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !statuses.includes(body.status)) throw new ApiError(400, 'Invalid order status')
    if (driver && body.status !== order.status) {
      const allowed: Record<string, string[]> = { assigned:['picked_up','failed'], picked_up:['delivered','failed','returned'], failed:['picked_up','returned'] }
      if (!allowed[String(order.status)]?.includes(body.status)) throw new ApiError(409, 'This delivery transition is not allowed')
    }
    updates.status = body.status as OrderStatus
    if (body.status === 'returned' && order.status !== 'returned') {
      updates.collection_usd = 0; updates.delivery_fee_usd = 2; updates.driver_pay_usd = Math.min(1, Number(order.driver_pay_usd))
    }
  }
  if (body.notes !== undefined) updates.notes = textField(body.notes, 'notes', 4000)
  if (body.failureReason) updates.notes = '[Failed: ' + textField(body.failureReason, 'failure reason', 200) + '] ' + (updates.notes || '')
  if (!driver) {
    for (const [input,column] of Object.entries({recipientName:'recipient_name',recipientPhone:'recipient_phone',recipientAddress:'recipient_address'}))
      if (body[input] !== undefined) updates[column] = textField(body[input],input,1000)
    for (const [input,column] of Object.entries({collectionUsd:'collection_usd',deliveryFeeUsd:'delivery_fee_usd',driverPayUsd:'driver_pay_usd'}))
      if (body[input] !== undefined) updates[column] = money(body[input],input)
    if (body.driverId !== undefined) {
      updates.driver_id = body.driverId || null
      if (order.status === 'pending' && body.driverId && !body.status) updates.status='assigned'
    }
    if (body.areaId !== undefined) updates.area_id=body.areaId || null
  }
  for (const [input,column] of Object.entries({podCollectedUsd:'pod_collected_usd',podCollectedLbp:'pod_collected_lbp'}))
    if (body[input] !== undefined) updates[column]=money(body[input],input)
  // Require exact tender totals; shortage/change approval is a separate future workflow.
  if (updates.status === 'delivered' && (body.podCollectedUsd !== undefined || body.podCollectedLbp !== undefined)) {
    const usd=Number(updates.pod_collected_usd ?? order.pod_collected_usd ?? 0)
    const lbp=Number(updates.pod_collected_lbp ?? order.pod_collected_lbp ?? 0)
    const expected=Number(updates.collection_usd ?? order.collection_usd)
    if (Math.abs(usd + lbp / Number(order.usd_to_lbp_rate) - expected)>0.02) throw new ApiError(400,'Collected cash must match the amount due')
  }
  return updates as Database['public']['Tables']['orders']['Update']
}
