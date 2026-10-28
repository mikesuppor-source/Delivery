'use client'

import { useRef, useState, useEffect } from 'react'
import { Modal } from '@/components/modal'
import { formatUSD, formatLBP, usdToLbp, formatDate } from '@/lib/utils'

interface Order {
  id: string
  code: string
  tracking_token?: string
  status: string
  collection_usd: number
  delivery_fee_usd: number
  driver_pay_usd: number
  shop_balance_usd: number
  usd_to_lbp_rate: number
  created_at: string
  delivered_at: string | null
  shop: { id: string; name: string } | null
  driver: { id: string; name: string } | null
}

interface Shop {
  id: string
  name: string
  balance_usd: number
}

interface Driver {
  id: string
  name: string
  cash_held_usd: number
  cash_held_lbp?: number
  pay_owed_usd: number
}

export interface LedgerEntry {
  id: string
  shop_delta: number
  cash_delta: number
  lbp_delta: number
  pay_delta: number
  reason: string
  created_at: string
  shop?: { name: string } | null
  driver?: { name: string } | null
  order?: { code: string } | null
}

interface StatementClientProps {
  orders: Order[]
  shops: Shop[]
  drivers: Driver[]
  ledger?: LedgerEntry[]
  workspaceId: string
  rate: number
}

