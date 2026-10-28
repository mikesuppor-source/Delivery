'use client'

import { PackageIcon } from '@/components/icons'
import { useRunSheet } from '../context'
import { OrderCard } from './order-card'

export function OrderList() {
  const { filterTab, filteredOrders, lang, t } = useRunSheet()
  return (
    <>
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
            filteredOrders.map((order, idx) => <OrderCard key={order.id} order={order} idx={idx} />)
          )}
        </div>
    </>
  )
}
