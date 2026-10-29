'use client'

import { PackageIcon } from '@/components/icons'
import { useRunSheet } from '../context'
import { OrderCard } from './order-card'
import { PickupsView } from './pickups-view'
import { EarningsView } from './earnings-view'

export function OrderList() {
  const { filterTab, filteredOrders, lang, t, handleOptimizeRoute, optimizingRoute } = useRunSheet()

  if (filterTab === 'pickups') {
    return <PickupsView />
  }

  if (filterTab === 'earnings') {
    return <EarningsView />
  }

  return (
    <>
        {/* ─── ROUTE OPTIMIZATION TOOLBAR (Active Stops) ─── */}
        {filterTab === 'to_deliver' && filteredOrders.length > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
              padding: '10px 14px',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 10,
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                {filteredOrders.length} Stops to Deliver
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                Organize stops in nearest-neighbour order from your GPS
              </div>
            </div>

            <button
              type="button"
              disabled={optimizingRoute}
              onClick={handleOptimizeRoute}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#fff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
              }}
            >
              <span>{optimizingRoute ? 'Optimizing…' : '⚡ Best Order'}</span>
            </button>
          </div>
        )}

        {/* ─── ORDER CARDS LIST ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredOrders.length === 0 ? (
            <div
              style={{
                background: '#1e293b',
                border: '1px dashed #334155',
                borderRadius: 12,
                padding: '36px 20px',
                textAlign: 'center',
                color: '#94a3b8',
              }}
            >
              <PackageIcon size={36} color="#64748b" />
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 10, color: '#f8fafc' }}>
                {t('noOrders')}
              </div>
              <p style={{ fontSize: 12, marginTop: 4, color: '#94a3b8' }}>
                {filterTab === 'to_deliver'
                  ? (lang === 'ar' ? 'تم تسليم جميع الطلبات المعينة أو لا توجد طرود حالياً.' : 'All assigned deliveries have been completed or no orders are currently out for delivery.')
                  : (lang === 'ar' ? 'جرّب اختيار تبويب آخر من الأعلى.' : 'Try selecting a different filter above.')}
              </p>
            </div>
          ) : (
            filteredOrders.map((order, idx) => (
              <OrderCard
                key={order.id}
                order={order}
                idx={idx}
                isFirst={idx === 0}
                isLast={idx === filteredOrders.length - 1}
              />
            ))
          )}
        </div>
    </>
  )
}
