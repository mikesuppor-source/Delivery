'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import {
  DataTable,
  Column,
  StatusBadge,
  MoneyText,
  Tabs,
  FilterBar,
  ConfirmDialog,
  Drawer,
  EmptyState,
} from '@/components/ui'
import { useI18n } from '@/lib/i18n'
import type { Database } from '@/lib/supabase/database.types'

type HoldReason = Database['public']['Enums']['hold_reason']

export interface HoldItem extends Record<string, any> {
  id: string
  workspace_id: string
  order_id: string
  hub_id: string
  shelf_code: string | null
  reason: HoldReason
  note: string | null
  deliver_after: string | null
  held_at: string
  held_by: string | null
  released_at: string | null
  released_by: string | null
  release_note: string | null
  hub?: { id: string; name: string } | null
  order?: {
    id: string
    code: string
    status: string
    recipient_name: string | null
    recipient_phone: string | null
    recipient_address: string | null
    collection_usd: number
    delivery_fee_usd: number
    storage_fee_usd: number
    is_held: boolean
    created_at: string
    shop?: { id: string; name: string } | null
    area?: {
      id: string
      name: string
      storage_fee_per_day_usd: number
      free_storage_days: number
    } | null
  } | null
}

export interface HubItem {
  id: string
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  is_default: boolean
  active: boolean
  created_at: string
}

export interface ShelfItem {
  id: string
  hub_id: string
  code: string
  zone_id: string | null
  created_at: string
  zone?: { id: string; name: string } | null
}

export interface WarehouseClientProps {
  workspaceId: string
  userRole?: string
  initialHubs: HubItem[]
  initialShelves: ShelfItem[]
  initialHolds: HoldItem[]
  deliveryAreas: Array<{ id: string; name: string }>
  holdableOrders: Array<{
    id: string
    code: string
    recipient_name: string | null
    recipient_phone: string | null
    recipient_address: string | null
    status: string
    shop?: { name: string } | null
    area?: { name: string } | null
  }>
}

const REASON_LABELS: Record<HoldReason, { label: string; tone: 'warning' | 'info' | 'neutral' | 'accent' | 'danger' }> = {
  weather: { label: 'Severe Weather', tone: 'info' },
  far_zone: { label: 'Far Zone Batch', tone: 'accent' },
  customer_request: { label: 'Customer Rescheduled', tone: 'warning' },
  scheduled: { label: 'Scheduled Future Date', tone: 'info' },
  address_problem: { label: 'Address Issue', tone: 'danger' },
  shop_request: { label: 'Merchant Request', tone: 'neutral' },
  other: { label: 'Other Warehouse Reason', tone: 'neutral' },
}

