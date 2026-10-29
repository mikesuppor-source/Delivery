'use client'

import { useState } from 'react'
import { formatUSD } from '@/lib/utils'
import type { UserRole } from '@/lib/roles'
import { RefreshIcon } from '@/components/icons'

interface ProfitTotals {
  orders_delivered: number
  orders_returned: number
  customer_fees_usd: number
  courier_pay_usd: number
  profit_usd: number
  cod_collected_usd: number
}

interface ZoneRow {
  area_id: string | null
  area_name: string | null
  orders_count: number
  fees_usd: number
  courier_pay_usd: number
  profit_usd: number
}

interface DriverRow {
  driver_id: string | null
  driver_name: string | null
  orders_count: number
  fees_usd: number
  courier_pay_usd: number
  profit_usd: number
}

interface ShopRow {
  shop_id: string | null
  shop_name: string | null
  orders_count: number
  fees_usd: number
  courier_pay_usd: number
  profit_usd: number
}

interface ProfitReportData {
  totals: ProfitTotals
  by_zone: ZoneRow[]
  by_driver: DriverRow[]
  by_shop: ShopRow[]
}

interface ReportsClientProps {
  workspaceId: string
  userRole: UserRole
  initialReport: ProfitReportData | null
  initialFrom: string
  initialTo: string
}

type DatePreset = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'custom'