export function StatementClient({
  orders: initialOrders,
  shops: initialShops,
  drivers: initialDrivers,
  ledger = [],
  workspaceId,
  rate,
}: StatementClientProps) {
  const settlementRequestId = useRef<string | null>(null)
  const [orders, setOrders] = useState<Order[]>(initialOrders)
  const [shops, setShops] = useState<Shop[]>(initialShops)
  const [drivers, setDrivers] = useState<Driver[]>(initialDrivers)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [settlementType, setSettlementType] = useState<
    'driver_cash_remittance' | 'shop_payment' | 'shop_collection' | 'driver_pay'
  >('driver_cash_remittance')
  const [selectedDriverId, setSelectedDriverId] = useState(drivers[0]?.id || '')
  const [selectedShopId, setSelectedShopId] = useState(shops[0]?.id || '')
  const [amountUsd, setAmountUsd] = useState('')
  const [amountLbp, setAmountLbp] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  // Merchant Cashout / Payout Requests state
  const [cashoutRequests, setCashoutRequests] = useState<Array<{
    id: string
    amount_usd: number
    amount_lbp: number
    method: string
    account_details: string
    status: string
    created_at: string
    notes?: string | null
    shop: { id: string; name: string; phone?: string | null } | null
  }>>([])
  const [cashoutLoading, setCashoutLoading] = useState(false)

  // Fetch pending merchant payout requests
  useEffect(() => {
    fetch(`/api/admin/cashout?workspaceId=${workspaceId}`)
      .then(r => r.json())
      .then(d => {
        if (d && Array.isArray(d.requests)) {
          setCashoutRequests(d.requests)
        }
      })
      .catch(() => {})
  }, [workspaceId])

  async function handleCashoutAction(requestId: string, action: 'mark_paid' | 'reject') {
    setCashoutLoading(true)
    try {
      const res = await fetch('/api/admin/cashout', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, workspaceId, action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update payout request')

      setCashoutRequests(prev =>
        prev.map(r => (r.id === requestId ? { ...r, status: action === 'mark_paid' ? 'paid' : 'rejected' } : r))
      )
      showToast(data.message || 'Payout request updated!')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error processing request')
    } finally {
      setCashoutLoading(false)
    }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  const totalCollected   = orders.reduce((s, o) => s + Number(o.collection_usd), 0)
  const totalDriverCash  = drivers.reduce((s, d) => s + Number(d.cash_held_usd), 0)
  const totalShopBalance = shops.reduce((s, sh) => s + Number(sh.balance_usd), 0)
  const totalDriverPay   = drivers.reduce((s, d) => s + Number(d.pay_owed_usd), 0)

  function openSettleForDriver(driverId: string, maxAmount: number) {
    setSettlementType('driver_cash_remittance')
    setSelectedDriverId(driverId)
    setAmountUsd(String(maxAmount))
    setAmountLbp('')
    setIsModalOpen(true)
  }

  function openSettleForShop(shopId: string, maxAmount: number) {
    const isDebt = maxAmount < 0
    setSettlementType(isDebt ? 'shop_collection' : 'shop_payment')
    setSelectedShopId(shopId)
    setAmountUsd(String(Math.abs(maxAmount)))
    setIsModalOpen(true)
  }

  function handleExportStatementsCsv() {
    if (orders.length === 0) {
      alert('No delivered orders to export.')
      return
    }

    const headers = [
      'Order Code',
      'Created Date',
      'Delivered Date',
      'Shop Name',
      'Driver Name',
      'COD Collection ($ USD)',
      'COD Collection (LBP)',
      'Delivery Fee ($ USD)',
      'Shop Net Balance ($ USD)',
      'Driver Pay ($ USD)',
      'Exchange Rate (LBP/$)',
    ]

    const rows = orders.map(o => {
      const r = Number(o.usd_to_lbp_rate) || rate
      return [
        `"${o.code}"`,
        `"${formatDate(o.created_at)}"`,
        `"${o.delivered_at ? formatDate(o.delivered_at) : ''}"`,
        `"${(o.shop?.name || '').replace(/"/g, '""')}"`,
        `"${(o.driver?.name || '').replace(/"/g, '""')}"`,
        `"${Number(o.collection_usd).toFixed(2)}"`,
        `"${usdToLbp(Number(o.collection_usd), r)}"`,
        `"${Number(o.delivery_fee_usd).toFixed(2)}"`,
        `"${Number(o.shop_balance_usd).toFixed(2)}"`,
        `"${Number(o.driver_pay_usd).toFixed(2)}"`,
        `"${r}"`,
      ]
    })

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `cedar_delivery_statement_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  async function handleSettleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const isShop = settlementType === 'shop_payment' || settlementType === 'shop_collection'
      const direction = settlementType === 'shop_collection' ? 'collection_from_shop' : 'payout_to_shop'
      const apiType = isShop ? 'shop_payment' : settlementType

      const requestId = settlementRequestId.current ||= crypto.randomUUID()
      const res = await fetch('/api/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: requestId,
          workspaceId,
          type: apiType,
          direction: isShop ? direction : undefined,
          amountUsd: Number(amountUsd) || 0,
          amountLbp: Number(amountLbp) || 0,
          shopId: isShop ? selectedShopId : null,
          driverId: !isShop ? selectedDriverId : null,
          note,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to process settlement')
      settlementRequestId.current = null

      const amt = Number(amountUsd) || 0
      const amtLbp = Number(amountLbp) || 0
      if (settlementType === 'driver_cash_remittance') {
        setDrivers(prev =>
          prev.map(d => (d.id === selectedDriverId ? {
            ...d,
            cash_held_usd: Math.max(0, d.cash_held_usd - amt),
            cash_held_lbp: Math.max(0, (d.cash_held_lbp || 0) - amtLbp),
          } : d))
        )
        showToast(`Remittance of $${amt}${amtLbp > 0 ? ` + ${formatLBP(amtLbp)}` : ''} recorded successfully!`)
      } else if (settlementType === 'driver_pay') {
        setDrivers(prev =>
          prev.map(d => (d.id === selectedDriverId ? { ...d, pay_owed_usd: Math.max(0, d.pay_owed_usd - amt) } : d))
        )
        showToast(`Driver payment of $${amt} cleared!`)
      } else if (settlementType === 'shop_payment') {
        setShops(prev =>
          prev.map(s => (s.id === selectedShopId ? { ...s, balance_usd: s.balance_usd - amt } : s))
        )
        showToast(`Shop payout of $${amt} recorded!`)
      } else if (settlementType === 'shop_collection') {
        setShops(prev =>
          prev.map(s => (s.id === selectedShopId ? { ...s, balance_usd: s.balance_usd + amt } : s))
        )
        showToast(`Collected $${amt} from merchant!`)
      }

      setIsModalOpen(false)
      setAmountUsd('')
      setAmountLbp('')
      setNote('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error processing settlement')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Statements</h1>
          <p>Delivered orders, collected cash, and outstanding balances.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Record settlement
          </button>
          <a href="/print" target="_blank" className="btn btn-secondary">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Print
          </a>
        </div>
      </div>

      {/* Summary stats */}
      <div className="stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <article>
          <span>Total Delivered Value</span>
          <strong>{formatUSD(totalCollected)}</strong>
          <small>{formatLBP(usdToLbp(totalCollected, rate))}</small>
        </article>
        <article>
          <span>Unremitted driver cash</span>
          <strong>{formatUSD(totalDriverCash)}</strong>
          <small>{formatLBP(usdToLbp(totalDriverCash, rate))}</small>
        </article>
        <article>
          <span>Shop balances owed</span>
          <strong>{formatUSD(totalShopBalance)}</strong>
          <small>Net merchant payable</small>
        </article>
        <article className="accent">
          <span>Driver pay outstanding</span>
          <strong>{formatUSD(totalDriverPay)}</strong>
          <small>Accumulated commissions</small>
        </article>
      </div>

      {/* Delivery statement table */}
      <div className="panel">
        <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2>Delivered Orders Ledger</h2>
            <small>{orders.length} delivered orders</small>
          </div>
          <button
            type="button"
            onClick={handleExportStatementsCsv}
            className="btn btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
            title="Download delivered orders ledger as CSV spreadsheet"
          >
            <span>Export Statement CSV</span>
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order Code</th>
                <th>Collected</th>
                <th>Delivery fee</th>
                <th>Shop balance</th>
                <th>Driver pay</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => {
                const r = Number(order.usd_to_lbp_rate) || rate
                return (
                  <tr key={order.id}>
                    <td>
                      <strong>{order.code}</strong>
                      <small>{order.shop?.name || 'No Shop'} · {formatDate(order.created_at)}</small>
                    </td>
                    <td>
                      {formatUSD(Number(order.collection_usd))}
                      <small>{formatLBP(usdToLbp(Number(order.collection_usd), r))}</small>
                    </td>
                    <td>
                      {formatUSD(Number(order.delivery_fee_usd))}
                    </td>
                    <td>
                      {formatUSD(Number(order.shop_balance_usd))}
                    </td>
                    <td>
                      {formatUSD(Number(order.driver_pay_usd))}
                      {order.driver && <small>{order.driver.name}</small>}
                    </td>
                    <td>
                      <div className="settlement-actions">
                        {order.driver && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openSettleForDriver(order.driver!.id, Number(order.collection_usd))}
                          >
                            Remit Cash
                          </button>
                        )}
                        {order.shop && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => openSettleForShop(order.shop!.id, Number(order.shop_balance_usd))}
                          >
                            Pay Shop
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {orders.length === 0 && (
            <div className="empty">
              <h3>No delivered orders yet</h3>
              <p>Once orders are marked delivered, they will appear on this statement ledger.</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── MERCHANT CASHOUT / PAYOUT REQUESTS ─── */}
      <div className="panel" style={{ marginTop: 24 }}>
        <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2>Merchant Payout Requests (طلب سحب أرباح)</h2>
            <small>Pending and processed cash withdrawal requests submitted by merchants via portal</small>
          </div>
          <span className="badge" style={{ background: 'var(--primary-subtle)', color: 'var(--primary)', fontWeight: 600 }}>
            {cashoutRequests.filter(r => r.status === 'pending').length} Pending
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Merchant</th>
                <th>Amount ($ USD)</th>
                <th>Amount (LBP)</th>
                <th>Method</th>
                <th>Account Details</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {cashoutRequests.map(req => (
                <tr key={req.id}>
                  <td><small>{formatDate(req.created_at)}</small></td>
                  <td>
                    <strong>{req.shop?.name || 'Unknown'}</strong>
                    {req.shop?.phone && <div><small>{req.shop.phone}</small></div>}
                  </td>
                  <td><strong style={{ color: '#10b981' }}>{formatUSD(req.amount_usd)}</strong></td>
                  <td><small style={{ color: '#38bdf8' }}>{req.amount_lbp > 0 ? formatLBP(req.amount_lbp) : '—'}</small></td>
                  <td>
                    <span className="badge" style={{ textTransform: 'uppercase', fontSize: 11 }}>
                      {req.method === 'whish' ? 'Whish Money' : req.method === 'omt' ? 'OMT Cash' : req.method === 'cash_office' ? 'Office Cash' : req.method}
                    </span>
                  </td>
                  <td>
                    <code style={{ fontSize: 12 }}>{req.account_details}</code>
                    {req.notes && <div style={{ fontSize: 11, color: 'var(--muted)' }}>Note: {req.notes}</div>}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background:
                          req.status === 'paid'
                            ? '#dcfce7'
                            : req.status === 'rejected'
                            ? '#fee2e2'
                            : '#fef3c7',
                        color:
                          req.status === 'paid'
                            ? '#166534'
                            : req.status === 'rejected'
                            ? '#991b1b'
                            : '#92400e',
                      }}
                    >
                      {req.status.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    {req.status === 'pending' ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={cashoutLoading}
                          onClick={() => handleCashoutAction(req.id, 'mark_paid')}
                          title="Pay merchant and settle ledger balance"
                        >
                          Mark Paid
                        </button>
                        <button
                          className="btn btn-sm btn-ghost"
                          style={{ color: '#ef4444' }}
                          disabled={cashoutLoading}
                          onClick={() => handleCashoutAction(req.id, 'reject')}
                          title="Reject request"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <small style={{ color: 'var(--muted)' }}>Resolved</small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {cashoutRequests.length === 0 && (
            <div className="empty">
              <h3>No payout requests</h3>
              <p>When merchants request cash payouts from their portal, they will appear here for processing.</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── DOUBLE-ENTRY FINANCIAL LEDGER (AUDIT TRAIL) ─── */}
      <div className="panel" style={{ marginTop: 24 }}>
        <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2>Double-Entry Financial Ledger</h2>
            <small>Immutable audit trail of cash, commissions, and merchant balances ({ledger.length} entries)</small>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Related Party / Code</th>
                <th>Reason / Trigger</th>
                <th>Shop Delta ($)</th>
                <th>Cash Held Delta ($)</th>
                <th>LBP Delta (L.L.)</th>
                <th>Driver Pay Delta ($)</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map(entry => (
                <tr key={entry.id}>
                  <td>
                    <small>{formatDate(entry.created_at)}</small>
                  </td>
                  <td>
                    {entry.order && <strong>#{entry.order.code} </strong>}
                    {entry.shop && <small>{entry.shop.name}</small>}
                    {entry.driver && <small>{entry.driver.name}</small>}
                    {!entry.order && !entry.shop && !entry.driver && <small>System Adjustment</small>}
                  </td>
                  <td>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{entry.reason}</span>
                  </td>
                  <td style={{ color: Number(entry.shop_delta) !== 0 ? (Number(entry.shop_delta) > 0 ? '#10b981' : '#f59e0b') : 'var(--muted)' }}>
                    {Number(entry.shop_delta) !== 0 ? (Number(entry.shop_delta) > 0 ? `+${formatUSD(Number(entry.shop_delta))}` : formatUSD(Number(entry.shop_delta))) : '—'}
                  </td>
                  <td style={{ color: Number(entry.cash_delta) !== 0 ? (Number(entry.cash_delta) > 0 ? '#10b981' : '#ef4444') : 'var(--muted)' }}>
                    {Number(entry.cash_delta) !== 0 ? (Number(entry.cash_delta) > 0 ? `+${formatUSD(Number(entry.cash_delta))}` : formatUSD(Number(entry.cash_delta))) : '—'}
                  </td>
                  <td style={{ color: Number(entry.lbp_delta) !== 0 ? '#38bdf8' : 'var(--muted)' }}>
                    {Number(entry.lbp_delta) !== 0 ? (Number(entry.lbp_delta) > 0 ? `+${Number(entry.lbp_delta).toLocaleString()}` : Number(entry.lbp_delta).toLocaleString()) : '—'}
                  </td>
                  <td style={{ color: Number(entry.pay_delta) !== 0 ? (Number(entry.pay_delta) > 0 ? '#6366f1' : '#9ca3af') : 'var(--muted)' }}>
                    {Number(entry.pay_delta) !== 0 ? (Number(entry.pay_delta) > 0 ? `+${formatUSD(Number(entry.pay_delta))}` : formatUSD(Number(entry.pay_delta))) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {ledger.length === 0 && (
            <div className="empty">
              <h3>No ledger records yet</h3>
              <p>Financial ledger entries are recorded automatically as deliveries and cash remittances are confirmed.</p>
            </div>
          )}
        </div>
      </div>

      {/* Settlement Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Record Cash Settlement">
        <form onSubmit={handleSettleSubmit}>
          <div className="form-grid">
            <div className="field full">
              <label>Settlement Type</label>
              <select
                value={settlementType}
                onChange={e => setSettlementType(e.target.value as any)}
              >
                <option value="driver_cash_remittance">Driver Cash Remittance (Driver hands over cash to Desk)</option>
                <option value="shop_payment">Shop Payout (Desk pays cash to merchant)</option>
                <option value="shop_collection">Collect from Shop (Merchant pays debt/fees to Desk)</option>
                <option value="driver_pay">Driver Salary / Commission Payout</option>
              </select>
            </div>

            {settlementType !== 'shop_payment' && settlementType !== 'shop_collection' ? (
              <div className="field full">
                <label>Select Driver</label>
                <select value={selectedDriverId} onChange={e => setSelectedDriverId(e.target.value)} required>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} (Holds ${d.cash_held_usd}{d.cash_held_lbp ? ` + ${formatLBP(d.cash_held_lbp)}` : ''} | Owed ${d.pay_owed_usd})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="field full">
                <label>Select Shop</label>
                <select value={selectedShopId} onChange={e => setSelectedShopId(e.target.value)} required>
                  {shops.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Balance: ${s.balance_usd})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {settlementType === 'driver_cash_remittance' ? (
              <>
                <div className="field half">
                  <label>Amount (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={amountUsd}
                    onChange={e => setAmountUsd(e.target.value)}
                  />
                </div>
                <div className="field half">
                  <label>Amount (LBP)</label>
                  <input
                    type="number"
                    step="500"
                    min="0"
                    placeholder="0 LBP"
                    value={amountLbp}
                    onChange={e => setAmountLbp(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <div className="field full">
                <label>Amount (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={amountUsd}
                  onChange={e => setAmountUsd(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="field full">
              <label>Note / Receipt Reference (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Cash batch received from evening route"
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="error-msg" style={{ marginTop: 12 }}>{error}</p>}

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Recording…' : 'Confirm Settlement'}
            </button>
          </div>
        </form>
      </Modal>

      {toast && (
        <div className="toast">
          <span>{toast}</span>
          <button onClick={() => setToast('')}>✕</button>
        </div>
      )}
    </>
  )
}
