import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase/server'

export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  'BNuDgLL_EdWvNDLSM2vA5ER-OAsBwoKaT9JadeksO4nD5IHeE4HXX8TOg_uez1wiJ-PSslp1dKHejy-DxKbXuHw'

export const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY || 'nGaGfABppdxvBJTDl2UY2EhVNGAVC_6EwTBc7Lhjiwk'

export const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || 'mailto:dispatch@cedardelivery.com'

try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
} catch (_e) {
  void _e
}

export interface DriverPushPayload {
  title: string
  body: string
  url?: string
  tag?: string
  icon?: string
  badge?: string
}

/**
 * Sends a background web push notification to all active devices registered to a driver.
 * Automatically cleans up expired or unsubscribed endpoints (HTTP 404 / 410).
 */
export async function sendPushToDriver(
  driverId: string,
  payload: DriverPushPayload
): Promise<{ sent: number; failed: number }> {
  if (!driverId) return { sent: 0, failed: 0 }

  const supabase = createServiceClient()
  const { data: subs, error } = await supabase
    .from('driver_push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('driver_id', driverId)

  if (error || !subs || subs.length === 0) {
    return { sent: 0, failed: 0 }
  }

  const notificationData = JSON.stringify({
    title: payload.title || 'Cedar Delivery',
    body: payload.body || 'New delivery assigned',
    url: payload.url || `/driver/${driverId}`,
    tag: payload.tag || 'cedar-dispatch',
    icon: payload.icon || '/logo.png',
    badge: payload.badge || '/logo.png',
  })

  let sent = 0
  let failed = 0
  const staleSubIds: string[] = []

  await Promise.allSettled(
    subs.map(async sub => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          notificationData
        )
        sent++
        await supabase
          .from('driver_push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', sub.id)
      } catch (err: any) {
        failed++
        const statusCode = err?.statusCode || err?.status
        if (statusCode === 404 || statusCode === 410) {
          // Push subscription is no longer valid or user revoked permissions
          staleSubIds.push(sub.id)
        }
      }
    })
  )

  if (staleSubIds.length > 0) {
    await supabase.from('driver_push_subscriptions').delete().in('id', staleSubIds)
  }

  return { sent, failed }
}
