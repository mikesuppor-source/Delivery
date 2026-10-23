'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Modal } from '@/components/modal'
import { formatUSD, formatLBP, usdToLbp, formatDate, ORDER_STATUS_LABELS } from '@/lib/utils'
import type { UserRole } from '@/lib/roles'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { getWhatsAppUrl, getCustomerOrderWhatsAppUrl } from '@/lib/whatsapp'

interface Driver {
  id: string
  workspace_id: string
  name: string
  phone: string | null
  active: boolean
  cash_held_usd: number
  pay_owed_usd: number
  user_id: string | null
  created_at?: string
}

interface OrderItem {
  id: string
  code: string
  status: string
  collection_usd: number
  delivery_fee_usd: number
  driver_pay_usd: number
  shop_balance_usd: number
  usd_to_lbp_rate: number
  created_at: string
  recipient_name: string | null
  recipient_phone: string | null
  recipient_address: string | null
  notes: string | null
  shop?: { id: string; name: string; phone: string | null } | null
  area?: { id: string; name: string } | null
}

interface SettlementItem {
  id: string
  type: 'driver_cash_remittance' | 'driver_pay' | 'shop_payment'
  amount_usd: number
  usd_to_lbp: number
  note: string | null
  created_at: string
  created_by?: string | null
}

interface Workspace {
  id: string
  name: string
  usd_to_lbp: number
}

interface DriverProfileClientProps {
  driver: Driver
  initialOrders: OrderItem[]
  initialSettlements: SettlementItem[]
  workspace: Workspace
  userRole: UserRole
}

