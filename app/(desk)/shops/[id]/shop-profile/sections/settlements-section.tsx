'use client'

import React from 'react'
import Image from 'next/image'
import { useShopProfile } from '../context'
import {
  formatUSD,
  formatLBP,
  usdToLbp,
  formatDate,
  getDateRangeLabel,
} from '@/lib/utils'

export function SettlementsSection() {
  const {
    shop,
    workspace,
    activeTab,
    settlements,
    datePreset,
    customStart,
    customEnd,
    billableOrders,
    deliveredCount,
    returnedCount,
    totalCodCollectedUSD,
    totalDeliveryFeesUSD,
    totalPayoutsUSD,
    currentBalanceUSD,
    currentBalanceLBP,
  } = useShopProfile()

  if (activeTab === 'payouts') {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Settlement Description</th>
              <th>Amount (USD)</th>
              <th>Amount (LBP)</th>
              <th>Reference Note</th>
            </tr>
          </thead>
          <tbody>
            {settlements.map(item => (
              <tr key={item.id}>
                <td>
                  <strong>{formatDate(item.created_at)}</strong>
                </td>
                <td>
                  {Number(item.amount_usd) < 0 ? (
                    <span className="badge" style={{ background: '#e0f2fe', color: '#0369a1', borderColor: '#bae6fd' }}>
                      Cash Received from Merchant (Shop → Desk)
                    </span>
                  ) : (
                    <span className="badge badge-delivered">
                      Cash Payout to Merchant (Desk → {shop.name})
                    </span>
                  )}
                </td>
                <td>
                  <strong style={{ fontSize: 14, color: Number(item.amount_usd) < 0 ? '#0284c7' : 'var(--brand)' }}>
                    {Number(item.amount_usd) < 0 ? `+ ${formatUSD(Math.abs(Number(item.amount_usd)))}` : formatUSD(Number(item.amount_usd))}
                  </strong>
                </td>
                <td>
                  <span>{formatLBP(usdToLbp(Math.abs(Number(item.amount_usd)), item.usd_to_lbp || workspace.usd_to_lbp))}</span>
                </td>
                <td>
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                    {item.note || '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {settlements.length === 0 && (
          <div className="empty">
            <h3>No payouts recorded yet</h3>
            <p>Use &quot;Pay Merchant&quot; above to log cash settlements handed over to this store.</p>
          </div>
        )}
      </div>
    )
  }

  if (activeTab === 'statement') {
    return (
      <div style={{ padding: '28px 32px' }}>
        {/* Print Controls Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 16, borderBottom: '1.5px solid var(--line)' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Merchant Statement & Settlement Report</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
              Generated for {shop.name} · As of {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.print()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Print Statement Slip
          </button>
        </div>

        {/* Document Body (Printable Paper Style) */}
        <div
          className="print-statement-sheet"
          style={{
            background: '#fff',
            color: '#111827',
            padding: '36px 40px',
            borderRadius: 'var(--radius)',
            border: '1.5px solid var(--line)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
            maxWidth: 850,
            margin: '0 auto',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #15803d', paddingBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Image src="/logo.png" alt="Cedar Delivery Desk" width={48} height={48} style={{ borderRadius: 8 }} />
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: '#15803d' }}>
                  {workspace.name}
                </h2>
                <small style={{ fontSize: 11, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Delivery Desk & COD Clearance
                </small>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#111827', display: 'block' }}>
                STATEMENT INVOICE
              </span>
              <small style={{ color: '#6b7280', fontSize: 11 }}>
                Ref: STM-{shop.id.slice(0, 8).toUpperCase()}-{Date.now().toString().slice(-4)}
              </small>
              <div style={{ fontSize: 11, color: '#374151', marginTop: 4 }}>
                Period: <strong>{getDateRangeLabel(datePreset, customStart, customEnd)}</strong>
              </div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                Issued: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
            </div>
          </div>

          {/* Merchant Details Block */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, margin: '22px 0', padding: 14, background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <div>
              <small style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Merchant Account</small>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#111827', marginTop: 2 }}>{shop.name}</div>
              {shop.phone && <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>{shop.phone}</div>}
              {shop.address && <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>{shop.address}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <small style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Financial Position</small>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#15803d', marginTop: 2 }}>
                {formatUSD(currentBalanceUSD)}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#4b5563' }}>
                ≈ {formatLBP(currentBalanceLBP)}
              </div>
              <small style={{ fontSize: 11, color: '#6b7280' }}>
                Exchange Rate: {workspace.usd_to_lbp.toLocaleString()} LBP/USD
              </small>
            </div>
          </div>

          {/* Itemized Deliveries & Returns Table */}
          <h4 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: '#374151', margin: '24px 0 8px' }}>
            Deliveries & Returns Breakdown ({billableOrders.length} Billable Orders · {getDateRangeLabel(datePreset, customStart, customEnd)})
          </h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f3f4f6', borderBottom: '1.5px solid #d1d5db', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px', fontWeight: 700 }}>Code</th>
                <th style={{ padding: '8px 10px', fontWeight: 700 }}>Customer / Area</th>
                <th style={{ padding: '8px 10px', fontWeight: 700, textAlign: 'right' }}>COD Collected</th>
                <th style={{ padding: '8px 10px', fontWeight: 700, textAlign: 'right' }}>Delivery Fee</th>
                <th style={{ padding: '8px 10px', fontWeight: 700, textAlign: 'right' }}>Net Payable</th>
              </tr>
            </thead>
            <tbody>
              {billableOrders.slice(0, 50).map(order => {
                const net = (Number(order.collection_usd) || 0) - (Number(order.delivery_fee_usd) || 0)
                const isReturn = order.status === 'returned'
                return (
                  <tr key={order.id} style={{ borderBottom: '1px solid #e5e7eb', background: isReturn ? 'rgba(254, 226, 226, 0.25)' : 'transparent' }}>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 700 }}>
                      #{order.code}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <div>
                        {order.recipient_name || 'Customer'}
                        {isReturn && (
                          <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#fee2e2', color: '#991b1b', fontWeight: 700 }}>
                            Retail Refund ($2 Fee)
                          </span>
                        )}
                      </div>
                      {order.area && <small style={{ color: '#6b7280' }}>{order.area.name}</small>}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>
                      {formatUSD(Number(order.collection_usd))}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: isReturn ? '#b91c1c' : '#4b5563', fontWeight: isReturn ? 700 : 500 }}>
                      {formatUSD(Number(order.delivery_fee_usd))}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: net < 0 ? '#b91c1c' : '#15803d' }}>
                      {formatUSD(net)}
                    </td>
                  </tr>
                )
              })}
              {billableOrders.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>
                    No delivered or returned orders in this timeframe.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Financial Settlement Summary Box */}
          <div style={{ marginTop: 24, padding: 18, background: '#f9fafb', borderRadius: 8, border: '1.5px solid #d1d5db' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: '#4b5563' }}>
                  Delivered Packages: <strong>{deliveredCount}</strong>
                  {returnedCount > 0 && (
                    <span style={{ marginLeft: 6, color: '#b91c1c' }}>
                      · Retail Refunds: <strong>{returnedCount}</strong> ($2 fee each)
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#4b5563', marginTop: 4 }}>
                  Gross COD Collected: <strong>{formatUSD(totalCodCollectedUSD)}</strong>
                </div>
                <div style={{ fontSize: 12, color: '#4b5563', marginTop: 4 }}>
                  Total Delivery Service Fees: <strong>-{formatUSD(totalDeliveryFeesUSD)}</strong>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: '#4b5563' }}>
                  Lifetime Payouts Disbursed: <strong>{formatUSD(totalPayoutsUSD)}</strong>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: currentBalanceUSD >= 0 ? '#15803d' : '#0284c7', marginTop: 6 }}>
                  {currentBalanceUSD >= 0 ? 'Current Net Payable:' : 'Current Net Receivable:'} {formatUSD(currentBalanceUSD)}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                  ({formatLBP(currentBalanceLBP)})
                </div>
              </div>
            </div>
          </div>

          {/* Signatures acknowledgement */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, marginTop: 48, paddingTop: 16, borderTop: '1px dashed #9ca3af' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase' }}>
                Prepared & Issued by (Desk)
              </div>
              <div style={{ marginTop: 32, borderTop: '1px solid #111827', width: '80%' }} />
              <small style={{ color: '#6b7280', fontSize: 10 }}>Cedar Delivery Desk Signature & Stamp</small>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase' }}>
                Received by (Merchant)
              </div>
              <div style={{ marginTop: 32, borderTop: '1px solid #111827', width: '80%', marginLeft: 'auto' }} />
              <small style={{ color: '#6b7280', fontSize: 10 }}>{shop.name} Representative Signature</small>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}
