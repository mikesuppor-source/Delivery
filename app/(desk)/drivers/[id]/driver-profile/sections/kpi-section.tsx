'use client'

import React from 'react'
import { useDriverProfile } from '../context'
import {
  formatUSD,
  formatLBP,
  usdToLbp,
  getDateRangeLabel,
  DateRangePreset,
} from '@/lib/utils'

export function KpiSection() {
  const {
    driver,
    workspace,
    canManage,
    datePreset,
    setDatePreset,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    sortBy,
    setSortBy,
    totalOrdersCount,
    deliveredCount,
    activeCount,
    returnedCount,
    completionRate,
    totalDriverEarningsUSD,
    totalDriverEarningsLBP,
    avgDriverPay,
    totalGrossDeliveryFeesUSD,
    totalCompanyProfitUSD,
    totalCompanyProfitLBP,
    companyProfitMargin,
    avgCompanyProfit,
    totalCodCollectedUSD,
    totalCodCollectedLBP,
    openSettlement,
  } = useDriverProfile()

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
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Sort Orders:</label>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              style={{
                fontSize: 12,
                padding: '5px 10px',
                borderRadius: 6,
                border: '1px solid var(--line)',
                background: 'var(--bg)',
                color: 'var(--text)',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="pay_high">Highest Courier Pay</option>
              <option value="profit_high">Highest Company Profit</option>
              <option value="collection_high">Highest COD Collection</option>
            </select>
          </div>
        </div>

        {/* Custom Date Pickers */}
        {datePreset === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
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

      {/* ─── Executive KPI Cards (Total Orders, Driver Net, Company Profit, Balances) ─── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {/* Metric 1: Driver Net Earnings Made */}
        <div
          style={{
            background: 'var(--surface)',
            border: '2px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 'var(--radius)',
            padding: '20px 22px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: '#10b981' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#047857' }}>
              Driver Net Earned
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 99,
                background: 'rgba(16, 185, 129, 0.12)',
                color: '#065f46',
              }}
            >
              Take-home Pay
            </span>
          </div>

          <strong style={{ fontSize: 28, fontWeight: 800, display: 'block', color: 'var(--text)', letterSpacing: '-0.5px' }}>
            {formatUSD(totalDriverEarningsUSD)}
          </strong>

          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginTop: 2 }}>
            ≈ {formatLBP(totalDriverEarningsLBP)}
          </div>

          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            From <strong>{deliveredCount}</strong> delivered orders (avg <strong>{formatUSD(avgDriverPay)}</strong>/order)
          </div>
        </div>

        {/* Metric 2: Company Net Profit Generated */}
        <div
          style={{
            background: 'var(--surface)',
            border: '2px solid rgba(20, 83, 45, 0.35)',
            borderRadius: 'var(--radius)',
            padding: '20px 22px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'var(--brand)' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--brand)' }}>
              Profit for Company
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 99,
                background: 'var(--brand-light)',
                color: 'var(--brand)',
              }}
            >
              {companyProfitMargin.toFixed(0)}% Margin
            </span>
          </div>

          <strong style={{ fontSize: 28, fontWeight: 800, display: 'block', color: 'var(--brand)', letterSpacing: '-0.5px' }}>
            +{formatUSD(totalCompanyProfitUSD)}
          </strong>

          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginTop: 2 }}>
            ≈ {formatLBP(totalCompanyProfitLBP)}
          </div>

          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            Fees: <strong>{formatUSD(totalGrossDeliveryFeesUSD)}</strong> (avg <strong>+{formatUSD(avgCompanyProfit)}</strong>/order)
          </div>
        </div>

        {/* Metric 3: Total Orders Handled & Completion Rate */}
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
              Orders Processed
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 99,
                background: completionRate >= 80 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                color: completionRate >= 80 ? '#047857' : '#b91c1c',
              }}
            >
              {completionRate.toFixed(0)}% Success
            </span>
          </div>

          <strong style={{ fontSize: 28, fontWeight: 800, display: 'block', color: 'var(--text)', letterSpacing: '-0.5px' }}>
            {totalOrdersCount}
          </strong>

          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', marginTop: 2 }}>
            <span style={{ color: '#047857', fontWeight: 700 }}>{deliveredCount}</span> delivered •{' '}
            <span style={{ color: '#b45309', fontWeight: 700 }}>{activeCount}</span> in transit •{' '}
            <span style={{ color: '#dc2626', fontWeight: 700 }}>{returnedCount}</span> returned
          </div>

          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            Assigned during selected timeframe
          </div>
        </div>

        {/* Metric 4: Cash Held (COD Handed to Courier) */}
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
              Cash Held (Unremitted)
            </span>
            {canManage && (
              <button
                type="button"
                onClick={() => openSettlement('driver_cash_remittance')}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 99,
                  background: '#047857',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Remit
              </button>
            )}
          </div>

          <strong
            style={{
              fontSize: 28,
              fontWeight: 800,
              display: 'block',
              letterSpacing: '-0.5px',
              color: Number(driver.cash_held_usd) > 0 ? '#b45309' : 'var(--text)',
            }}
          >
            {formatUSD(Number(driver.cash_held_usd))}
          </strong>

          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginTop: 2 }}>
            ≈ {formatLBP(usdToLbp(Number(driver.cash_held_usd), workspace.usd_to_lbp))}
          </div>

          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            COD collected from customers to hand in
          </div>
        </div>

        {/* Metric 5: Pay Owed (Accumulated Earnings) */}
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
              Pay Owed (Pending)
            </span>
            {canManage && (
              <button
                type="button"
                onClick={() => openSettlement('driver_pay')}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 99,
                  background: 'var(--brand)',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Pay
              </button>
            )}
          </div>

          <strong
            style={{
              fontSize: 28,
              fontWeight: 800,
              display: 'block',
              letterSpacing: '-0.5px',
              color: Number(driver.pay_owed_usd) > 0 ? 'var(--brand)' : 'var(--text)',
            }}
          >
            {formatUSD(Number(driver.pay_owed_usd))}
          </strong>

          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginTop: 2 }}>
            ≈ {formatLBP(usdToLbp(Number(driver.pay_owed_usd), workspace.usd_to_lbp))}
          </div>

          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            Courier commissions owed by company
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
            <span style={{ fontWeight: 700, color: 'var(--text)' }}>Lifetime P&L Flow:</span>
            <span style={{ color: 'var(--muted)' }}>
              COD Collected <strong>{formatUSD(totalCodCollectedUSD)}</strong> ({formatLBP(totalCodCollectedLBP)})
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }} />
              <span>
                Gross Delivery Fees: <strong>{formatUSD(totalGrossDeliveryFeesUSD)}</strong>
              </span>
            </div>

            <span style={{ color: 'var(--muted)' }}>=</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
              <span>
                Driver Net: <strong>{formatUSD(totalDriverEarningsUSD)}</strong> (
                {totalGrossDeliveryFeesUSD > 0
                  ? ((totalDriverEarningsUSD / totalGrossDeliveryFeesUSD) * 100).toFixed(0)
                  : 0}
                %)
              </span>
            </div>

            <span style={{ color: 'var(--muted)' }}>+</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand)' }} />
              <span style={{ color: 'var(--brand)', fontWeight: 600 }}>
                Company Net Profit: <strong>+{formatUSD(totalCompanyProfitUSD)}</strong> (
                {companyProfitMargin.toFixed(0)}%)
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
