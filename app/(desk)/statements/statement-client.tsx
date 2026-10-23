'use client'

import { useState } from 'react'
import { Modal } from '@/components/modal'
import { formatUSD, formatLBP, usdToLbp, formatDate } from '@/lib/utils'

interface Order {
  id: string
  code: string
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
  pay_owed_usd: number
}

interface StatementClientProps {
  orders: Order[]
  shops: Shop[]
  drivers: Driver[]
  workspaceId: string
  rate: number
}

export function StatementClient({
  orders: initialOrders,
  shops: initialShops,
  drivers: initialDrivers,
  workspaceId,
  rate,
}: StatementClientProps) {
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
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

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
    setIsModalOpen(true)
  }

  function openSettleForShop(shopId: string, maxAmount: number) {
    const isDebt = maxAmount < 0
    setSettlementType(isDebt ? 'shop_collection' : 'shop_payment')
    setSelectedShopId(shopId)
    setAmountUsd(String(Math.abs(maxAmount)))
    setIsModalOpen(true)
  }

  async function handleSettleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const isShop = settlementType === 'shop_payment' || settlementType === 'shop_collection'
      const direction = settlementType === 'shop_collection' ? 'collection_from_shop' : 'payout_to_shop'
      const apiType = isShop ? 'shop_payment' : settlementType

      const res = await fetch('/api/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          type: apiType,
          direction: isShop ? direction : undefined,
          amountUsd: Number(amountUsd),
          shopId: isShop ? selectedShopId : null,
          driverId: !isShop ? selectedDriverId : null,
          note,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to process settlement')

      const amt = Number(amountUsd)
      if (settlementType === 'driver_cash_remittance') {
        setDrivers(prev =>
          prev.map(d => (d.id === selectedDriverId ? { ...d, cash_held_usd: Math.max(0, d.cash_held_usd - amt) } : d))
        )
        showToast(`Remittance of $${amt} recorded successfully!`)
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
        <div className="panel-title">
          <h2>Delivered Orders Ledger</h2>
          <small>{orders.length} delivered orders</small>
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
                      {d.name} (Holds ${d.cash_held_usd} | Owed ${d.pay_owed_usd})
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

            <div className="field full">
              <label>Amount (USD)</label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                placeholder="0.00"
                value={amountUsd}
                onChange={e => setAmountUsd(e.target.value)}
                required
              />
            </div>

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
