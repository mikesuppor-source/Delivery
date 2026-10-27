import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPushToDriver } from '@/lib/push'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { driverId, subscription, test } = body

    if (!driverId) {
      return NextResponse.json({ error: 'driverId is required' }, { status: 400 })
    }

    if (test) {
      const res = await sendPushToDriver(driverId, {
        title: 'Cedar Delivery Alert',
        body: 'Background notifications active! You will be alerted when new orders are assigned.',
        url: `/driver/${driverId}`,
        tag: 'test-notification',
      })
      return NextResponse.json({ success: true, sent: res.sent, failed: res.failed, errors: res.errors })
    }

    if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return NextResponse.json({ error: 'Valid subscription object is required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Upsert subscription
    const { error } = await supabase
      .from('driver_push_subscriptions')
      .upsert(
        {
          driver_id: driverId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          user_agent: req.headers.get('user-agent') || null,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      )

    if (error) {
      console.error('[Push Subscription Upsert Error]:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Push subscription registered' })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    const { driverId, endpoint } = body

    if (!driverId || !endpoint) {
      return NextResponse.json({ error: 'driverId and endpoint are required' }, { status: 400 })
    }

    const supabase = createServiceClient()
    await supabase
      .from('driver_push_subscriptions')
      .delete()
      .eq('driver_id', driverId)
      .eq('endpoint', endpoint)

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
