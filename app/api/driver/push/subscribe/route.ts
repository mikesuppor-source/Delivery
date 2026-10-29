import { NextResponse } from 'next/server'
import { api, ApiError, checked, textField } from '@/lib/api'
import { driverAccess } from '@/lib/access'
import { isPushConfigured, sendPushToDriver } from '@/lib/push'

export const POST = api(async req => {
  const body = await req.json()
  const { db, driver } = await driverAccess(body.driverId)
  const { subscription, test } = body

  if (test) {
    if (!isPushConfigured()) throw new ApiError(503, 'Background alerts are not set up on this server yet')
    const res = await sendPushToDriver(driver.id, {
      title: 'Cedar Delivery Alert',
      body: 'Background notifications active! You will be alerted when new orders are assigned.',
      url: `/driver/${driver.id}`,
      tag: 'test-notification',
    })
    return NextResponse.json({ success: true, sent: res.sent, failed: res.failed, errors: res.errors })
  }

  if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    throw new ApiError(400, 'Valid subscription object is required')
  }
  const endpoint = textField(subscription.endpoint, 'push endpoint', 1000, true)
  if (!endpoint.startsWith('https://')) throw new ApiError(400, 'Invalid push endpoint')

  checked(
    await db
      .from('driver_push_subscriptions')
      .upsert(
        {
          driver_id: driver.id,
          endpoint,
          p256dh: textField(subscription.keys.p256dh, 'push key', 200, true),
          auth: textField(subscription.keys.auth, 'push auth', 200, true),
          user_agent: req.headers.get('user-agent')?.slice(0, 300) || null,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      )
      .select('id')
  )

  return NextResponse.json({ success: true, message: 'Push subscription registered' })
})

export const DELETE = api(async req => {
  const body = await req.json()
  const { db, driver } = await driverAccess(body.driverId)
  const endpoint = textField(body.endpoint, 'push endpoint', 1000, true)

  await db
    .from('driver_push_subscriptions')
    .delete()
    .eq('driver_id', driver.id)
    .eq('endpoint', endpoint)

  return NextResponse.json({ success: true })
})
