import { allRows } from '@/lib/pagination'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Courier Run Sheet Portal | Cedar Delivery',
  description: 'Select your courier profile to access your live daily delivery run sheet.',
}

export default async function DriverPortalIndexPage() {
  const userSupabase = await createClient()
  const { data: { user } } = await userSupabase.auth.getUser()

  const serviceSupabase = await createClient()

  // If logged in, check if user is directly linked to a driver
  if (user?.id) {
    const { data: linkedDriver } = await serviceSupabase
      .from('drivers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (linkedDriver?.id) {
      redirect(`/driver/${linkedDriver.id}`)
    }
  }

  // Fetch active drivers and their open orders count
  const { data: drivers } = await allRows(serviceSupabase
    .from('drivers')
    .select('id, name, phone, active')
    .eq('active', true)
    .order('name'))

  // Fetch count of pending orders for each driver
  const { data: pendingOrders } = await allRows(serviceSupabase
    .from('orders')
    .select('driver_id')
    .in('status', ['assigned', 'picked_up'])
    .not('driver_id', 'is', null))

  const countsByDriver: Record<string, number> = {}
  for (const o of pendingOrders || []) {
    if (o.driver_id) {
      countsByDriver[o.driver_id] = (countsByDriver[o.driver_id] || 0) + 1
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#090d16',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '24px 16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: 28, paddingTop: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
              boxShadow: '0 8px 24px rgba(16, 185, 129, 0.3)',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="1" y="3" width="15" height="13" />
              <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
              <circle cx="5.5" cy="18.5" r="2.5" />
              <circle cx="18.5" cy="18.5" r="2.5" />
            </svg>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>
            Cedar Courier Portal
          </h1>
          <p style={{ margin: '6px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
            Select your courier profile to open your live daily run sheet
          </p>
        </div>

        {/* Courier List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(!drivers || drivers.length === 0) ? (
            <div
              style={{
                background: '#131b2e',
                border: '1px solid #1e293b',
                borderRadius: 16,
                padding: '32px 20px',
                textAlign: 'center',
                color: '#94a3b8',
                fontSize: 14,
              }}
            >
              No active couriers found. Please ask dispatch to add or activate your profile.
            </div>
          ) : (
            drivers.map(d => {
              const pendingCount = countsByDriver[d.id] || 0
              const initials = d.name
                .split(' ')
                .map((n: string) => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase() || 'C'

              return (
                <Link
                  key={d.id}
                  href={`/driver/${d.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 18px',
                    background: '#131b2e',
                    border: '1px solid #1e293b',
                    borderRadius: 14,
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 16,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
                      }}
                    >
                      {initials}
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
                        {d.name}
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                        {d.phone || 'No phone'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {pendingCount > 0 ? (
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          padding: '3px 9px',
                          borderRadius: 20,
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#34d399',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                        }}
                      >
                        {pendingCount} to deliver
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: 12,
                          color: '#64748b',
                        }}
                      >
                        Idle
                      </span>
                    )}

                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </Link>
              )
            })
          )}
        </div>

        {/* Dispatch link */}
        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <Link
            href="/orders"
            style={{
              fontSize: 13,
              color: '#94a3b8',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Switch to Dispatch Desk
          </Link>
        </div>
      </div>
    </div>
  )
}