export function DriverProfileClient({
  driver: initialDriver,
  initialOrders,
  initialSettlements,
  workspace,
  userRole,
}: DriverProfileClientProps) {
  const [driver, setDriver] = useState<Driver>(initialDriver)
  const [orders] = useState<OrderItem[]>(initialOrders)
  const [settlements, setSettlements] = useState<SettlementItem[]>(initialSettlements)

  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'orders' | 'settlements'>('orders')
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | 'delivered' | 'active' | 'returned'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Modals state
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false)
  const [settlementType, setSettlementType] = useState<'driver_cash_remittance' | 'driver_pay'>('driver_cash_remittance')
  const [settlementAmount, setSettlementAmount] = useState('')
  const [settlementNote, setSettlementNote] = useState('')
  const [settling, setSettling] = useState(false)
  const [settleError, setSettleError] = useState('')

  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editName, setEditName] = useState(driver.name)
  const [editPhone, setEditPhone] = useState(driver.phone || '')
  const [editActive, setEditActive] = useState(driver.active)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')

  const canManage = userRole === 'owner' || userRole === 'manager'

  // Calculations for Driver Performance & Financials
  const deliveredOrders = useMemo(() => orders.filter(o => o.status === 'delivered'), [orders])
  const activeOrders = useMemo(
    () => orders.filter(o => ['pending', 'assigned', 'picked_up'].includes(o.status)),
    [orders]
  )
  const returnedOrders = useMemo(
    () => orders.filter(o => ['returned', 'failed'].includes(o.status)),
    [orders]
  )

  const totalOrdersCount = orders.length
  const deliveredCount = deliveredOrders.length
  const activeCount = activeOrders.length
  const returnedCount = returnedOrders.length
  const completionRate = totalOrdersCount > 0 ? (deliveredCount / totalOrdersCount) * 100 : 0

  // 1. Total Net How Much Driver Made
  const totalDriverEarningsUSD = useMemo(
    () => deliveredOrders.reduce((sum, o) => sum + (Number(o.driver_pay_usd) || 0), 0),
    [deliveredOrders]
  )
  const totalDriverEarningsLBP = usdToLbp(totalDriverEarningsUSD, workspace.usd_to_lbp)
  const avgDriverPay = deliveredCount > 0 ? totalDriverEarningsUSD / deliveredCount : 0

  // 2. Total Company Gross Fees and Net Profit Driver Made for Company
  const totalGrossDeliveryFeesUSD = useMemo(
    () => deliveredOrders.reduce((sum, o) => sum + (Number(o.delivery_fee_usd) || 0), 0),
    [deliveredOrders]
  )
  const totalCompanyProfitUSD = useMemo(
    () =>
      deliveredOrders.reduce(
        (sum, o) => sum + ((Number(o.delivery_fee_usd) || 0) - (Number(o.driver_pay_usd) || 0)),
        0
      ),
    [deliveredOrders]
  )
  const totalCompanyProfitLBP = usdToLbp(totalCompanyProfitUSD, workspace.usd_to_lbp)
  const companyProfitMargin =
    totalGrossDeliveryFeesUSD > 0 ? (totalCompanyProfitUSD / totalGrossDeliveryFeesUSD) * 100 : 0
  const avgCompanyProfit = deliveredCount > 0 ? totalCompanyProfitUSD / deliveredCount : 0

  // Total COD Collected on delivered packages
  const totalCodCollectedUSD = useMemo(
    () => deliveredOrders.reduce((sum, o) => sum + (Number(o.collection_usd) || 0), 0),
    [deliveredOrders]
  )
  const totalCodCollectedLBP = usdToLbp(totalCodCollectedUSD, workspace.usd_to_lbp)

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // Status filter
      if (orderStatusFilter === 'delivered' && order.status !== 'delivered') return false
      if (orderStatusFilter === 'active' && !['pending', 'assigned', 'picked_up'].includes(order.status)) return false
      if (orderStatusFilter === 'returned' && !['returned', 'failed'].includes(order.status)) return false

      // Search query
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      const codeMatch = order.code?.toLowerCase().includes(q)
      const recipientMatch = order.recipient_name?.toLowerCase().includes(q)
      const phoneMatch = order.recipient_phone?.toLowerCase().includes(q)
      const shopMatch = order.shop?.name?.toLowerCase().includes(q)
      const areaMatch = order.area?.name?.toLowerCase().includes(q)
      return codeMatch || recipientMatch || phoneMatch || shopMatch || areaMatch
    })
  }, [orders, orderStatusFilter, searchQuery])

  // Filtered sums for current view
  const filteredCodTotal = useMemo(
    () => filteredOrders.reduce((sum, o) => sum + (Number(o.collection_usd) || 0), 0),
    [filteredOrders]
  )
  const filteredDriverPayTotal = useMemo(
    () => filteredOrders.reduce((sum, o) => sum + (Number(o.driver_pay_usd) || 0), 0),
    [filteredOrders]
  )
  const filteredCompanyProfitTotal = useMemo(
    () =>
      filteredOrders.reduce(
        (sum, o) =>
          sum + (o.status === 'delivered' ? (Number(o.delivery_fee_usd) || 0) - (Number(o.driver_pay_usd) || 0) : 0),
        0
      ),
    [filteredOrders]
  )

  // Handle Recording Settlement
  async function handleRecordSettlement(e: React.FormEvent) {
    e.preventDefault()
    setSettling(true)
    setSettleError('')

    const amount = parseFloat(settlementAmount)
    if (isNaN(amount) || amount <= 0) {
      setSettleError('Please enter a valid amount')
      setSettling(false)
      return
    }

    try {
      const res = await fetch('/api/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          type: settlementType,
          amountUsd: amount,
          driverId: driver.id,
          note: settlementNote || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to record settlement')

      // Update driver balances in local state
      if (settlementType === 'driver_cash_remittance') {
        setDriver(prev => ({
          ...prev,
          cash_held_usd: Math.max(0, Number(prev.cash_held_usd) - amount),
        }))
      } else if (settlementType === 'driver_pay') {
        setDriver(prev => ({
          ...prev,
          pay_owed_usd: Math.max(0, Number(prev.pay_owed_usd) - amount),
        }))
      }

      setSettlements(prev => [data.settlement, ...prev])
      setIsSettlementModalOpen(false)
      setSettlementAmount('')
      setSettlementNote('')
    } catch (err: unknown) {
      setSettleError(err instanceof Error ? err.message : 'Error recording settlement')
    } finally {
      setSettling(false)
    }
  }

  // Handle Editing Driver Details
  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    setSavingEdit(true)
    setEditError('')

    try {
      const res = await fetch(`/api/drivers/${driver.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          name: editName,
          phone: editPhone || null,
          active: editActive,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update driver')

      setDriver(prev => ({
        ...prev,
        name: data.driver.name,
        phone: data.driver.phone,
        active: data.driver.active,
      }))
      setIsEditModalOpen(false)
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Error updating driver')
    } finally {
      setSavingEdit(false)
    }
  }

  // Open settlement modal with pre-filled default
  function openSettlement(type: 'driver_cash_remittance' | 'driver_pay') {
    setSettlementType(type)
    setSettlementAmount(
      type === 'driver_cash_remittance'
        ? Number(driver.cash_held_usd) > 0
          ? driver.cash_held_usd.toString()
          : ''
        : Number(driver.pay_owed_usd) > 0
        ? driver.pay_owed_usd.toString()
        : ''
    )
    setSettlementNote(
      type === 'driver_cash_remittance'
        ? `COD cash remittance by ${driver.name}`
        : `Commission payout to ${driver.name}`
    )
    setSettleError('')
    setIsSettlementModalOpen(true)
  }

  return (
    <>
      {/* Breadcrumb Navigation */}
      <div style={{ marginBottom: 18 }}>
        <Link
          href="/drivers"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--brand)',
            textDecoration: 'none',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Drivers Directory
        </Link>
      </div>

      {/* Driver Identity Card & Quick Actions */}
      <div
        className="panel"
        style={{
          padding: '24px 28px',
          marginBottom: 24,
          background: 'linear-gradient(135deg, var(--surface) 0%, rgba(20, 83, 45, 0.04) 100%)',
          borderColor: 'var(--line)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: 'var(--brand)',
                color: '#fff',
                fontSize: 22,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(20, 83, 45, 0.25)',
                position: 'relative',
                flexShrink: 0,
              }}
            >
              {driver.name
                .split(' ')
                .map(n => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase() || 'D'}
              <span
                style={{
                  position: 'absolute',
                  bottom: 2,
                  right: 2,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: driver.active ? '#10b981' : '#9ca3af',
                  border: '2px solid var(--surface)',
                }}
                title={driver.active ? 'Active Courier' : 'Inactive Courier'}
              />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>
                  {driver.name}
                </h1>
                <span className={`badge ${driver.active ? 'badge-delivered' : 'badge-returned'}`}>
                  {driver.active ? 'Active Courier' : 'Inactive'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                {driver.phone ? (
                  <a
                    href={getWhatsAppUrl(driver.phone, `Hello ${driver.name}, Cedar Delivery dispatch team contacting you.`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="whatsapp-badge"
                    style={{ fontSize: 13, padding: '4px 10px' }}
                    title="Chat on WhatsApp"
                  >
                    <WhatsAppIcon size={14} />
                    <span>{driver.phone}</span>
                  </a>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>No phone registered</span>
                )}

                <span style={{ color: 'var(--line)' }}>•</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Assigned Workspace: <strong>{workspace.name}</strong>
                </span>

                {driver.created_at && (
                  <>
                    <span style={{ color: 'var(--line)' }}>•</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      Joined {new Date(driver.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {canManage && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => openSettlement('driver_cash_remittance')}
                  title="Record COD cash handed over by this driver"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                  Remit Cash ({formatUSD(Number(driver.cash_held_usd))})
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => openSettlement('driver_pay')}
                  title="Pay out driver delivery commissions"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="6" x2="12" y2="12" />
                    <line x1="12" y1="12" x2="16" y2="14" />
                  </svg>
                  Pay Courier ({formatUSD(Number(driver.pay_owed_usd))})
                </button>

                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setEditName(driver.name)
                    setEditPhone(driver.phone || '')
                    setEditActive(driver.active)
                    setEditError('')
                    setIsEditModalOpen(true)
                  }}
                  title="Edit driver profile information"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit Profile
                </button>
              </>
            )}
          </div>
        </div>
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
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--muted)' }}>
              Total Orders Handled
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
              {completionRate.toFixed(0)}% Completed
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
            COD Delivered: <strong>{formatUSD(totalCodCollectedUSD)}</strong>
          </div>
        </div>

        {/* Metric 4: Cash Held (COD to Remit) */}
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
                  background: 'var(--brand)',
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

      {/* ─── Main Content Tabs: Which Orders & Settlement History ─── */}
      <div className="panel">
        <div
          className="panel-title"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          {/* Main View Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: activeTab === 'orders' ? 'var(--brand)' : 'transparent',
                color: activeTab === 'orders' ? '#fff' : 'var(--muted)',
                transition: 'all .15s',
              }}
            >
              Which Orders ({totalOrdersCount})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('settlements')}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: activeTab === 'settlements' ? 'var(--brand)' : 'transparent',
                color: activeTab === 'settlements' ? '#fff' : 'var(--muted)',
                transition: 'all .15s',
              }}
            >
              Settlement History ({settlements.length})
            </button>
          </div>

          {/* If on orders tab, show search & status filter */}
          {activeTab === 'orders' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: 3, border: '1px solid var(--line)' }}>
                <button
                  type="button"
                  onClick={() => setOrderStatusFilter('all')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    background: orderStatusFilter === 'all' ? 'var(--surface)' : 'transparent',
                    color: orderStatusFilter === 'all' ? 'var(--text)' : 'var(--muted)',
                    boxShadow: orderStatusFilter === 'all' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  All ({totalOrdersCount})
                </button>
                <button
                  type="button"
                  onClick={() => setOrderStatusFilter('delivered')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    background: orderStatusFilter === 'delivered' ? 'var(--surface)' : 'transparent',
                    color: orderStatusFilter === 'delivered' ? '#047857' : 'var(--muted)',
                    boxShadow: orderStatusFilter === 'delivered' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  Delivered ({deliveredCount})
                </button>
                <button
                  type="button"
                  onClick={() => setOrderStatusFilter('active')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    background: orderStatusFilter === 'active' ? 'var(--surface)' : 'transparent',
                    color: orderStatusFilter === 'active' ? '#1d4ed8' : 'var(--muted)',
                    boxShadow: orderStatusFilter === 'active' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  Active ({activeCount})
                </button>
                {returnedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setOrderStatusFilter('returned')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      background: orderStatusFilter === 'returned' ? 'var(--surface)' : 'transparent',
                      color: orderStatusFilter === 'returned' ? '#b91c1c' : 'var(--muted)',
                      boxShadow: orderStatusFilter === 'returned' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    Returned ({returnedCount})
                  </button>
                )}
              </div>

              <input
                type="text"
                placeholder="Search orders, shops, areas…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  fontSize: 12,
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1.5px solid var(--line)',
                  background: 'var(--bg)',
                  minWidth: 200,
                }}
              />
            </div>
          )}
        </div>

        {/* ─── ORDERS VIEW: WHICH ORDERS HE DELIVERED & NETS ─── */}
        {activeTab === 'orders' && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order Code</th>
                  <th>Date</th>
                  <th>Merchant / Shop</th>
                  <th>Recipient & Area</th>
                  <th>COD Collection</th>
                  <th>Driver Net Make</th>
                  <th>Company Profit</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => {
                  const companyOrderProfit =
                    order.status === 'delivered'
                      ? (Number(order.delivery_fee_usd) || 0) - (Number(order.driver_pay_usd) || 0)
                      : 0

                  const codLbp = usdToLbp(Number(order.collection_usd) || 0, order.usd_to_lbp_rate || workspace.usd_to_lbp)

                  return (
                    <tr key={order.id}>
                      {/* Code */}
                      <td>
                        <Link
                          href={`/track/${order.code}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontWeight: 700,
                            fontFamily: 'monospace',
                            color: 'var(--brand)',
                            textDecoration: 'none',
                          }}
                          title="View Public Tracking Page"
                        >
                          #{order.code}
                        </Link>
                      </td>

                      {/* Date */}
                      <td>
                        <span style={{ fontSize: 12 }}>{formatDate(order.created_at)}</span>
                      </td>

                      {/* Shop */}
                      <td>
                        {order.shop ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <strong>{order.shop.name}</strong>
                            {order.shop.phone && (
                              <a
                                href={getWhatsAppUrl(order.shop.phone, `Hello ${order.shop.name}, regarding order #${order.code} handled by courier ${driver.name}.`)}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Chat with merchant on WhatsApp"
                                style={{ color: '#25D366', display: 'inline-flex' }}
                              >
                                <WhatsAppIcon size={13} />
                              </a>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>—</span>
                        )}
                      </td>

                      {/* Recipient & Destination */}
                      <td>
                        <div>
                          <strong>{order.recipient_name || 'Customer'}</strong>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            {order.recipient_phone ? (
                              <a
                                href={getCustomerOrderWhatsAppUrl({
                                  customerPhone: order.recipient_phone,
                                  customerName: order.recipient_name,
                                  orderCode: order.code,
                                  shopName: order.shop?.name,
                                  collectionUsd: Number(order.collection_usd) || 0,
                                  collectionLbp: codLbp,
                                  driverName: driver.name,
                                  status: order.status,
                                })}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="whatsapp-badge"
                                style={{ fontSize: 11, padding: '2px 6px' }}
                                title="Message customer on WhatsApp"
                              >
                                <WhatsAppIcon size={11} />
                                <span>{order.recipient_phone}</span>
                              </a>
                            ) : null}
                            {order.area && (
                              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                                ({order.area.name})
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* COD Collection */}
                      <td>
                        <strong>{formatUSD(Number(order.collection_usd) || 0)}</strong>
                        <small>{formatLBP(codLbp)}</small>
                      </td>

                      {/* Driver Net Cut */}
                      <td>
                        <strong style={{ color: '#047857' }}>
                          {formatUSD(Number(order.driver_pay_usd) || 0)}
                        </strong>
                        <small>Driver Commission</small>
                      </td>

                      {/* Company Net Profit */}
                      <td>
                        {order.status === 'delivered' ? (
                          <>
                            <strong style={{ color: companyOrderProfit >= 0 ? 'var(--brand)' : '#dc2626' }}>
                              +{formatUSD(companyOrderProfit)}
                            </strong>
                            <small>
                              Fee: {formatUSD(Number(order.delivery_fee_usd) || 0)}
                            </small>
                          </>
                        ) : (
                          <span style={{ color: 'var(--muted)', fontSize: 12 }}>Pending delivery</span>
                        )}
                      </td>

                      {/* Status */}
                      <td>
                        <span
                          className={`badge ${
                            order.status === 'delivered'
                              ? 'badge-delivered'
                              : ['dispatched', 'assigned', 'picked_up'].includes(order.status)
                              ? 'badge-dispatched'
                              : 'badge-returned'
                          }`}
                        >
                          {ORDER_STATUS_LABELS[order.status] || order.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'right' }}>
                        <Link
                          href={`/track/${order.code}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-ghost"
                          style={{ fontSize: 11, padding: '4px 8px' }}
                        >
                          Track
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>

              {/* Dynamic Footer with Table Aggregates */}
              {filteredOrders.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'var(--bg)', fontWeight: 700, borderTop: '2px solid var(--line)' }}>
                    <td colSpan={4}>
                      Showing {filteredOrders.length} {orderStatusFilter !== 'all' ? orderStatusFilter : ''} orders
                    </td>
                    <td>
                      <div>{formatUSD(filteredCodTotal)}</div>
                      <small style={{ fontWeight: 500 }}>Total COD</small>
                    </td>
                    <td>
                      <div style={{ color: '#047857' }}>{formatUSD(filteredDriverPayTotal)}</div>
                      <small style={{ fontWeight: 500 }}>Total Driver Net</small>
                    </td>
                    <td>
                      <div style={{ color: 'var(--brand)' }}>+{formatUSD(filteredCompanyProfitTotal)}</div>
                      <small style={{ fontWeight: 500 }}>Total Company Profit</small>
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>

            {filteredOrders.length === 0 && (
              <div className="empty">
                <h3>No orders found</h3>
                <p>
                  {searchQuery
                    ? `No orders matching "${searchQuery}". Try a different keyword.`
                    : `No ${orderStatusFilter !== 'all' ? orderStatusFilter : ''} orders assigned to this driver.`}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ─── SETTLEMENTS VIEW: REMITTANCE & PAY HISTORY ─── */}
        {activeTab === 'settlements' && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Settlement Type</th>
                  <th>Amount (USD)</th>
                  <th>Amount (LBP)</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map(item => (
                  <tr key={item.id}>
                    <td>
                      <strong>{formatDate(item.created_at)}</strong>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          item.type === 'driver_cash_remittance' ? 'badge-delivered' : 'badge-dispatched'
                        }`}
                      >
                        {item.type === 'driver_cash_remittance'
                          ? 'COD Cash Remittance (Driver → Company)'
                          : 'Driver Commission Paid (Company → Driver)'}
                      </span>
                    </td>
                    <td>
                      <strong style={{ fontSize: 14 }}>{formatUSD(Number(item.amount_usd))}</strong>
                    </td>
                    <td>
                      <span>{formatLBP(usdToLbp(Number(item.amount_usd), item.usd_to_lbp || workspace.usd_to_lbp))}</span>
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
                <h3>No settlements recorded yet</h3>
                <p>Use &quot;Remit Cash&quot; or &quot;Pay Courier&quot; above to log transactions for this driver.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── MODAL: RECORD SETTLEMENT ─── */}
      <Modal
        isOpen={isSettlementModalOpen}
        onClose={() => setIsSettlementModalOpen(false)}
        title={settlementType === 'driver_cash_remittance' ? 'Record Driver Cash Remittance' : 'Pay Driver Commissions'}
      >
        <form onSubmit={handleRecordSettlement}>
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 12px' }}>
              {settlementType === 'driver_cash_remittance'
                ? `Record cash collected by ${driver.name} from COD deliveries and handed over to the desk.`
                : `Record commission earnings paid out to ${driver.name}.`}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Current Unremitted COD</span>
                <strong style={{ display: 'block', fontSize: 18, marginTop: 4, color: '#b45309' }}>
                  {formatUSD(Number(driver.cash_held_usd))}
                </strong>
              </div>
              <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Current Pay Owed</span>
                <strong style={{ display: 'block', fontSize: 18, marginTop: 4, color: 'var(--brand)' }}>
                  {formatUSD(Number(driver.pay_owed_usd))}
                </strong>
              </div>
            </div>
          </div>

          <div className="form-grid">
            <div className="field full">
              <label>Settlement Type</label>
              <select
                value={settlementType}
                onChange={e => {
                  const t = e.target.value as 'driver_cash_remittance' | 'driver_pay'
                  setSettlementType(t)
                  setSettlementAmount(
                    t === 'driver_cash_remittance'
                      ? Number(driver.cash_held_usd) > 0
                        ? driver.cash_held_usd.toString()
                        : ''
                      : Number(driver.pay_owed_usd) > 0
                      ? driver.pay_owed_usd.toString()
                      : ''
                  )
                }}
              >
                <option value="driver_cash_remittance">Driver Cash Remittance (COD Collected → Company)</option>
                <option value="driver_pay">Driver Pay (Company → Driver Commission Payout)</option>
              </select>
            </div>

            <div className="field full">
              <label>Amount (USD)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={settlementAmount}
                onChange={e => setSettlementAmount(e.target.value)}
                required
                autoFocus
              />
              {settlementAmount && !isNaN(parseFloat(settlementAmount)) && (
                <small style={{ color: 'var(--muted)', marginTop: 4, display: 'block' }}>
                  ≈ {formatLBP(usdToLbp(parseFloat(settlementAmount), workspace.usd_to_lbp))} (at {workspace.usd_to_lbp.toLocaleString()} LBP/USD)
                </small>
              )}
            </div>

            <div className="field full">
              <label>Note / Reference (Optional)</label>
              <input
                type="text"
                placeholder="e.g. End of day remittance, envelope #12"
                value={settlementNote}
                onChange={e => setSettlementNote(e.target.value)}
              />
            </div>
          </div>

          {settleError && <p className="error-msg" style={{ marginTop: 12 }}>{settleError}</p>}

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setIsSettlementModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={settling}>
              {settling ? 'Recording…' : 'Confirm & Save'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── MODAL: EDIT DRIVER PROFILE ─── */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Driver Profile">
        <form onSubmit={handleSaveEdit}>
          <div className="form-grid">
            <div className="field full">
              <label>Driver Full Name</label>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="field full">
              <label>Phone Number (WhatsApp)</label>
              <input
                type="tel"
                placeholder="+961 3 987654"
                value={editPhone}
                onChange={e => setEditPhone(e.target.value)}
              />
            </div>

            <div className="field full">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={editActive}
                  onChange={e => setEditActive(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Active Driver (available for order dispatch)</span>
              </label>
            </div>
          </div>

          {editError && <p className="error-msg" style={{ marginTop: 12 }}>{editError}</p>}

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={savingEdit}>
              {savingEdit ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  )
}