export function ReportsClient({
  workspaceId,
  userRole: _userRole,
  initialReport,
  initialFrom,
  initialTo,
}: ReportsClientProps) {
  const [report, setReport] = useState<ProfitReportData | null>(initialReport)
  const [datePreset, setDatePreset] = useState<DatePreset>('this_month')
  const [fromDate, setFromDate] = useState(initialFrom.slice(0, 10))
  const [toDate, setToDate] = useState(initialTo.slice(0, 10))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Active sub-table tab
  const [activeTable, setActiveTable] = useState<'zone' | 'driver' | 'shop'>('zone')

  // Table sorting
  const [sortField, setSortField] = useState<'orders_count' | 'fees_usd' | 'courier_pay_usd' | 'profit_usd'>('profit_usd')
  const [sortAsc, setSortAsc] = useState(false)

  function computeDateRange(preset: DatePreset): { from: string; to: string } {
    const now = new Date()
    const utcYear = now.getUTCFullYear()
    const utcMonth = now.getUTCMonth()
    const utcDate = now.getUTCDate()

    if (preset === 'today') {
      const from = new Date(Date.UTC(utcYear, utcMonth, utcDate, 0, 0, 0))
      const to = new Date(Date.UTC(utcYear, utcMonth, utcDate, 23, 59, 59, 999))
      return { from: from.toISOString(), to: to.toISOString() }
    }

    if (preset === 'yesterday') {
      const from = new Date(Date.UTC(utcYear, utcMonth, utcDate - 1, 0, 0, 0))
      const to = new Date(Date.UTC(utcYear, utcMonth, utcDate - 1, 23, 59, 59, 999))
      return { from: from.toISOString(), to: to.toISOString() }
    }

    if (preset === 'this_week') {
      const day = now.getUTCDay()
      const diffToMonday = (day + 6) % 7 // Monday = 0
      const from = new Date(Date.UTC(utcYear, utcMonth, utcDate - diffToMonday, 0, 0, 0))
      const to = new Date(Date.UTC(utcYear, utcMonth, utcDate, 23, 59, 59, 999))
      return { from: from.toISOString(), to: to.toISOString() }
    }

    if (preset === 'this_month') {
      const from = new Date(Date.UTC(utcYear, utcMonth, 1, 0, 0, 0))
      const to = new Date(Date.UTC(utcYear, utcMonth, utcDate, 23, 59, 59, 999))
      return { from: from.toISOString(), to: to.toISOString() }
    }

    if (preset === 'last_month') {
      const from = new Date(Date.UTC(utcYear, utcMonth - 1, 1, 0, 0, 0))
      const to = new Date(Date.UTC(utcYear, utcMonth, 0, 23, 59, 59, 999))
      return { from: from.toISOString(), to: to.toISOString() }
    }

    // custom
    const f = new Date(`${fromDate}T00:00:00.000Z`)
    const t = new Date(`${toDate}T23:59:59.999Z`)
    return { from: f.toISOString(), to: t.toISOString() }
  }

  async function fetchReport(preset: DatePreset) {
    setLoading(true)
    setError('')
    try {
      const { from, to } = computeDateRange(preset)
      const res = await fetch(`/api/reports/profit?workspaceId=${encodeURIComponent(workspaceId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate report')
      setReport(data.report)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error fetching report')
    } finally {
      setLoading(false)
    }
  }

  function handlePresetChange(preset: DatePreset) {
    setDatePreset(preset)
    if (preset !== 'custom') {
      fetchReport(preset)
    }
  }

  function handleSort(field: 'orders_count' | 'fees_usd' | 'courier_pay_usd' | 'profit_usd') {
    if (sortField === field) {
      setSortAsc(prev => !prev)
    } else {
      setSortField(field)
      setSortAsc(false)
    }
  }

  // Sorted list helpers
  const sortedZones = [...(report?.by_zone || [])].sort((a, b) => {
    const valA = Number(a[sortField]) || 0
    const valB = Number(b[sortField]) || 0
    return sortAsc ? valA - valB : valB - valA
  })

  const sortedDrivers = [...(report?.by_driver || [])].sort((a, b) => {
    const valA = Number(a[sortField]) || 0
    const valB = Number(b[sortField]) || 0
    return sortAsc ? valA - valB : valB - valA
  })

  const sortedShops = [...(report?.by_shop || [])].sort((a, b) => {
    const valA = Number(a[sortField]) || 0
    const valB = Number(b[sortField]) || 0
    return sortAsc ? valA - valB : valB - valA
  })

  function exportCurrentTableCSV() {
    let rows: Array<{ name: string; orders: number; fees: number; pay: number; profit: number }>
    const filename = `cedar-report-${activeTable}`

    if (activeTable === 'zone') {
      rows = sortedZones.map(z => ({
        name: z.area_name || 'Unassigned Area',
        orders: Number(z.orders_count),
        fees: Number(z.fees_usd),
        pay: Number(z.courier_pay_usd),
        profit: Number(z.profit_usd),
      }))
    } else if (activeTable === 'driver') {
      rows = sortedDrivers.map(d => ({
        name: d.driver_name || 'Unassigned Courier',
        orders: Number(d.orders_count),
        fees: Number(d.fees_usd),
        pay: Number(d.courier_pay_usd),
        profit: Number(d.profit_usd),
      }))
    } else {
      rows = sortedShops.map(s => ({
        name: s.shop_name || 'Walk-in / No Shop',
        orders: Number(s.orders_count),
        fees: Number(s.fees_usd),
        pay: Number(s.courier_pay_usd),
        profit: Number(s.profit_usd),
      }))
    }

    const csvContent =
      '\uFEFF' +
      'Name,Orders Count,Customer Fees USD,Courier Pay USD,Company Profit USD\n' +
      rows
        .map(
          r =>
            `"${r.name.replace(/"/g, '""')}",${r.orders},${r.fees.toFixed(2)},${r.pay.toFixed(2)},${r.profit.toFixed(2)}`
        )
        .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', `${filename}-${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const totals = report?.totals || {
    orders_delivered: 0,
    orders_returned: 0,
    customer_fees_usd: 0,
    courier_pay_usd: 0,
    profit_usd: 0,
    cod_collected_usd: 0,
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Profit & Logistics Performance Reports</h1>
          <p>Real-time delivery margins, courier compensations, returns, and gross profit</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={loading}
            onClick={() => fetchReport(datePreset)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshIcon size={14} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
            <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={exportCurrentTableCSV}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Export Table CSV</span>
          </button>
        </div>
      </div>

      {/* Date Filter Bar */}
      <div
        className="panel"
        style={{
          padding: '14px 20px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {(
            [
              ['today', 'Today'],
              ['yesterday', 'Yesterday'],
              ['this_week', 'This Week'],
              ['this_month', 'This Month'],
              ['last_month', 'Last Month'],
              ['custom', 'Custom Range'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`btn btn-sm ${datePreset === key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => handlePresetChange(key)}
              style={{ fontSize: 12, padding: '4px 12px' }}
            >
              {label}
            </button>
          ))}
        </div>

        {datePreset === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              style={{ fontSize: 12.5, padding: '4px 8px' }}
            />
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>to</span>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              style={{ fontSize: 12.5, padding: '4px 8px' }}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => fetchReport('custom')}
              style={{ fontSize: 12 }}
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: '12px 18px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', marginBottom: 20, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* KPI Cards Row (§1.6) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 14,
          marginBottom: 24,
        }}
      >
        <div className="panel" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Delivered Orders</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>
            {totals.orders_delivered}
          </div>
          <small style={{ color: '#059669', fontSize: 11, fontWeight: 600 }}>Successfully fulfilled</small>
        </div>

        <div className="panel" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Returned Orders</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#dc2626', marginTop: 4 }}>
            {totals.orders_returned}
          </div>
          <small style={{ color: 'var(--muted)', fontSize: 11 }}>Charged return tariff</small>
        </div>

        <div className="panel" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Customer Fees (Revenue)</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#2563eb', marginTop: 4 }}>
            {formatUSD(Number(totals.customer_fees_usd))}
          </div>
          <small style={{ color: 'var(--muted)', fontSize: 11 }}>Charged for delivery service</small>
        </div>

        <div className="panel" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Courier Pay (Expense)</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#d97706', marginTop: 4 }}>
            {formatUSD(Number(totals.courier_pay_usd))}
          </div>
          <small style={{ color: 'var(--muted)', fontSize: 11 }}>Paid to drivers for runs</small>
        </div>

        <div
          className="panel"
          style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
            borderColor: '#a7f3d0',
          }}
        >
          <div style={{ fontSize: 12, color: '#065f46', fontWeight: 700 }}>Company Net Profit</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#047857', marginTop: 4 }}>
            {formatUSD(Number(totals.profit_usd))}
          </div>
          <small style={{ color: '#059669', fontSize: 11, fontWeight: 700 }}>Fees − Courier Pay</small>
        </div>

        <div className="panel" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Doorstep COD Collected</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>
            {formatUSD(Number(totals.cod_collected_usd))}
          </div>
          <small style={{ color: 'var(--muted)', fontSize: 11 }}>Cash collected at delivery</small>
        </div>
      </div>

      {/* Breakdown Tables (§1.6 By Zone, By Courier, By Shop) */}
      <div className="panel">
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1.5px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className={`btn btn-sm ${activeTable === 'zone' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTable('zone')}
              style={{ fontSize: 13, fontWeight: 600 }}
            >
              By Delivery Zone ({report?.by_zone.length || 0})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activeTable === 'driver' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTable('driver')}
              style={{ fontSize: 13, fontWeight: 600 }}
            >
              By Courier ({report?.by_driver.length || 0})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activeTable === 'shop' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTable('shop')}
              style={{ fontSize: 13, fontWeight: 600 }}
            >
              By Merchant ({report?.by_shop.length || 0})
            </button>
          </div>

          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Click table columns to sort
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{activeTable === 'zone' ? 'Delivery Zone' : activeTable === 'driver' ? 'Courier Name' : 'Merchant Name'}</th>
                <th
                  onClick={() => handleSort('orders_count')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  title="Sort by order count"
                >
                  Orders {sortField === 'orders_count' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th
                  onClick={() => handleSort('fees_usd')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  title="Sort by customer fees"
                >
                  Customer Fees {sortField === 'fees_usd' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th
                  onClick={() => handleSort('courier_pay_usd')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  title="Sort by courier pay"
                >
                  Courier Pay {sortField === 'courier_pay_usd' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th
                  onClick={() => handleSort('profit_usd')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  title="Sort by net profit"
                >
                  Company Profit {sortField === 'profit_usd' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {activeTable === 'zone' && (
                sortedZones.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
                      No orders in selected time period.
                    </td>
                  </tr>
                ) : (
                  sortedZones.map((z, idx) => (
                    <tr key={z.area_id || idx}>
                      <td>
                        <strong>{z.area_name || 'Unassigned Area'}</strong>
                      </td>
                      <td>{z.orders_count}</td>
                      <td>
                        <strong style={{ color: '#2563eb' }}>{formatUSD(Number(z.fees_usd))}</strong>
                      </td>
                      <td>
                        <span style={{ color: '#d97706' }}>{formatUSD(Number(z.courier_pay_usd))}</span>
                      </td>
                      <td>
                        <strong style={{ color: Number(z.profit_usd) >= 0 ? '#059669' : '#dc2626' }}>
                          {formatUSD(Number(z.profit_usd))}
                        </strong>
                      </td>
                    </tr>
                  ))
                )
              )}

              {activeTable === 'driver' && (
                sortedDrivers.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
                      No orders in selected time period.
                    </td>
                  </tr>
                ) : (
                  sortedDrivers.map((d, idx) => (
                    <tr key={d.driver_id || idx}>
                      <td>
                        <strong>{d.driver_name || 'Unassigned Courier'}</strong>
                      </td>
                      <td>{d.orders_count}</td>
                      <td>
                        <strong style={{ color: '#2563eb' }}>{formatUSD(Number(d.fees_usd))}</strong>
                      </td>
                      <td>
                        <span style={{ color: '#d97706' }}>{formatUSD(Number(d.courier_pay_usd))}</span>
                      </td>
                      <td>
                        <strong style={{ color: Number(d.profit_usd) >= 0 ? '#059669' : '#dc2626' }}>
                          {formatUSD(Number(d.profit_usd))}
                        </strong>
                      </td>
                    </tr>
                  ))
                )
              )}

              {activeTable === 'shop' && (
                sortedShops.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
                      No orders in selected time period.
                    </td>
                  </tr>
                ) : (
                  sortedShops.map((s, idx) => (
                    <tr key={s.shop_id || idx}>
                      <td>
                        <strong>{s.shop_name || 'Walk-in / No Shop'}</strong>
                      </td>
                      <td>{s.orders_count}</td>
                      <td>
                        <strong style={{ color: '#2563eb' }}>{formatUSD(Number(s.fees_usd))}</strong>
                      </td>
                      <td>
                        <span style={{ color: '#d97706' }}>{formatUSD(Number(s.courier_pay_usd))}</span>
                      </td>
                      <td>
                        <strong style={{ color: Number(s.profit_usd) >= 0 ? '#059669' : '#dc2626' }}>
                          {formatUSD(Number(s.profit_usd))}
                        </strong>
                      </td>
                    </tr>
                  ))
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
