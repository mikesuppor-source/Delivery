'use client'

import React from 'react'
import { useShopProfile } from '../context'
import {
  formatUSD,
  formatLBP,
  getDateRangeLabel,
  DateRangePreset,
} from '@/lib/utils'

export function KpiSection() {
  const {
    datePreset,
    setDatePreset,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    sortBy,
    setSortBy,
    currentBalanceUSD,
    currentBalanceLBP,
    totalCodCollectedUSD,
    totalCodCollectedLBP,
    totalDeliveryFeesUSD,
    totalDeliveryFeesLBP,
    totalOrdersCount,
    deliveredCount,
    activeCount,
    returnedCount,
    completionRate,
    totalNetShopCreditedUSD,
    totalPayoutsUSD,
    totalPayoutsLBP,
  } = useShopProfile()

  return (
    <>
      {/* ─── Date Range & Timeframe Filter Toolbar (This Month, Last Month, Last Year, etc.) ─── */}
      <div
        className="panel"
        style={{
          padding: '14px 20px',
          marginBottom: 20,
          background: 'var(--surface)',
          border: '1.5px solid var(--line)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          {/* Preset Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginRight: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              Timeframe:
            </span>
            {[
              { id: 'all', label: 'All Time' },
              { id: 'today', label: 'Today' },
              { id: 'this_month', label: 'This Month' },
              { id: 'last_month', label: 'Last Month' },
              { id: 'this_year', label: 'This Year' },
              { id: 'last_year', label: 'Last Year' },
              { id: 'custom', label: 'Custom Range' },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDatePreset(tab.id as DateRangePreset)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 99,
                  fontSize: 12,
                  fontWeight: 600,
                  border: '1px solid',
                  cursor: 'pointer',
                  background: datePreset === tab.id ? 'var(--brand)' : 'var(--bg)',
                  color: datePreset === tab.id ? '#fff' : 'var(--muted)',
                  borderColor: datePreset === tab.id ? 'var(--brand)' : 'var(--line)',
                  transition: 'all .12s',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sort Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Sort by:</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              style={{
                fontSize: 12,
                padding: '5px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
                background: 'var(--bg)',
                color: 'var(--text)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <option value="newest">Newest Orders First</option>
              <option value="oldest">Oldest Orders First</option>
              <option value="collection_high">Highest COD Collection ($)</option>
              <option value="net_high">Highest Net Store Credit ($)</option>
              <option value="fee_high">Highest Delivery Fee ($)</option>
            </select>
          </div>
        </div>

        {/* Custom Date Pickers if 'custom' is active */}
        {datePreset === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <label style={{ fontWeight: 600, color: 'var(--muted)' }}>From:</label>
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--line)', background: 'var(--bg)' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <label style={{ fontWeight: 600, color: 'var(--muted)' }}>To:</label>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--line)', background: 'var(--bg)' }}
              />
            </div>
          </div>
        )}

        {/* Period Active Helper Banner */}
        {datePreset !== 'all' && (
          <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--brand)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Showing stats and orders for:</span>
            <span style={{ background: 'var(--brand-light)', padding: '2px 8px', borderRadius: 4 }}>
              {getDateRangeLabel(datePreset, customStart, customEnd)}
            </span>
            <button
              type="button"
              onClick={() => setDatePreset('all')}
              style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}
            >
              Reset to All Time
            </button>
          </div>
        )}
      </div>

      {/* ─── Executive KPI Cards (Balance Owed, COD Collected, Delivery Fees, Orders) ─── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {/* Metric 1: Net Account Position (Payable vs Receivable) */}
        <div
          style={{
            background: 'var(--surface)',
            border: currentBalanceUSD > 0
              ? '2px solid rgba(20, 83, 45, 0.4)'
              : currentBalanceUSD < 0
              ? '2px solid rgba(2, 132, 199, 0.4)'
              : '1.5px solid var(--line)',
            borderRadius: 'var(--radius)',
            padding: '20px 22px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 4,
              background: currentBalanceUSD > 0 ? 'var(--brand)' : currentBalanceUSD < 0 ? '#0284c7' : '#9ca3af',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                color: currentBalanceUSD > 0 ? 'var(--brand)' : currentBalanceUSD < 0 ? '#0284c7' : 'var(--muted)',
              }}
            >
              {currentBalanceUSD > 0
                ? 'We Owe Merchant (Desk → Shop)'
                : currentBalanceUSD < 0
                ? 'Merchant Owes Desk (Shop → Desk)'
                : 'Account Balance Settled'}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 99,
                background: currentBalanceUSD > 0 ? 'var(--brand-light)' : currentBalanceUSD < 0 ? '#e0f2fe' : 'var(--bg)',
                color: currentBalanceUSD > 0 ? 'var(--brand)' : currentBalanceUSD < 0 ? '#0369a1' : 'var(--muted)',
              }}
            >
              {currentBalanceUSD > 0 ? 'Payout Pending' : currentBalanceUSD < 0 ? 'Collection Due' : 'All Settled'}
            </span>
          </div>

          <strong
            style={{
              fontSize: 28,
              fontWeight: 800,
              display: 'block',
              letterSpacing: '-0.5px',
              color: currentBalanceUSD > 0 ? 'var(--brand)' : currentBalanceUSD < 0 ? '#0284c7' : 'var(--text)',
            }}
          >
            {formatUSD(currentBalanceUSD)}
          </strong>

          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginTop: 2 }}>
            ≈ {formatLBP(currentBalanceLBP)}
          </div>

          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            {currentBalanceUSD > 0 ? (
              <>The shop wants cash from company (accumulated COD)</>
            ) : currentBalanceUSD < 0 ? (
              <span style={{ color: '#0369a1', fontWeight: 600 }}>The company needs cash from shop (delivery fees / debt)</span>
            ) : (
              <>No outstanding balance between company and store.</>
            )}
          </div>
        </div>

        {/* Metric 2: Total COD Collected */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1.5px solid var(--line)',
            borderRadius: 'var(--radius)',
            padding: '20px 22px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--muted)' }}>
              Gross COD Collected
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'var(--bg)', color: 'var(--muted)' }}>
              From Recipients
            </span>
          </div>

          <strong style={{ fontSize: 28, fontWeight: 800, display: 'block', color: 'var(--text)', letterSpacing: '-0.5px' }}>
            {formatUSD(totalCodCollectedUSD)}
          </strong>

          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginTop: 2 }}>
            ≈ {formatLBP(totalCodCollectedLBP)}
          </div>

          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            From <strong>{deliveredCount}</strong> delivered packages
          </div>
        </div>

        {/* Metric 3: Total Delivery Fees */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1.5px solid var(--line)',
            borderRadius: 'var(--radius)',
            padding: '20px 22px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--muted)' }}>
              Delivery Fees Charged
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'var(--bg)', color: 'var(--muted)' }}>
              Service Fees
            </span>
          </div>

          <strong style={{ fontSize: 28, fontWeight: 800, display: 'block', color: '#2563eb', letterSpacing: '-0.5px' }}>
            {formatUSD(totalDeliveryFeesUSD)}
          </strong>

          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginTop: 2 }}>
            ≈ {formatLBP(totalDeliveryFeesLBP)}
          </div>

          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            {returnedCount > 0
              ? `Deducted from collections (incl. ${returnedCount} refund fees @ $2)`
              : 'Deducted from gross collections'}
          </div>
        </div>

        {/* Metric 4: Total Orders Handled */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1.5px solid var(--line)',
            borderRadius: 'var(--radius)',
            padding: '20px 22px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--muted)' }}>
              Total Orders Received
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 99,
                background: completionRate >= 90 ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg)',
                color: completionRate >= 90 ? '#065f46' : 'var(--muted)',
              }}
            >
              {completionRate.toFixed(0)}% Delivered
            </span>
          </div>

          <strong style={{ fontSize: 28, fontWeight: 800, display: 'block', color: 'var(--text)', letterSpacing: '-0.5px' }}>
            {totalOrdersCount}
          </strong>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, marginTop: 4 }}>
            <span style={{ color: '#059669', fontWeight: 600 }}>{deliveredCount} Delivered</span>
            <span style={{ color: 'var(--line)' }}>•</span>
            <span style={{ color: '#2563eb', fontWeight: 600 }}>{activeCount} Active</span>
            {returnedCount > 0 && (
              <>
                <span style={{ color: 'var(--line)' }}>•</span>
                <span style={{ color: '#dc2626', fontWeight: 600 }}>{returnedCount} Ret.</span>
              </>
            )}
          </div>

          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            Lifetime payouts paid: <strong>{formatUSD(totalPayoutsUSD)}</strong>
          </div>
        </div>
      </div>

      {/* ─── Financial P&L Breakdown Banner ─── */}
      <div
        className="panel"
        style={{
          padding: '16px 22px',
          marginBottom: 24,
          background: 'var(--bg)',
          border: '1.5px solid var(--line)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 14,
            fontSize: 13,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, color: 'var(--text)' }}>Store P&L Flow:</span>
            <span style={{ color: 'var(--muted)' }}>
              Gross COD <strong>{formatUSD(totalCodCollectedUSD)}</strong>
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626' }} />
              <span>
                Delivery Fees: <strong>-{formatUSD(totalDeliveryFeesUSD)}</strong>
              </span>
            </div>

            <span style={{ color: 'var(--muted)' }}>=</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
              <span>
                Net Deliveries: <strong>{formatUSD(totalNetShopCreditedUSD)}</strong>
              </span>
            </div>

            <span style={{ color: 'var(--muted)' }}>|</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }} />
              <span>
                Total Payouts Handed: <strong>{formatUSD(totalPayoutsUSD)}</strong> ({formatLBP(totalPayoutsLBP)})
              </span>
            </div>

            <span style={{ color: 'var(--muted)' }}>|</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand)' }} />
              <span style={{ color: 'var(--brand)', fontWeight: 700 }}>
                Unsettled Due: <strong>{formatUSD(currentBalanceUSD)}</strong>
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
