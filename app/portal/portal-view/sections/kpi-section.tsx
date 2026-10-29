'use client'

import React from 'react'
import { usePortal } from '../context'
import { formatUSD, formatLBP, usdToLbp } from '@/lib/utils'

export function KpiSection() {
  const {
    shop,
    rate,
    openCashoutModal,
    totalOrdersCount,
    inTransitCount,
    pendingCount,
    deliveredCount,
    totalCollectedUSD,
  } = usePortal()

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
      <div style={{ background: 'var(--surface)', border: '1.5px solid var(--line)', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Store Balance Owed
          </span>
          <div style={{ fontSize: 22, fontWeight: 900, color: Number(shop.balance_usd) >= 0 ? '#047857' : '#dc2626', marginTop: 4 }}>
            {formatUSD(Number(shop.balance_usd) || 0)}
          </div>
          <small style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginTop: 2 }}>
            {formatLBP(usdToLbp(Number(shop.balance_usd) || 0, rate))}
          </small>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={openCashoutModal}
          style={{
            marginTop: 10,
            fontSize: 11.5,
            fontWeight: 700,
            padding: '6px 10px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            background: 'rgba(4, 120, 87, 0.08)',
            borderColor: '#047857',
            color: '#047857',
          }}
        >
          <span>Request Payout / Cash-Out</span>
        </button>
      </div>

      <div style={{ background: 'var(--surface)', border: '1.5px solid var(--line)', borderRadius: 12, padding: '16px 18px' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
          Total Shipments
        </span>
        <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', marginTop: 4 }}>
          {totalOrdersCount}
        </div>
        <small style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginTop: 2 }}>
          All-time placed packages
        </small>
      </div>

      <div style={{ background: 'var(--surface)', border: '1.5px solid var(--line)', borderRadius: 12, padding: '16px 18px' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
          In Transit / Courier
        </span>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#2563eb', marginTop: 4 }}>
          {inTransitCount}
        </div>
        <small style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginTop: 2 }}>
          {pendingCount} waiting pickup at shop
        </small>
      </div>

      <div style={{ background: 'var(--surface)', border: '1.5px solid var(--line)', borderRadius: 12, padding: '16px 18px' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
          Delivered Successfully
        </span>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#059669', marginTop: 4 }}>
          {deliveredCount}
        </div>
        <small style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginTop: 2 }}>
          Total COD: {formatUSD(totalCollectedUSD)}
        </small>
      </div>
    </div>
  )
}
