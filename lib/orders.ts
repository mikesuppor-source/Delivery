import type { Database } from './supabase/database.types'
import { ApiError, money, textField } from './api'
import type { OrderStatus } from './roles'
export const ORDER_SELECT = '*, shop:shop_id(id,name,phone), driver:driver_id(id,name,phone), area:area_id(id,name,fee_usd,driver_pay_usd,return_fee_usd,return_driver_pay_usd)'
const statuses = ['pending','assigned','picked_up','delivered','failed','returned','cancelled']

export interface ReturnPricing { returnFeeUsd: number; returnDriverPayUsd: number }

export function orderPatch(body: Record<string, unknown>, order: Record<string, unknown>, driver = false, returnPricing?: ReturnPricing) {
  if (order.is_held && (body.driverId || ['assigned', 'picked_up', 'delivered'].includes(String(body.status)))) {
    throw new ApiError(400, 'Cannot assign or dispatch a held order until released from warehouse')
  }
  const updates: Record<string, unknown> = {}
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !statuses.includes(body.status)) throw new ApiError(400, 'Invalid order status')
    if (driver && body.status !== order.status) {
      const allowed: Record<string, string[]> = { assigned:['picked_up','failed'], picked_up:['delivered','failed','returned'], failed:['picked_up','returned'] }
      if (!allowed[String(order.status)]?.includes(body.status)) throw new ApiError(409, 'This delivery transition is not allowed')
    }
    updates.status = body.status as OrderStatus
    if (body.status === 'returned' && order.status !== 'returned') {
      updates.collection_usd = 0
      updates.delivery_fee_usd = returnPricing ? returnPricing.returnFeeUsd : 2
      updates.driver_pay_usd = returnPricing
        ? returnPricing.returnDriverPayUsd
        : Math.min(1, Number(order.driver_pay_usd))
    }
  }
  if (body.notes !== undefined) updates.notes = textField(body.notes, 'notes', 4000)
  if (body.failureReason) updates.notes = '[Failed: ' + textField(body.failureReason, 'failure reason', 200) + '] ' + (updates.notes || '')
  if (!driver) {
    for (const [input,column] of Object.entries({recipientName:'recipient_name',recipientPhone:'recipient_phone',recipientAddress:'recipient_address'}))
      if (body[input] !== undefined) updates[column] = textField(body[input],input,1000)
    for (const [input,column] of Object.entries({collectionUsd:'collection_usd',deliveryFeeUsd:'delivery_fee_usd',driverPayUsd:'driver_pay_usd'}))
      if (body[input] !== undefined) updates[column] = money(body[input],input)
    if (body.serviceType !== undefined) {
      const validTypes = ['delivery', 'replacement', 'pickup']
      if (typeof body.serviceType === 'string' && validTypes.includes(body.serviceType)) {
        updates.service_type = body.serviceType as Database['public']['Enums']['order_service_type']
      }
    }
    if (body.weightKg !== undefined) updates.weight_kg = Math.max(0.1, Math.round(Number(body.weightKg) * 100) / 100 || 1.0)
    if (body.isBreakable !== undefined) updates.is_breakable = Boolean(body.isBreakable)
    if (body.paymentMethod !== undefined) updates.payment_method = textField(body.paymentMethod, 'payment method', 40)
    if (body.carrierName !== undefined) updates.carrier_name = textField(body.carrierName, 'carrier name', 100)
    if (body.carrierTrackingCode !== undefined) updates.carrier_tracking_code = textField(body.carrierTrackingCode, 'carrier tracking code', 100)
    if (body.destinationGovernorate !== undefined) updates.destination_governorate = textField(body.destinationGovernorate, 'governorate', 100)
    if (body.destinationCaza !== undefined) updates.destination_caza = textField(body.destinationCaza, 'caza', 100)
    if (body.destinationTown !== undefined) updates.destination_town = textField(body.destinationTown, 'town', 100)
    if (body.driverId !== undefined) {
      updates.driver_id = body.driverId || null
      if (order.status === 'pending' && body.driverId && !body.status) updates.status='assigned'
    }
    if (body.areaId !== undefined) updates.area_id=body.areaId || null
    if (body.receivedAtHub) updates.received_at_hub = new Date().toISOString()
  }
  for (const [input,column] of Object.entries({podCollectedUsd:'pod_collected_usd',podCollectedLbp:'pod_collected_lbp'}))
    if (body[input] !== undefined) updates[column]=money(body[input],input)
  // Require exact tender totals or an explicit discrepancy reason
  if (updates.status === 'delivered' && (body.podCollectedUsd !== undefined || body.podCollectedLbp !== undefined)) {
    const usd = Number(updates.pod_collected_usd ?? order.pod_collected_usd ?? 0)
    const lbp = Number(updates.pod_collected_lbp ?? order.pod_collected_lbp ?? 0)
    const expected = Number(updates.collection_usd ?? order.collection_usd)
    const rate = Number(order.usd_to_lbp_rate) || 89500
    const diff = Math.round((usd + lbp / rate - expected) * 100) / 100
    if (Math.abs(diff) > 0.02) {
      if (body.discrepancyReason) {
        const reason = textField(body.discrepancyReason, 'discrepancy reason', 200)
        updates.notes = `[Cash Discrepancy: ${diff > 0 ? '+' : ''}${diff}$ - ${reason}] ` + (updates.notes || order.notes || '')
      } else {
        throw new ApiError(400, `Collected cash differs by ${Math.abs(diff).toFixed(2)}$ from expected amount. Provide a discrepancy reason or adjust tender.`)
      }
    }
  }
  return updates as Database['public']['Tables']['orders']['Update']
}
