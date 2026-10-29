import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase/server'

const DEFAULT_SUBJECT = 'mailto:dispatch@cedardelivery.com'

/**
 * Push notifications are signed with a key pair that lives in the hosting settings only:
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (make a pair with `npx web-push generate-vapid-keys`).
 * Never write the private key in the code. This repository is public, and whoever holds the private key can
 * send notifications to couriers' phones. Without both settings push is simply off.
 */
export function isPushConfigured(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return false
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || DEFAULT_SUBJECT, publicKey, privateKey)
    return true
  } catch (_e) {
    void _e
    return false
  }
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
): Promise<{ sent: number; failed: number; errors?: string[] }> {
  if (!driverId) return { sent: 0, failed: 0, errors: ['No driverId provided'] }
  if (!isPushConfigured()) return { sent: 0, failed: 0, errors: ['Push notifications are not set up on this server'] }

  const supabase = createServiceClient()
  const { data: subs, error } = await supabase
    .from('driver_push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('driver_id', driverId)

  if (error || !subs || subs.length === 0) {
    return { sent: 0, failed: 0, errors: [error?.message || 'No subscriptions found for driver'] }
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
  const errorDetails: string[] = []
  const staleSubIds: string[] = []

  await Promise.allSettled(
    subs.map(async sub => {
      try {
        const pushOptions: webpush.RequestOptions = {
          TTL: 86400,
          urgency: 'high',
        }

        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          notificationData,
          pushOptions
        )
        sent++
        await supabase
          .from('driver_push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', sub.id)
      } catch (err: any) {
        failed++
        const statusCode = err?.statusCode || err?.status
        const detail = `${statusCode || 'unknown'}: ${err?.body || err?.message || JSON.stringify(err)}`
        errorDetails.push(detail)
        console.error('[WebPush Dispatch Failed]:', detail)
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

  return { sent, failed, errors: errorDetails }
}
