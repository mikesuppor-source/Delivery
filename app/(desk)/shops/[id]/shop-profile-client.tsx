'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Modal } from '@/components/modal'
import {
  formatUSD,
  formatLBP,
  usdToLbp,
  formatDate,
  ORDER_STATUS_LABELS,
  DateRangePreset,
  isDateInPreset,
  getDateRangeLabel,
} from '@/lib/utils'
import type { UserRole } from '@/lib/roles'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { getWhatsAppUrl, getCustomerOrderWhatsAppUrl } from '@/lib/whatsapp'
import { ShopifyIcon } from '@/components/shopify-icon'
import { ShopifyIntegrationModal } from '@/components/shopify-integration-modal'

interface Shop {
  id: string
  workspace_id: string
  name: string
  phone: string | null
  address: string | null
  active: boolean
  balance_usd: number
  created_at?: string
  api_key?: string | null
  shopify_domain?: string | null
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
  driver?: { id: string; name: string; phone: string | null } | null
  area?: { id: string; name: string } | null
  shopify_order_id?: string | null
  shopify_order_number?: string | null
}

interface SettlementItem {
  id: string
  type: string
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

interface ShopProfileClientProps {
  shop: Shop
  initialOrders: OrderItem[]
  initialSettlements: SettlementItem[]
  workspace: Workspace
  userRole: UserRole
}

export function ShopProfileClient({
  shop: initialShop,
  initialOrders,
  initialSettlements,
  workspace,
  userRole,
}: ShopProfileClientProps) {
  const [shop, setShop] = useState<Shop>(initialShop)
  const [orders] = useState<OrderItem[]>(initialOrders)
  const [settlements, setSettlements] = useState<SettlementItem[]>(initialSettlements)

  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'orders' | 'payouts' | 'statement'>('orders')
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | 'delivered' | 'active' | 'returned'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Date filtering & Sorting presets
  const [datePreset, setDatePreset] = useState<DateRangePreset>('all')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'collection_high' | 'net_high' | 'fee_high'>('newest')

  // Modals state
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false)
  const [settlementDirection, setSettlementDirection] = useState<'payout_to_shop' | 'collection_from_shop'>('payout_to_shop')
  const [payoutAmount, setPayoutAmount] = useState('')
  const [payoutNote, setPayoutNote] = useState('')
  const [paying, setPaying] = useState(false)
  const [payoutError, setPayoutError] = useState('')

  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isShopifyModalOpen, setIsShopifyModalOpen] = useState(false)
  const [editName, setEditName] = useState(shop.name)
  const [editPhone, setEditPhone] = useState(shop.phone || '')
  const [editAddress, setEditAddress] = useState(shop.address || '')
  const [editActive, setEditActive] = useState(shop.active)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')

  const canManage = userRole === 'owner' || userRole === 'manager'

  // Orders scoped to the selected timeframe (this month, last month, this year, etc.)
  const dateScopedOrders = useMemo(() => {
    return orders.filter(o => isDateInPreset(o.created_at, datePreset, customStart, customEnd))
  }, [orders, datePreset, customStart, customEnd])

  // Performance & P&L calculations (scoped to selected date timeframe)
  const deliveredOrders = useMemo(() => dateScopedOrders.filter(o => o.status === 'delivered'), [dateScopedOrders])
  const activeOrders = useMemo(
    () => dateScopedOrders.filter(o => ['pending', 'assigned', 'picked_up'].includes(o.status)),
    [dateScopedOrders]
  )
  const returnedOrders = useMemo(
    () => dateScopedOrders.filter(o => ['returned', 'failed'].includes(o.status)),
    [dateScopedOrders]
  )

  const totalOrdersCount = dateScopedOrders.length
  const deliveredCount = deliveredOrders.length
  const activeCount = activeOrders.length
  const returnedCount = returnedOrders.length
  const completionRate = totalOrdersCount > 0 ? (deliveredCount / totalOrdersCount) * 100 : 0

  // Total COD collected on behalf of merchant in this timeframe
  const totalCodCollectedUSD = useMemo(
    () => deliveredOrders.reduce((sum, o) => sum + (Number(o.collection_usd) || 0), 0),
    [deliveredOrders]
  )
  const totalCodCollectedLBP = usdToLbp(totalCodCollectedUSD, workspace.usd_to_lbp)

  // Billable orders include delivered orders + retail returns/refunds ($2 flat fee)
  const billableOrders = useMemo(
    () => dateScopedOrders.filter(o => o.status === 'delivered' || o.status === 'returned'),
    [dateScopedOrders]
  )

  // Total Delivery fees charged to merchant in this timeframe (including $2 retail refund fees)
  const totalDeliveryFeesUSD = useMemo(
    () => billableOrders.reduce((sum, o) => sum + (Number(o.delivery_fee_usd) || 0), 0),
    [billableOrders]
  )
  const totalDeliveryFeesLBP = usdToLbp(totalDeliveryFeesUSD, workspace.usd_to_lbp)

  // Net Balance credited to shop from deliveries & returns in this timeframe
  const totalNetShopCreditedUSD = totalCodCollectedUSD - totalDeliveryFeesUSD

  // Total Lifetime Payouts made to shop
  const totalPayoutsUSD = useMemo(
    () => settlements.reduce((sum, s) => sum + (Number(s.amount_usd) || 0), 0),
    [settlements]
  )
  const totalPayoutsLBP = usdToLbp(totalPayoutsUSD, workspace.usd_to_lbp)

  // Current Outstanding Balance
  const currentBalanceUSD = Number(shop.balance_usd) || 0
  const currentBalanceLBP = usdToLbp(currentBalanceUSD, workspace.usd_to_lbp)

  // Filtered and Sorted orders list
  const filteredOrders = useMemo(() => {
    const list = dateScopedOrders.filter(order => {
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
      const driverMatch = order.driver?.name?.toLowerCase().includes(q)
      const areaMatch = order.area?.name?.toLowerCase().includes(q)
      return codeMatch || recipientMatch || phoneMatch || driverMatch || areaMatch
    })

    // Sorting
    return list.sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      if (sortBy === 'collection_high') return (Number(b.collection_usd) || 0) - (Number(a.collection_usd) || 0)
      if (sortBy === 'net_high') {
        const netB = (Number(b.collection_usd) || 0) - (Number(b.delivery_fee_usd) || 0)
        const netA = (Number(a.collection_usd) || 0) - (Number(a.delivery_fee_usd) || 0)
        return netB - netA
      }
      if (sortBy === 'fee_high') return (Number(b.delivery_fee_usd) || 0) - (Number(a.delivery_fee_usd) || 0)
      return 0
    })
  }, [dateScopedOrders, orderStatusFilter, searchQuery, sortBy])

  // Filtered sums
  const filteredCodTotal = useMemo(
    () => filteredOrders.reduce((sum, o) => sum + (Number(o.collection_usd) || 0), 0),
    [filteredOrders]
  )
  const filteredFeesTotal = useMemo(
    () => filteredOrders.reduce((sum, o) => sum + (Number(o.delivery_fee_usd) || 0), 0),
    [filteredOrders]
  )
  const filteredShopNetTotal = useMemo(
    () => filteredOrders.reduce((sum, o) => sum + (Number(o.shop_balance_usd) || 0), 0),
    [filteredOrders]
  )

  // Handle Recording Shop Payout or Collection
  async function handleRecordPayout(e: React.FormEvent) {
    e.preventDefault()
    setPaying(true)
    setPayoutError('')

    const amount = parseFloat(payoutAmount)
    if (isNaN(amount) || amount <= 0) {
      setPayoutError('Please enter a valid payment amount')
      setPaying(false)
      return
    }

    try {
      const res = await fetch('/api/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          type: 'shop_payment',
          direction: settlementDirection,
          amountUsd: amount,
          shopId: shop.id,
          note: payoutNote || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to record shop settlement')

      // Update shop balance in local state:
      // Payout (Desk -> Shop): decreases balance
      // Collection (Shop -> Desk): increases balance
      const delta = settlementDirection === 'collection_from_shop' ? amount : -amount
      setShop(prev => ({
        ...prev,
        balance_usd: Number(prev.balance_usd) + delta,
      }))

      setSettlements(prev => [data.settlement, ...prev])
      setIsPayoutModalOpen(false)
      setPayoutAmount('')
      setPayoutNote('')
    } catch (err: unknown) {
      setPayoutError(err instanceof Error ? err.message : 'Error recording settlement')
    } finally {
      setPaying(false)
    }
  }

  // Handle Editing Shop Details
  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    setSavingEdit(true)
    setEditError('')

    try {
      const res = await fetch(`/api/shops/${shop.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          name: editName,
          phone: editPhone || null,
          address: editAddress || null,
          active: editActive,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update shop')

      setShop(prev => ({
        ...prev,
        name: data.shop.name,
        phone: data.shop.phone,
        address: data.shop.address,
        active: data.shop.active,
      }))
      setIsEditModalOpen(false)
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Error updating shop')
    } finally {
      setSavingEdit(false)
    }
  }

  function openPayoutModal(dir?: 'payout_to_shop' | 'collection_from_shop') {
    const chosenDir = dir || (currentBalanceUSD < 0 ? 'collection_from_shop' : 'payout_to_shop')
    setSettlementDirection(chosenDir)
    setPayoutAmount(Math.abs(currentBalanceUSD) > 0 ? Math.abs(currentBalanceUSD).toString() : '')
    setPayoutNote(
      chosenDir === 'collection_from_shop'
        ? `Delivery fee / debt collection from ${shop.name}`
        : `Delivery proceeds payout to ${shop.name}`
    )
    setPayoutError('')
    setIsPayoutModalOpen(true)
  }

  return (
    <>
      {/* Breadcrumb Navigation */}
      <div style={{ marginBottom: 18 }}>
        <Link
          href="/shops"
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
          Back to Shops Directory
        </Link>
      </div>

      {/* Shop Identity Card & Quick Actions */}
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
                borderRadius: 'var(--radius)',
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
              {shop.name
                .split(' ')
                .map(n => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase() || 'S'}
              <span
                style={{
                  position: 'absolute',
                  bottom: -3,
                  right: -3,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: shop.active ? '#10b981' : '#9ca3af',
                  border: '2px solid var(--surface)',
                }}
                title={shop.active ? 'Active Partner Store' : 'Inactive'}
              />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>
                  {shop.name}
                </h1>
                <span className={`badge ${shop.active ? 'badge-delivered' : 'badge-returned'}`}>
                  {shop.active ? 'Active Partner Store' : 'Inactive'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                {shop.phone ? (
                  <a
                    href={getWhatsAppUrl(shop.phone, `Hello ${shop.name}, Cedar Delivery Desk contacting you regarding your store deliveries and balance.`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="whatsapp-badge"
                    style={{ fontSize: 13, padding: '4px 10px' }}
                    title="Chat on WhatsApp"
                  >
                    <WhatsAppIcon size={14} />
                    <span>{shop.phone}</span>
                  </a>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>No phone listed</span>
                )}

                {shop.address && (
                  <>
                    <span style={{ color: 'var(--line)' }}>•</span>
                    <span style={{ fontSize: 13, color: 'var(--text)' }}>
                      {shop.address}
                    </span>
                  </>
                )}

                <span style={{ color: 'var(--line)' }}>•</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Workspace: <strong>{workspace.name}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {canManage && (
              <>
                {currentBalanceUSD >= 0 ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => openPayoutModal('payout_to_shop')}
                    title="Pay cash to merchant (company owes shop)"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <line x1="12" y1="8" x2="12" y2="16" />
                      <line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                    Pay Merchant ({formatUSD(currentBalanceUSD)})
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => openPayoutModal('collection_from_shop')}
                    title="Collect cash debt from merchant (shop owes company)"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#0284c7', borderColor: '#0284c7' }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                      <rect x="2" y="19" width="20" height="2" rx="1" />
                    </svg>
                    Collect from Shop ({formatUSD(Math.abs(currentBalanceUSD))})
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setActiveTab('statement')}
                  title="Generate printable statement for this merchant"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                  Print Statement
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsShopifyModalOpen(true)}
                  title="Configure Shopify webhooks & automated order ingestion"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1.5px solid #95BF47' }}
                >
                  <ShopifyIcon size={15} />
                  <span>Shopify Store</span>
                </button>

                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setEditName(shop.name)
                    setEditPhone(shop.phone || '')
                    setEditAddress(shop.address || '')
                    setEditActive(shop.active)
                    setEditError('')
                    setIsEditModalOpen(true)
                  }}
                  title="Edit store details"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit Store
                </button>
              </>
            )}
          </div>
        </div>
      </div>

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

      {/* ─── Main Content Tabs: Orders History, Payout History, Printable Statement ─── */}
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
              Store Orders ({totalOrdersCount})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('payouts')}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: activeTab === 'payouts' ? 'var(--brand)' : 'transparent',
                color: activeTab === 'payouts' ? '#fff' : 'var(--muted)',
                transition: 'all .15s',
              }}
            >
              Payout Settlements ({settlements.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('statement')}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: activeTab === 'statement' ? 'var(--brand)' : 'transparent',
                color: activeTab === 'statement' ? '#fff' : 'var(--muted)',
                transition: 'all .15s',
              }}
            >
              Printable Statement 📄
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
                placeholder="Search orders, recipient, courier, area…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  fontSize: 12,
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1.5px solid var(--line)',
                  background: 'var(--bg)',
                  minWidth: 220,
                }}
              />
            </div>
          )}
        </div>

        {/* ─── ORDERS VIEW: ITEMIZED STORE DELIVERIES ─── */}
        {activeTab === 'orders' && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order Code</th>
                  <th>Date</th>
                  <th>Recipient & Area</th>
                  <th>Courier / Driver</th>
                  <th>COD Collection</th>
                  <th>Delivery Fee</th>
                  <th>Net Store Credit</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => {
                  const codLbp = usdToLbp(Number(order.collection_usd) || 0, order.usd_to_lbp_rate || workspace.usd_to_lbp)
                  const netCredited = (Number(order.collection_usd) || 0) - (Number(order.delivery_fee_usd) || 0)

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
                          title="Open Live Tracking Page"
                        >
                          #{order.code}
                        </Link>
                      </td>

                      {/* Date */}
                      <td>
                        <span style={{ fontSize: 12 }}>{formatDate(order.created_at)}</span>
                      </td>

                      {/* Recipient */}
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
                                  shopName: shop.name,
                                  collectionUsd: Number(order.collection_usd) || 0,
                                  collectionLbp: codLbp,
                                  driverName: order.driver?.name,
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

                      {/* Driver */}
                      <td>
                        {order.driver ? (
                          <Link
                            href={`/drivers/${order.driver.id}`}
                            style={{ fontWeight: 600, color: 'var(--brand)', textDecoration: 'none', fontSize: 13 }}
                          >
                            {order.driver.name}
                          </Link>
                        ) : (
                          <span style={{ color: 'var(--muted)', fontSize: 12 }}>Unassigned</span>
                        )}
                      </td>

                      {/* COD Collection */}
                      <td>
                        <strong>{formatUSD(Number(order.collection_usd) || 0)}</strong>
                        <small>{formatLBP(codLbp)}</small>
                      </td>

                      {/* Delivery Fee */}
                      <td>
                        <span>{formatUSD(Number(order.delivery_fee_usd) || 0)}</span>
                      </td>

                      {/* Net Store Credit */}
                      <td>
                        {order.status === 'delivered' ? (
                          <strong style={{ color: 'var(--brand)', fontSize: 13.5 }}>
                            {formatUSD(netCredited)}
                          </strong>
                        ) : order.status === 'returned' ? (
                          <strong style={{ color: '#b91c1c', fontSize: 13.5 }} title="Retail return / refund fee ($2.00) billed to store">
                            {formatUSD(netCredited)}
                          </strong>
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
                      <div>{formatUSD(filteredFeesTotal)}</div>
                      <small style={{ fontWeight: 500 }}>Total Fees</small>
                    </td>
                    <td>
                      <div style={{ color: 'var(--brand)' }}>{formatUSD(filteredShopNetTotal)}</div>
                      <small style={{ fontWeight: 500 }}>Net Credited</small>
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
                    : `No ${orderStatusFilter !== 'all' ? orderStatusFilter : ''} orders registered for this store.`}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ─── PAYOUTS VIEW: PAST SETTLEMENT PAYMENTS ─── */}
        {activeTab === 'payouts' && (
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
                          📥 Cash Received from Merchant (Shop → Desk)
                        </span>
                      ) : (
                        <span className="badge badge-delivered">
                          💸 Cash Payout to Merchant (Desk → {shop.name})
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
        )}

        {/* ─── PRINTABLE STATEMENT (INVOICE / SETTLEMENT REPORT) ─── */}
        {activeTab === 'statement' && (
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
        )}
      </div>

      {/* ─── MODAL: RECORD TWO-WAY SHOP SETTLEMENT ─── */}
      <Modal
        isOpen={isPayoutModalOpen}
        onClose={() => setIsPayoutModalOpen(false)}
        title={settlementDirection === 'collection_from_shop' ? `Collect Cash from ${shop.name}` : `Record Payout to ${shop.name}`}
      >
        <form onSubmit={handleRecordPayout}>
          <div style={{ marginBottom: 16 }}>
            {/* Direction Selector */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => {
                  setSettlementDirection('payout_to_shop')
                  setPayoutNote(`Delivery proceeds payout to ${shop.name}`)
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1.5px solid',
                  cursor: 'pointer',
                  textAlign: 'left',
                  background: settlementDirection === 'payout_to_shop' ? 'rgba(20, 83, 45, 0.08)' : 'var(--bg)',
                  borderColor: settlementDirection === 'payout_to_shop' ? 'var(--brand)' : 'var(--line)',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: settlementDirection === 'payout_to_shop' ? 'var(--brand)' : 'var(--text)' }}>
                  💸 Pay Merchant (Desk → Shop)
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  We give cash to store (clears positive balance)
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSettlementDirection('collection_from_shop')
                  setPayoutNote(`Delivery fee / debt collection from ${shop.name}`)
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1.5px solid',
                  cursor: 'pointer',
                  textAlign: 'left',
                  background: settlementDirection === 'collection_from_shop' ? 'rgba(2, 132, 199, 0.08)' : 'var(--bg)',
                  borderColor: settlementDirection === 'collection_from_shop' ? '#0284c7' : 'var(--line)',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: settlementDirection === 'collection_from_shop' ? '#0284c7' : 'var(--text)' }}>
                  📥 Collect from Merchant (Shop → Desk)
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  Store pays cash to company (settles negative debt)
                </div>
              </button>
            </div>

            <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', marginBottom: 16 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>
                {currentBalanceUSD > 0
                  ? 'Current Amount We Owe Shop'
                  : currentBalanceUSD < 0
                  ? 'Current Amount Shop Owes Us'
                  : 'Current Ledger Balance'}
              </span>
              <strong style={{ display: 'block', fontSize: 20, marginTop: 4, color: currentBalanceUSD >= 0 ? 'var(--brand)' : '#0284c7' }}>
                {formatUSD(currentBalanceUSD)}
              </strong>
              <small style={{ color: 'var(--muted)', fontSize: 11 }}>
                ≈ {formatLBP(currentBalanceLBP)} (at {workspace.usd_to_lbp.toLocaleString()} LBP/USD)
              </small>
            </div>
          </div>

          <div className="form-grid">
            <div className="field full">
              <label>
                {settlementDirection === 'collection_from_shop' ? 'Collection Amount (USD)' : 'Payout Amount (USD)'}
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={payoutAmount}
                onChange={e => setPayoutAmount(e.target.value)}
                required
                autoFocus
              />
              {payoutAmount && !isNaN(parseFloat(payoutAmount)) && (
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <small style={{ color: 'var(--muted)' }}>
                    ≈ {formatLBP(usdToLbp(parseFloat(payoutAmount), workspace.usd_to_lbp))}
                  </small>
                  <small style={{ fontWeight: 600, color: 'var(--brand)' }}>
                    Projected Balance After:{' '}
                    {formatUSD(
                      settlementDirection === 'collection_from_shop'
                        ? currentBalanceUSD + parseFloat(payoutAmount)
                        : currentBalanceUSD - parseFloat(payoutAmount)
                    )}
                  </small>
                </div>
              )}
            </div>

            <div className="field full">
              <label>Reference Note (Optional)</label>
              <input
                type="text"
                placeholder={
                  settlementDirection === 'collection_from_shop'
                    ? 'e.g. Received cash for weekly delivery fees, receipt #104'
                    : 'e.g. Cash batch handed to store owner, receipt #104'
                }
                value={payoutNote}
                onChange={e => setPayoutNote(e.target.value)}
              />
            </div>
          </div>

          {payoutError && <p className="error-msg" style={{ marginTop: 12 }}>{payoutError}</p>}

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setIsPayoutModalOpen(false)}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={paying}
              style={{
                background: settlementDirection === 'collection_from_shop' ? '#0284c7' : 'var(--brand)',
                borderColor: settlementDirection === 'collection_from_shop' ? '#0284c7' : 'var(--brand)',
              }}
            >
              {paying
                ? 'Recording…'
                : settlementDirection === 'collection_from_shop'
                ? 'Confirm Cash Collection'
                : 'Confirm Cash Payout'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── MODAL: EDIT SHOP DETAILS ─── */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Partner Store">
        <form onSubmit={handleSaveEdit}>
          <div className="form-grid">
            <div className="field full">
              <label>Store / Merchant Name</label>
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
                placeholder="+961 1 234567"
                value={editPhone}
                onChange={e => setEditPhone(e.target.value)}
              />
            </div>

            <div className="field full">
              <label>Store Address / Pickup Location</label>
              <input
                type="text"
                placeholder="Street, City, Building"
                value={editAddress}
                onChange={e => setEditAddress(e.target.value)}
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
                <span style={{ fontSize: 13, fontWeight: 600 }}>Active Partner Store (available for new orders)</span>
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

      {/* ─── SHOPIFY INTEGRATION MODAL ─── */}
      <ShopifyIntegrationModal
        isOpen={isShopifyModalOpen}
        onClose={() => setIsShopifyModalOpen(false)}
        shop={shop}
        onOrderCreated={() => {
          window.location.reload()
        }}
      />
    </>
  )
}
