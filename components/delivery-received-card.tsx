import { createServiceClient } from '@/lib/supabase/server'
import { DeliveryReceivedButtons } from './delivery-received-buttons'

/** "Did you receive your parcel?" on the customer's private link after delivery. It shows the answer once given. */
export async function DeliveryReceivedCard({ orderId, trackingToken }: { orderId: string; trackingToken: string }) {
  const { data } = await createServiceClient().from('orders').select('customer_confirmed_at, customer_disputed_at, delivered_at').eq('id', orderId).maybeSingle()
  if (!data) return null
  const answered = data.customer_confirmed_at ? 'confirmed' : data.customer_disputed_at ? 'disputed' : null
  const open = !answered && (!data.delivered_at || Date.now() - new Date(data.delivered_at).getTime() < 14 * 86_400_000)
  if (!answered && !open) return null
  return <DeliveryReceivedButtons trackingToken={trackingToken} answered={answered} />
}