export function WarehouseClient({
  workspaceId,
  userRole,
  initialHubs,
  initialShelves,
  initialHolds,
  deliveryAreas,
  holdableOrders,
}: WarehouseClientProps) {
  const router = useRouter()
  const { t } = useI18n()
  const canManage = userRole === 'owner' || userRole === 'manager'

  const [activeTab, setActiveTab] = useState<'in_storage' | 'ready' | 'released'>('in_storage')
  const [hubs, setHubs] = useState<HubItem[]>(initialHubs)
  const [shelves, setShelves] = useState<ShelfItem[]>(initialShelves)
  const [holds, setHolds] = useState<HoldItem[]>(initialHolds)

  // Filters
  const [search, setSearch] = useState('')
  const [selectedHubId, setSelectedHubId] = useState<string>('all')
  const [selectedReason, setSelectedReason] = useState<string>('all')
  const [overdueOnly, setOverdueOnly] = useState<boolean>(false)

  // Selection
  const [selectedHoldIds, setSelectedHoldIds] = useState<string[]>([])

  // Modals state
  const [holdModalOpen, setHoldModalOpen] = useState(false)
  const [releaseModalOpen, setReleaseModalOpen] = useState(false)
  const [singleReleaseHold, setSingleReleaseHold] = useState<HoldItem | null>(null)
  const [hubsDrawerOpen, setHubsDrawerOpen] = useState(false)

  // Form states for New Hold
  const [selectedOrderId, setSelectedOrderId] = useState<string>('')
  const [orderSearchText, setOrderSearchText] = useState('')
  const [holdHubId, setHoldHubId] = useState<string>(
    initialHubs.find(h => h.is_default)?.id || initialHubs[0]?.id || '',
  )
  const [holdShelfCode, setHoldShelfCode] = useState<string>('')
  const [holdReason, setHoldReason] = useState<HoldReason>('customer_request')
  const [holdDeliverAfter, setHoldDeliverAfter] = useState<string>('')
  const [holdNote, setHoldNote] = useState<string>('')
  const [submittingHold, setSubmittingHold] = useState(false)
  const [holdError, setHoldError] = useState<string | null>(null)

  // Release note
  const [releaseNote, setReleaseNote] = useState<string>('')
  const [submittingRelease, setSubmittingRelease] = useState(false)

  // Hub / Shelf Creation in Drawer
  const [newHubName, setNewHubName] = useState('')
  const [newHubAddress, setNewHubAddress] = useState('')
  const [newShelfCode, setNewShelfCode] = useState('')
  const [newShelfHubId, setNewShelfHubId] = useState<string>(initialHubs[0]?.id || '')
  const [newShelfZoneId, setNewShelfZoneId] = useState<string>('')
  const [submittingHub, setSubmittingHub] = useState(false)

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])

  // Helper to calculate days held and storage fee estimate
  function getHoldMetrics(item: HoldItem) {
    const heldAt = new Date(item.held_at).getTime()
    const releasedAt = item.released_at ? new Date(item.released_at).getTime() : Date.now()
    const daysHeld = Math.max(0, Math.floor((releasedAt - heldAt) / (86400 * 1000)))
    const freeDays = item.order?.area?.free_storage_days ?? 3
    const feePerDay = item.order?.area?.storage_fee_per_day_usd ?? 0
    const billableDays = Math.max(0, daysHeld - freeDays)
    const storageFee = Number((billableDays * feePerDay).toFixed(2))
    const isReady = Boolean(item.deliver_after && item.deliver_after <= todayStr)
    const isOverdue = Boolean((item.deliver_after && item.deliver_after < todayStr) || daysHeld > 7)
    return { daysHeld, billableDays, storageFee, isReady, isOverdue }
  }

  // Filtered lists
  const filteredHolds = useMemo(() => {
    return holds.filter(item => {
      // Tab filter
      if (activeTab === 'in_storage' && item.released_at !== null) return false
      if (activeTab === 'released' && item.released_at === null) return false
      if (activeTab === 'ready') {
        if (item.released_at !== null) return false
        if (!item.deliver_after || item.deliver_after > todayStr) return false
      }

      // Hub filter
      if (selectedHubId !== 'all' && item.hub_id !== selectedHubId) return false

      // Reason filter
      if (selectedReason !== 'all' && item.reason !== selectedReason) return false

      const metrics = getHoldMetrics(item)
      if (overdueOnly && !metrics.isOverdue) return false

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase()
        const code = (item.order?.code || '').toLowerCase()
        const recipient = (item.order?.recipient_name || '').toLowerCase()
        const phone = (item.order?.recipient_phone || '').toLowerCase()
        const shop = (item.order?.shop?.name || '').toLowerCase()
        const shelf = (item.shelf_code || '').toLowerCase()
        if (!code.includes(q) && !recipient.includes(q) && !phone.includes(q) && !shop.includes(q) && !shelf.includes(q)) {
          return false
        }
      }

      return true
    })
  }, [holds, activeTab, selectedHubId, selectedReason, overdueOnly, search, todayStr])

  // Tab counts
  const inStorageCount = useMemo(() => holds.filter(h => h.released_at === null).length, [holds])
  const readyCount = useMemo(
    () => holds.filter(h => h.released_at === null && h.deliver_after && h.deliver_after <= todayStr).length,
    [holds, todayStr],
  )
  const releasedCount = useMemo(() => holds.filter(h => h.released_at !== null).length, [holds])

  // Total accumulated storage fee for in_storage items
  const totalStorageFeeInStorage = useMemo(() => {
    return holds
      .filter(h => h.released_at === null)
      .reduce((sum, h) => sum + getHoldMetrics(h).storageFee, 0)
  }, [holds])

  // Handle single release trigger
  function promptReleaseSingle(item: HoldItem) {
    setSingleReleaseHold(item)
    setSelectedHoldIds([item.id])
    setReleaseNote('')
    setReleaseModalOpen(true)
  }

  // Handle bulk release trigger
  function promptReleaseBulk() {
    if (selectedHoldIds.length === 0) return
    setSingleReleaseHold(null)
    setReleaseNote('')
    setReleaseModalOpen(true)
  }

  // Execute release
  async function executeRelease() {
    if (selectedHoldIds.length === 0) return
    setSubmittingRelease(true)

    try {
      const orderIdsToRelease: string[] = []
      for (const holdId of selectedHoldIds) {
        const item = holds.find(h => h.id === holdId)
        if (item && item.order?.id) {
          orderIdsToRelease.push(item.order.id)
        }
      }

      if (orderIdsToRelease.length === 0) {
        setReleaseModalOpen(false)
        return
      }

      const res = await fetch('/api/warehouse/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          orderIds: orderIdsToRelease,
          note: releaseNote.trim() || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to release order(s)')
      }

      // Optimistic update
      const nowIso = new Date().toISOString()
      setHolds(prev =>
        prev.map(item => {
          if (orderIdsToRelease.includes(item.order_id)) {
            return {
              ...item,
              released_at: nowIso,
              release_note: releaseNote.trim() || null,
              order: item.order ? { ...item.order, is_held: false, status: 'pending' } : null,
            }
          }
          return item
        }),
      )

      setSelectedHoldIds([])
      setReleaseModalOpen(false)
      router.refresh()
    } catch (err: any) {
      alert(err.message || 'Release error')
    } finally {
      setSubmittingRelease(false)
    }
  }

  // Execute hold creation
  async function executeCreateHold(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedOrderId) {
      setHoldError('Please select or search an order to hold.')
      return
    }
    if (!holdHubId) {
      setHoldError('Please select a warehouse hub.')
      return
    }

    setSubmittingHold(true)
    setHoldError(null)

    try {
      const res = await fetch('/api/warehouse/hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          orderIds: [selectedOrderId],
          hubId: holdHubId,
          shelfCode: holdShelfCode.trim() || null,
          reason: holdReason,
          note: holdNote.trim() || null,
          deliverAfter: holdDeliverAfter || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to hold order')
      }

      setHoldModalOpen(false)
      setSelectedOrderId('')
      setHoldShelfCode('')
      setHoldDeliverAfter('')
      setHoldNote('')
      router.refresh()

      // Fetch fresh holds
      const listRes = await fetch(`/api/warehouse?workspaceId=${workspaceId}&tab=in_storage`)
      if (listRes.ok) {
        const listData = await listRes.json()
        if (listData.holds) setHolds(listData.holds)
      }
    } catch (err: any) {
      setHoldError(err.message || 'Hold failed')
    } finally {
      setSubmittingHold(false)
    }
  }

  // Create new Hub
  async function handleCreateHub(e: React.FormEvent) {
    e.preventDefault()
    if (!newHubName.trim()) return
    setSubmittingHub(true)
    try {
      const res = await fetch('/api/hubs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'hub',
          workspaceId,
          name: newHubName.trim(),
          address: newHubAddress.trim() || null,
          isDefault: hubs.length === 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create hub')
      setHubs(prev => [...prev, data.hub])
      setNewHubName('')
      setNewHubAddress('')
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSubmittingHub(false)
    }
  }

  // Create new Shelf
  async function handleCreateShelf(e: React.FormEvent) {
    e.preventDefault()
    if (!newShelfCode.trim() || !newShelfHubId) return
    setSubmittingHub(true)
    try {
      const res = await fetch('/api/hubs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'shelf',
          workspaceId,
          hubId: newShelfHubId,
          code: newShelfCode.trim().toUpperCase(),
          zoneId: newShelfZoneId || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create shelf')
      setShelves(prev => [...prev, data.shelf])
      setNewShelfCode('')
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSubmittingHub(false)
    }
  }

  // Filterable candidate orders for the hold modal
  const filteredHoldableOrders = useMemo(() => {
    if (!orderSearchText.trim()) return holdableOrders.slice(0, 10)
    const q = orderSearchText.toLowerCase()
    return holdableOrders.filter(
      o =>
        o.code.toLowerCase().includes(q) ||
        (o.recipient_name || '').toLowerCase().includes(q) ||
        (o.recipient_phone || '').includes(q) ||
        (o.shop?.name || '').toLowerCase().includes(q),
    )
  }, [holdableOrders, orderSearchText])

  // Table Columns
  const columns: Column<HoldItem>[] = [
    {
      key: 'code',
      header: 'Tracking Code',
      width: '160px',
      render: item => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Link
            href={`/orders?search=${encodeURIComponent(item.order?.code || '')}`}
            style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: 13, color: 'var(--ui-primary)' }}
          >
            {item.order?.code || '—'}
          </Link>
          <span style={{ fontSize: 11, color: 'var(--ui-text-muted)' }}>
            {item.order?.shop?.name || 'Direct Shop'}
          </span>
        </div>
      ),
    },
    {
      key: 'recipient',
      header: 'Recipient & Zone',
      render: item => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontWeight: 600, color: 'var(--ui-text)' }}>
            {item.order?.recipient_name || 'Customer'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ui-text-muted)' }}>
            {item.order?.recipient_phone} • {item.order?.area?.name || 'Standard Area'}
          </div>
        </div>
      ),
    },
    {
      key: 'location',
      header: 'Hub & Shelf',
      width: '170px',
      render: item => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              padding: '3px 8px',
              background: 'var(--ui-surface-2)',
              border: '1px solid var(--ui-border)',
              borderRadius: 4,
              fontFamily: 'monospace',
              fontWeight: 800,
              fontSize: 12,
              color: 'var(--ui-text)',
            }}
          >
            {item.shelf_code || 'UNASSIGNED'}
          </span>
          <span style={{ fontSize: 11, color: 'var(--ui-text-muted)' }}>
            {item.hub?.name || 'Hub'}
          </span>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Hold Reason',
      width: '170px',
      render: item => {
        const meta = REASON_LABELS[item.reason] || { label: item.reason, tone: 'neutral' }
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <StatusBadge status="held" labelOverride={meta.label} size="sm" />
            {item.note && (
              <span style={{ fontSize: 11, color: 'var(--ui-text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.note}>
                {item.note}
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: 'held_at',
      header: 'Held Since / Days',
      width: '150px',
      render: item => {
        const { daysHeld } = getHoldMetrics(item)
        const dateStr = new Date(item.held_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--ui-text)' }}>
              {daysHeld === 0 ? 'Today' : `${daysHeld} day${daysHeld > 1 ? 's' : ''}`}
            </span>
            <span style={{ fontSize: 11, color: 'var(--ui-text-muted)' }}>
              Since {dateStr}
            </span>
          </div>
        )
      },
    },
    {
      key: 'deliver_after',
      header: 'Deliver After',
      width: '140px',
      render: item => {
        if (!item.deliver_after) return <span style={{ color: 'var(--ui-text-muted)', fontSize: 12 }}>—</span>
        const { isReady, isOverdue } = getHoldMetrics(item)
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: isOverdue ? 'var(--ui-danger)' : isReady ? 'var(--ui-success)' : 'var(--ui-text)' }}>
              {item.deliver_after}
            </span>
            {isReady && !item.released_at && (
              <span
                style={{
                  fontSize: 9.5,
                  padding: '2px 5px',
                  borderRadius: 3,
                  background: isOverdue ? 'var(--ui-danger-soft)' : 'var(--ui-success-soft)',
                  color: isOverdue ? 'var(--ui-danger)' : 'var(--ui-success)',
                  fontWeight: 800,
                }}
              >
                {isOverdue ? 'OVERDUE' : 'READY'}
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: 'fee',
      header: 'Storage Fee',
      width: '120px',
      render: item => {
        const { storageFee } = getHoldMetrics(item)
        return <MoneyText amount={storageFee} currency="USD" size="sm" />
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '130px',
      render: item => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {item.released_at === null ? (
            <button
              type="button"
              onClick={() => promptReleaseSingle(item)}
              className="ui-btn ui-btn--primary ui-btn--sm"
              style={{ fontSize: 11, padding: '4px 8px' }}
              title="Release parcel to delivery dispatch"
            >
              Release
            </button>
          ) : (
            <StatusBadge status="delivered" labelOverride="Released" size="sm" />
          )}

          <Link
            href={`/print/order/${encodeURIComponent(item.order?.code || '')}`}
            target="_blank"
            className="ui-btn ui-btn--subtle ui-btn--sm"
            style={{ fontSize: 11, padding: '4px 6px' }}
            title="Print package label"
          >
            🖨️
          </Link>
        </div>
      ),
    },
  ]

  return (
    <div>
      {/* Top Header */}
      <PageHeader
        title={t('navWarehouse')}
        breadcrumbs={[
          { label: 'Overview', href: '/' },
          { label: 'Warehouse Hub', href: '/warehouse' },
        ]}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link
              href="/scan"
              className="ui-btn ui-btn--subtle ui-btn--sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <span>📷</span>
              <span>Warehouse Scan</span>
            </Link>

            {canManage && (
              <button
                type="button"
                onClick={() => setHubsDrawerOpen(true)}
                className="ui-btn ui-btn--subtle ui-btn--sm"
              >
                Hubs & Shelves
              </button>
            )}

            {canManage && (
              <button
                type="button"
                onClick={() => setHoldModalOpen(true)}
                className="ui-btn ui-btn--primary ui-btn--sm"
                style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <span>＋</span>
                <span>Hold Parcel</span>
              </button>
            )}
          </div>
        }
      />

      {/* KPI row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
          margin: '20px 0',
        }}
      >
        <div className="ui-kpi-card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 12, color: 'var(--ui-text-muted)', fontWeight: 600 }}>Parcels In Storage</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ui-primary)', marginTop: 4 }}>
            {inStorageCount}
          </div>
        </div>

        <div className="ui-kpi-card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 12, color: 'var(--ui-text-muted)', fontWeight: 600 }}>Ready to Release Today</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: readyCount > 0 ? 'var(--ui-success)' : 'var(--ui-text)', marginTop: 4 }}>
            {readyCount}
          </div>
        </div>

        <div className="ui-kpi-card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 12, color: 'var(--ui-text-muted)', fontWeight: 600 }}>Storage Fees Accumulated</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ui-text)', marginTop: 4 }}>
            ${totalStorageFeeInStorage.toFixed(2)}
          </div>
        </div>

        <div className="ui-kpi-card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 12, color: 'var(--ui-text-muted)', fontWeight: 600 }}>Active Hubs</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ui-text)', marginTop: 4 }}>
            {hubs.length} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ui-text-muted)' }}>({shelves.length} shelves)</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ marginBottom: 16 }}>
        <Tabs
          items={[
            { id: 'in_storage', label: `In Storage (${inStorageCount})`, content: null },
            { id: 'ready', label: `Ready to Release (${readyCount})`, content: null },
            { id: 'released', label: `Released History (${releasedCount})`, content: null },
          ]}
          activeId={activeTab}
          onChange={tab => setActiveTab(tab as any)}
        />
      </div>

      {/* Filter Bar */}
      <div style={{ marginBottom: 16 }}>
        <FilterBar
          search={{
            value: search,
            onChange: setSearch,
            placeholder: 'Search order code, recipient, phone, shop, shelf...',
          }}
          onClearAll={() => {
            setSearch('')
            setSelectedHubId('all')
            setSelectedReason('all')
            setOverdueOnly(false)
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={selectedHubId}
              onChange={e => setSelectedHubId(e.target.value)}
              className="ui-select"
              style={{ fontSize: 13, padding: '6px 10px' }}
            >
              <option value="all">All Hubs</option>
              {hubs.map(h => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
            <select
              value={selectedReason}
              onChange={e => setSelectedReason(e.target.value)}
              className="ui-select"
              style={{ fontSize: 13, padding: '6px 10px' }}
            >
              <option value="all">All Reasons</option>
              {Object.entries(REASON_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </FilterBar>
      </div>

      {/* Bulk action bar */}
      {selectedHoldIds.length > 0 && activeTab !== 'released' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--ui-primary-soft)',
            border: '1.5px solid var(--ui-primary)',
            borderRadius: 'var(--ui-radius)',
            padding: '10px 16px',
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ui-primary)' }}>
            {selectedHoldIds.length} parcel{selectedHoldIds.length > 1 ? 's' : ''} selected
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={promptReleaseBulk}
              className="ui-btn ui-btn--primary ui-btn--sm"
              style={{ fontWeight: 700 }}
            >
              Release Selected to Dispatch
            </button>
            <button
              type="button"
              onClick={() => setSelectedHoldIds([])}
              className="ui-btn ui-btn--subtle ui-btn--sm"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Main DataTable */}
      <DataTable
        columns={columns}
        data={filteredHolds}
        keyField="id"
        selectedKeys={new Set(selectedHoldIds)}
        onSelectionChange={set => setSelectedHoldIds(Array.from(set))}
        emptyMessage={
          <EmptyState
            icon="📦"
            title="No warehouse holds found"
            description={
              activeTab === 'in_storage'
                ? 'All orders are currently dispatched or delivered.'
                : activeTab === 'ready'
                ? 'No held parcels have reached their scheduled deliver date today.'
                : 'No release history records found.'
            }
          />
        }
      />

      {/* Hold Order Modal */}
      {holdModalOpen && (
        <div
          className="ui-modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            className="ui-modal"
            style={{
              background: 'var(--ui-surface)',
              border: '1px solid var(--ui-border)',
              borderRadius: 'var(--ui-radius-lg)',
              maxWidth: 540,
              width: '100%',
              padding: 24,
              boxShadow: 'var(--ui-shadow-modal)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: 'var(--ui-text)' }}>
                Hold Parcel in Warehouse
              </h2>
              <button
                type="button"
                onClick={() => setHoldModalOpen(false)}
                className="ui-btn ui-btn--subtle ui-btn--sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={executeCreateHold} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Order selector */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--ui-text)' }}>
                  Select Order to Hold *
                </label>
                <input
                  type="text"
                  placeholder="Type order code, customer phone, name..."
                  value={orderSearchText}
                  onChange={e => setOrderSearchText(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--ui-border)',
                    background: 'var(--ui-surface-2)',
                    color: 'var(--ui-text)',
                    fontSize: 13,
                    marginBottom: 6,
                  }}
                />
                <select
                  value={selectedOrderId}
                  onChange={e => setSelectedOrderId(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--ui-border)',
                    background: 'var(--ui-surface-2)',
                    color: 'var(--ui-text)',
                    fontSize: 13,
                  }}
                >
                  <option value="">-- Choose an order ({filteredHoldableOrders.length} matches) --</option>
                  {filteredHoldableOrders.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.code} — {o.recipient_name} ({o.recipient_phone}) • {o.shop?.name} [{o.status}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Hub and Shelf row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--ui-text)' }}>
                    Warehouse Hub *
                  </label>
                  <select
                    value={holdHubId}
                    onChange={e => setHoldHubId(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '1px solid var(--ui-border)',
                      background: 'var(--ui-surface-2)',
                      color: 'var(--ui-text)',
                      fontSize: 13,
                    }}
                  >
                    {hubs.map(h => (
                      <option key={h.id} value={h.id}>
                        {h.name} {h.is_default ? '(Default)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--ui-text)' }}>
                    Shelf Location
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. A-03, B-01"
                    value={holdShelfCode}
                    onChange={e => setHoldShelfCode(e.target.value.toUpperCase())}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '1px solid var(--ui-border)',
                      background: 'var(--ui-surface-2)',
                      color: 'var(--ui-text)',
                      fontSize: 13,
                      fontFamily: 'monospace',
                    }}
                  />
                </div>
              </div>

              {/* Hold Reason & Deliver After */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--ui-text)' }}>
                    Reason for Hold *
                  </label>
                  <select
                    value={holdReason}
                    onChange={e => setHoldReason(e.target.value as HoldReason)}
                    required
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '1px solid var(--ui-border)',
                      background: 'var(--ui-surface-2)',
                      color: 'var(--ui-text)',
                      fontSize: 13,
                    }}
                  >
                    {Object.entries(REASON_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--ui-text)' }}>
                    Deliver After (Release Date)
                  </label>
                  <input
                    type="date"
                    value={holdDeliverAfter}
                    min={todayStr}
                    onChange={e => setHoldDeliverAfter(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '1px solid var(--ui-border)',
                      background: 'var(--ui-surface-2)',
                      color: 'var(--ui-text)',
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>

              {/* Note */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--ui-text)' }}>
                  Internal Notes / Instructions
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional details for warehouse staff and dispatch..."
                  value={holdNote}
                  onChange={e => setHoldNote(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--ui-border)',
                    background: 'var(--ui-surface-2)',
                    color: 'var(--ui-text)',
                    fontSize: 13,
                    resize: 'vertical',
                  }}
                />
              </div>

              {holdError && (
                <div style={{ fontSize: 12, color: 'var(--ui-danger)', background: 'var(--ui-danger-soft)', padding: '8px 12px', borderRadius: 6 }}>
                  {holdError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setHoldModalOpen(false)}
                  className="ui-btn ui-btn--subtle"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingHold}
                  className="ui-btn ui-btn--primary"
                  style={{ fontWeight: 700 }}
                >
                  {submittingHold ? 'Saving...' : 'Confirm Warehouse Hold'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Release Confirmation Dialog */}
      <ConfirmDialog
        isOpen={releaseModalOpen}
        title="Release Parcel(s) to Delivery Dispatch"
        description={
          <div>
            <p style={{ margin: '0 0 12px' }}>
              {singleReleaseHold
                ? `Release order ${singleReleaseHold.order?.code || ''}? It will be returned to pending status and ready for courier dispatch.`
                : `Release ${selectedHoldIds.length} parcel(s) from warehouse to dispatch?`}
            </p>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--ui-text)' }}>
                Release Note (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Customer confirmed delivery address / weather cleared"
                value={releaseNote}
                onChange={e => setReleaseNote(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--ui-border)',
                  background: 'var(--ui-surface-2)',
                  color: 'var(--ui-text)',
                  fontSize: 13,
                }}
              />
            </div>
          </div>
        }
        confirmLabel={submittingRelease ? 'Releasing...' : 'Release to Dispatch'}
        tone="primary"
        loading={submittingRelease}
        onConfirm={executeRelease}
        onClose={() => setReleaseModalOpen(false)}
      />

      {/* Hubs & Shelves Management Drawer */}
      <Drawer
        isOpen={hubsDrawerOpen}
        onClose={() => setHubsDrawerOpen(false)}
        title="Hubs & Warehouse Shelves"
        width="460px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '16px 0' }}>
          {/* Add Hub Form */}
          <div style={{ border: '1px solid var(--ui-border)', borderRadius: 'var(--ui-radius)', padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 12px 0', color: 'var(--ui-text)' }}>
              Add New Hub
            </h3>
            <form onSubmit={handleCreateHub} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                type="text"
                placeholder="Hub Name (e.g. Tripoli Branch Hub)"
                value={newHubName}
                onChange={e => setNewHubName(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--ui-border)',
                  background: 'var(--ui-surface-2)',
                  fontSize: 13,
                }}
              />
              <input
                type="text"
                placeholder="Hub Address"
                value={newHubAddress}
                onChange={e => setNewHubAddress(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--ui-border)',
                  background: 'var(--ui-surface-2)',
                  fontSize: 13,
                }}
              />
              <button
                type="submit"
                disabled={submittingHub}
                className="ui-btn ui-btn--primary ui-btn--sm"
                style={{ alignSelf: 'flex-start' }}
              >
                Create Hub
              </button>
            </form>
          </div>

          {/* Add Shelf Form */}
          <div style={{ border: '1px solid var(--ui-border)', borderRadius: 'var(--ui-radius)', padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 12px 0', color: 'var(--ui-text)' }}>
              Add Shelf Location
            </h3>
            <form onSubmit={handleCreateShelf} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <select
                value={newShelfHubId}
                onChange={e => setNewShelfHubId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--ui-border)',
                  background: 'var(--ui-surface-2)',
                  fontSize: 13,
                }}
              >
                {hubs.map(h => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Shelf Code (e.g. C-01, B-05)"
                value={newShelfCode}
                onChange={e => setNewShelfCode(e.target.value.toUpperCase())}
                required
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--ui-border)',
                  background: 'var(--ui-surface-2)',
                  fontSize: 13,
                  fontFamily: 'monospace',
                }}
              />

              <select
                value={newShelfZoneId}
                onChange={e => setNewShelfZoneId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--ui-border)',
                  background: 'var(--ui-surface-2)',
                  fontSize: 13,
                }}
              >
                <option value="">-- Optional Delivery Zone Assignment --</option>
                {deliveryAreas.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>

              <button
                type="submit"
                disabled={submittingHub}
                className="ui-btn ui-btn--primary ui-btn--sm"
                style={{ alignSelf: 'flex-start' }}
              >
                Create Shelf
              </button>
            </form>
          </div>

          {/* Existing Shelves list */}
          <div>
            <h4 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--ui-text)' }}>
              Configured Shelves ({shelves.length})
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {shelves.map(s => (
                <div
                  key={s.id}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 4,
                    background: 'var(--ui-surface-2)',
                    border: '1px solid var(--ui-border)',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    fontWeight: 700,
                  }}
                >
                  {s.code} {s.zone ? `(${s.zone.name})` : ''}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Drawer>
    </div>
  )
}
