'use client'

import React, { useMemo, useState } from 'react'
import { formatUSD, formatLBP } from '@/lib/utils'
import { useRunSheet } from '../context'

export function EarningsView() {
  const { driver, orders } = useRunSheet()
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today')

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

  const earningsByPeriod = useMemo(() => {
    function computeForPeriod(filterFn: (dateMs: number) => boolean) {
      const deliveredOrders = orders.filter(o => {
        if (o.status !== 'delivered') return false
        const time = new Date(o.delivered_at || o.created_at).getTime()
        return filterFn(time)
      })

      const returnedOrders = orders.filter(o => {
        if (o.status !== 'returned') return false
        const time = new Date(o.created_at).getTime()
        return filterFn(time)
      })

      const deliveriesCount = deliveredOrders.length
      const returnsCount = returnedOrders.length
      const payEarnedUsd =
        deliveredOrders.reduce((sum, o) => sum + Number(o.driver_pay_usd || 0), 0) +
        returnedOrders.reduce((sum, o) => sum + Number(o.driver_pay_usd || 0), 0)

      const cashCollectedUsd = deliveredOrders.reduce((sum, o) => sum + Number(o.collection_usd || 0), 0)
      const cashCollectedLbp = deliveredOrders.reduce((sum, o) => sum + Number(o.pod_collected_lbp || 0), 0)

      return {
        deliveriesCount,
        returnsCount,
        payEarnedUsd,
        cashCollectedUsd,
        cashCollectedLbp,
      }
    }

    return {
      today: computeForPeriod(t => t >= todayStart),
      week: computeForPeriod(t => t >= weekStart),
      month: computeForPeriod(t => t >= monthStart),
    }
  }, [orders, todayStart, weekStart, monthStart])

  const current = earningsByPeriod[period]

  // Total cash currently held on hand by courier
  const totalCashHeldUsd = Number(driver.cash_held_usd || 0) || current.cashCollectedUsd
  const totalCashHeldLbp = Number((driver as any).cash_held_lbp || 0) || current.cashCollectedLbp

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#f8fafc' }}>
          Courier Earnings & Cash Handover
        </h2>
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
          Your completed deliveries, commission earned, and COD cash to hand over
        </div>
      </div>

      {/* Period Tabs */}
      <div style={{ display: 'flex', background: '#1e293b', padding: 4, borderRadius: 10, gap: 4 }}>
        {(['today', 'week', 'month'] as const).map(p => {
          const isSelected = period === p
          const label = p === 'today' ? 'Today' : p === 'week' ? 'This Week' : 'This Month'
          return (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 8,
                border: 'none',
                background: isSelected ? '#15803d' : 'transparent',
                color: isSelected ? '#fff' : '#94a3b8',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Commission Earned Card */}
      <div
        style={{
          background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
          borderRadius: 14,
          padding: 20,
          color: '#ffffff',
          boxShadow: '0 4px 20px rgba(22, 101, 52, 0.3)',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.9 }}>
          Courier Commission Earned ({period})
        </div>
        <div style={{ fontSize: 36, fontWeight: 900, margin: '6px 0' }}>
          {formatUSD(current.payEarnedUsd)}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 13 }}>
          <div>
            <span style={{ opacity: 0.8 }}>Deliveries: </span>
            <strong>{current.deliveriesCount}</strong>
          </div>
          <div>
            <span style={{ opacity: 0.8 }}>Returns: </span>
            <strong>{current.returnsCount}</strong>
          </div>
        </div>
      </div>

      {/* COD Cash to Hand Over Box */}
      <div
        style={{
          background: '#0f172a',
          border: '1.5px solid #334155',
          borderRadius: 14,
          padding: 20,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc', marginBottom: 12 }}>
          💼 Cash Held to Hand Over (To Office / Desk)
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div style={{ background: '#1e293b', padding: 14, borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
              USD Cash
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#22c55e', marginTop: 4 }}>
              {formatUSD(totalCashHeldUsd)}
            </div>
          </div>

          <div style={{ background: '#1e293b', padding: 14, borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
              LBP Cash
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#38bdf8', marginTop: 4 }}>
              {formatLBP(totalCashHeldLbp)}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 12, color: '#94a3b8', background: 'rgba(255, 255, 255, 0.03)', padding: 10, borderRadius: 8 }}>
          ℹ️ When you finish your route, hand this cash to the dispatcher or desk manager. The office will record your remittance and print your settlement receipt.
        </div>
      </div>
    </div>
  )
}
