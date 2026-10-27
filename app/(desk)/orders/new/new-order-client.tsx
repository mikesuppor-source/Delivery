'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LocationHelper } from '@/components/location-helper'
import { searchLebaneseTowns, type TownSearchResult } from '@/lib/lebanon-geo'
import { formatUSD } from '@/lib/utils'
import type { UserRole } from '@/lib/auth'

interface Shop {
  id: string
  name: string
  phone?: string | null
}

interface Driver {
  id: string
  name: string
  phone?: string | null
}

interface DeliveryArea {
  id: string
  name: string
  fee_usd: number
}

interface NewOrderClientProps {
  workspaceId: string
  workspaceName: string
  shops: Shop[]
  drivers: Driver[]
  areas: DeliveryArea[]
  userRole: UserRole
  rate: number
}

export function NewOrderClient({
  workspaceId,
  workspaceName,
  shops,
  drivers,
  areas,
  userRole: _userRole,
  rate,
}: NewOrderClientProps) {
  const router = useRouter()

  // Form State
  const [shopId, setShopId] = useState(shops[0]?.id || '')
  const [driverId, setDriverId] = useState('')
  const [areaId, setAreaId] = useState(areas[0]?.id || '')
  const [netItemUsd, setNetItemUsd] = useState('25')
  const [deliveryFeeUsd, setDeliveryFeeUsd] = useState(String(areas[0]?.fee_usd || '3'))
  const [driverPayUsd, setDriverPayUsd] = useState(String(Math.max(1, (areas[0]?.fee_usd || 3) - 1)))
  // Pricing Mode: 'added' (Default: delivery fee added onto net order for customer) vs 'free_delivery' (shop absorbs fee)
  const [pricingMode, setPricingMode] = useState<'added' | 'free_delivery'>('added')
  const [customCode, setCustomCode] = useState('')

  // Customer & Geo
  const [recipientName, setRecipientName] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [recipientAddress, setRecipientAddress] = useState('')
  const [destinationTown, setDestinationTown] = useState('')
  const [townSearchQuery, setTownSearchQuery] = useState('')
  const [townSearchResults, setTownSearchResults] = useState<TownSearchResult[]>([])
  const [isTownDropdownOpen, setIsTownDropdownOpen] = useState(false)

  // Package Specs
  const [serviceType, setServiceType] = useState<'delivery' | 'replacement' | 'pickup'>('delivery')
  const [weightKg, setWeightKg] = useState('1')
  const [isBreakable, setIsBreakable] = useState(false)
  const [carrierTrackingCode, setCarrierTrackingCode] = useState('')
  const [notes, setNotes] = useState('')

  // CRM Match
  const [phoneMatchedCustomer, setPhoneMatchedCustomer] = useState<{
    name: string
    address: string
    notes?: string | null
    orders_count?: number
  } | null>(null)

  // Submission Status
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [createdOrderCode, setCreatedOrderCode] = useState<string | null>(null)

  // Live Lebanese Phone CRM Lookup
  useEffect(() => {
    const clean = recipientPhone.replace(/\D/g, '')
    if (clean.length < 6) {
      setPhoneMatchedCustomer(null)
      return
    }
    const timer = setTimeout(() => {
      fetch(`/api/customers/lookup?phone=${encodeURIComponent(clean)}`)
        .then(r => r.json())
        .then(d => {
          if (d && d.customer) {
            setPhoneMatchedCustomer(d.customer)
          } else {
            setPhoneMatchedCustomer(null)
          }
        })
        .catch(() => setPhoneMatchedCustomer(null))
    }, 350)
    return () => clearTimeout(timer)
  }, [recipientPhone])

  // Town Search
  useEffect(() => {
    if (townSearchQuery.trim().length >= 2) {
      const results = searchLebaneseTowns(townSearchQuery, 10)
      setTownSearchResults(results)
      setIsTownDropdownOpen(true)
    } else {
      setTownSearchResults([])
      setIsTownDropdownOpen(false)
    }
  }, [townSearchQuery])

  function handleAreaChange(newAreaId: string) {
    setAreaId(newAreaId)
    const sel = areas.find(a => a.id === newAreaId)
    if (sel) {
      setDeliveryFeeUsd(String(sel.fee_usd))
      setDriverPayUsd(String(Math.max(1, Number(sel.fee_usd) - 1)))
    }
  }

  function handleSelectTown(result: TownSearchResult) {
    setDestinationTown(result.townAr || result.townEn)
    setTownSearchQuery(`${result.governorateAr} - ${result.cazaAr} - ${result.townAr} (${result.townEn})`)
    setIsTownDropdownOpen(false)
    if (!recipientAddress) {
      setRecipientAddress(`${result.governorateEn}, ${result.cazaEn}, ${result.townEn}`)
    }
  }

  function resetForm() {
    setCustomCode('')
    setRecipientName('')
    setRecipientPhone('')
    setRecipientAddress('')
    setDestinationTown('')
    setTownSearchQuery('')
    setNotes('')
    setServiceType('delivery')
    setWeightKg('1')
    setIsBreakable(false)
    setCarrierTrackingCode('')
    setPhoneMatchedCustomer(null)
    setNetItemUsd('25')
    setPricingMode('added')
    if (areas[0]) {
      setAreaId(areas[0].id)
      setDeliveryFeeUsd(String(areas[0].fee_usd))
      setDriverPayUsd(String(Math.max(1, areas[0].fee_usd - 1)))
    }
  }

  // Financial Computations
  const netItemNum = Number(netItemUsd) || 0
  const feeUsdNum = Number(deliveryFeeUsd) || 0
  const driverPayNum = Number(driverPayUsd) || 0

  // Total cash collected at doorstep (COD):
  // When 'added' (Fee added on top of Net order value): COD = Net Item Value + Delivery Fee (e.g. $25 + $3 = $28)
  // When 'free_delivery' (Shop absorbs fee): COD = Net Item Value (e.g. $25)
  const codUsdNum = pricingMode === 'added' ? netItemNum + feeUsdNum : netItemNum
  const codLbpApprox = codUsdNum * rate

  // In database trigger: shop_balance_usd = collection_usd - delivery_fee_usd
  // When 'added': collection_usd is $28, fee is $3 -> shop gets $28 - $3 = $25 (100% of their Net Item Value!)
  // When 'free_delivery': collection_usd is $25, fee is $3 -> shop gets $25 - $3 = $22 (shop absorbs fee)
  const shopNetUsd = codUsdNum - feeUsdNum
  const companyMarginUsd = feeUsdNum - driverPayNum

  async function submitOrder(keepOnPage: boolean) {
    setError('')
    setSubmitting(true)
    setCreatedOrderCode(null)

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          code: customCode.trim() || undefined,
          shopId: shopId || null,
          driverId: driverId || null,
          areaId: areaId || null,
          collectionUsd: codUsdNum,
          deliveryFeeUsd: feeUsdNum,
          driverPayUsd: driverPayNum,
          recipientName,
          recipientPhone,
          recipientAddress,
          serviceType,
          weightKg: Number(weightKg) || 1.0,
          isBreakable,
          carrierTrackingCode: carrierTrackingCode.trim() || undefined,
          destinationTown: destinationTown.trim() || undefined,
          notes,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create order')

      const code = data.order?.code || 'SUCCESS'
      setCreatedOrderCode(code)

      if (keepOnPage) {
        resetForm()
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        router.push('/orders')
        router.refresh()
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error creating order')
    } finally {
      setSubmitting(false)
    }
  }

  const currentShop = shops.find(s => s.id === shopId)
  const currentDriver = drivers.find(d => d.id === driverId)
  const currentArea = areas.find(a => a.id === areaId)

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 100 }}>
      {/* ─── Breadcrumbs & Header ────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <Link
          href="/orders"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--brand)',
            marginBottom: 10,
          }}
        >
          ← Back to Orders Dashboard
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.5px', margin: 0 }}>
              Create New Delivery Order
            </h1>
            <p style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 4 }}>
              Enter parcel information, customer destination, and cash collection breakdown to generate a waybill.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/orders" className="btn btn-secondary">
              Cancel
            </Link>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={submitting}
              onClick={() => submitOrder(true)}
              style={{ fontWeight: 600 }}
            >
              {submitting ? 'Creating…' : 'Create & Add Another'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={submitting}
              onClick={() => submitOrder(false)}
              style={{ fontWeight: 700 }}
            >
              {submitting ? 'Creating…' : 'Create Order →'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── Banners ──────────────────────────────────────────────────────── */}
      {createdOrderCode && (
        <div
          style={{
            background: 'var(--brand-light)',
            border: '1.5px solid var(--brand)',
            borderRadius: 12,
            padding: '14px 20px',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <strong style={{ color: 'var(--brand)', fontSize: 14 }}>
              Order #{createdOrderCode} created successfully
            </strong>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
              Waybill barcode and tracking link are active. Form is cleared and ready for the next parcel.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link
              href={`/print/order/${createdOrderCode}`}
              target="_blank"
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 12, borderColor: 'var(--brand)', color: 'var(--brand)' }}
            >
              Print Waybill Slip
            </Link>
            <Link
              href={`/track/${createdOrderCode}`}
              target="_blank"
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 12 }}
            >
              Public Tracking View
            </Link>
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1.5px solid #fecaca',
            color: '#991b1b',
            borderRadius: 12,
            padding: '14px 18px',
            marginBottom: 24,
            fontSize: 13.5,
          }}
        >
          <strong>Error creating order:</strong> {error}
        </div>
      )}

      {/* ─── Form Grid Cards ──────────────────────────────────────────────── */}
      <form onSubmit={e => { e.preventDefault(); submitOrder(false) }} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        
        {/* ROW 1: Customer Destination & Geo (All Location & Contact together) */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1.5px solid var(--line)',
            borderRadius: 16,
            padding: '24px 22px',
            boxShadow: 'var(--shadow)',
          }}
        >
          <div style={{ marginBottom: 18, borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              1. Customer & Delivery Destination
            </h3>
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Who is receiving the parcel and where should the courier deliver it?</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {/* Recipient Name */}
            <div className="field">
              <label htmlFor="recipient-name">
                Customer / Recipient Full Name <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                id="recipient-name"
                type="text"
                placeholder="e.g. Maya Haddad"
                value={recipientName}
                onChange={e => setRecipientName(e.target.value)}
                required
              />
            </div>

            {/* Phone & Live CRM */}
            <div className="field">
              <label htmlFor="recipient-phone">
                Phone Number <span style={{ color: 'var(--muted)', fontSize: 11 }}>(e.g. +961 70 123456)</span>
              </label>
              <input
                id="recipient-phone"
                type="tel"
                placeholder="e.g. +961 70 123456"
                value={recipientPhone}
                onChange={e => setRecipientPhone(e.target.value)}
              />
            </div>

            {/* Delivery Area / Tariff Zone (Cleanly placed here in the Destination section!) */}
            <div className="field">
              <label htmlFor="area-id">
                Delivery Area / Tariff Zone <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <select
                id="area-id"
                value={areaId}
                onChange={e => handleAreaChange(e.target.value)}
              >
                {areas.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} — Standard Fee: ${Number(a.fee_usd).toFixed(2)}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                Selected zone sets standard delivery fee and driver commission
              </span>
            </div>
          </div>

          {phoneMatchedCustomer && (
            <div
              style={{
                background: 'rgba(37, 99, 235, 0.08)',
                border: '1.5px solid rgba(37, 99, 235, 0.3)',
                borderRadius: 10,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginTop: 14,
              }}
            >
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1d4ed8' }}>
                  Repeat Customer: {phoneMatchedCustomer.name}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                  {phoneMatchedCustomer.orders_count || 1} past orders · {phoneMatchedCustomer.address || 'Address on file'}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' }}
                onClick={() => {
                  if (phoneMatchedCustomer.name) setRecipientName(phoneMatchedCustomer.name)
                  if (phoneMatchedCustomer.address) setRecipientAddress(phoneMatchedCustomer.address)
                  if (phoneMatchedCustomer.notes && !notes) setNotes(phoneMatchedCustomer.notes)
                  setPhoneMatchedCustomer(null)
                }}
              >
                Auto-Fill Details
              </button>
            </div>
          )}

          {/* Lebanese Town Search & LocationHelper */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 16 }}>
            {/* Lebanese Administrative Town Hierarchy Search */}
            <div className="field" style={{ position: 'relative' }}>
              <label htmlFor="town-search">
                Lebanese Town & Region / البلدة والمنطقة <span style={{ color: 'var(--muted)', fontSize: 11 }}>(Arabic or English)</span>
              </label>
              <input
                id="town-search"
                type="text"
                placeholder="Type to search town (e.g. زحلة, Sassine, بعبدا, Batroun)..."
                value={townSearchQuery}
                onChange={e => {
                  setTownSearchQuery(e.target.value)
                  setDestinationTown(e.target.value)
                }}
                onFocus={() => {
                  if (townSearchResults.length > 0) setIsTownDropdownOpen(true)
                }}
              />

              {isTownDropdownOpen && townSearchResults.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: 'var(--surface)',
                    border: '1.5px solid var(--line)',
                    borderRadius: 8,
                    boxShadow: 'var(--shadow-lg)',
                    zIndex: 50,
                    maxHeight: 220,
                    overflowY: 'auto',
                    marginTop: 4,
                  }}
                >
                  {townSearchResults.map((t, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleSelectTown(t)}
                      style={{
                        padding: '8px 12px',
                        borderBottom: '1px solid var(--line)',
                        cursor: 'pointer',
                        fontSize: 12.5,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ fontWeight: 700, color: 'var(--text)' }}>
                        {t.governorateAr} - {t.cazaAr} - {t.townAr}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {t.governorateEn} - {t.cazaEn} - {t.townEn}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* LocationHelper & Map Pin */}
            <div className="field">
              <LocationHelper
                id="new-order-address"
                address={recipientAddress}
                onAddressChange={setRecipientAddress}
                label="Detailed Delivery Address / Google Maps Pin"
                placeholder="e.g. Sassine Square, Bldg 14, 2nd Floor or paste Google Maps pin"
                required
              />
            </div>
          </div>

          {/* Notes */}
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="order-notes">Courier Delivery Instructions / Notes</label>
            <input
              id="order-notes"
              type="text"
              placeholder="e.g. Call 10 mins before arrival, fragile glass, leave with building concierge"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* ROW 2: Merchant, Waybill & Package Specifications */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1.5px solid var(--line)',
            borderRadius: 16,
            padding: '24px 22px',
            boxShadow: 'var(--shadow)',
          }}
        >
          <div style={{ marginBottom: 18, borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              2. Merchant & Package Specifications
            </h3>
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
              Sender store, tracking code, service classification, and courier handling
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {/* Select Shop */}
            <div className="field">
              <label htmlFor="shop-id">
                Merchant Store <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <select
                id="shop-id"
                value={shopId}
                onChange={e => setShopId(e.target.value)}
                required
              >
                {shops.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.phone ? `(${s.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Custom Tracking Code / Waybill # */}
            <div className="field">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label htmlFor="custom-code" style={{ margin: 0 }}>
                  Waybill Tracking Code <span style={{ color: 'var(--muted)', fontSize: 11 }}>(Optional)</span>
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const prefix = currentShop ? currentShop.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() : 'ORD'
                      const randomNum = Math.floor(100 + Math.random() * 900)
                      setCustomCode(`${prefix}-${randomNum}`)
                    }}
                    style={{ fontSize: 10.5, padding: '2px 8px' }}
                    title="Generate code with shop prefix (e.g. NIKE-101)"
                  >
                    Shop Prefix
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const randomHex = Math.random().toString(16).substring(2, 8).toUpperCase()
                      setCustomCode(`CD-${randomHex}`)
                    }}
                    style={{ fontSize: 10.5, padding: '2px 8px' }}
                  >
                    Auto Code
                  </button>
                  {customCode && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setCustomCode('')}
                      style={{ fontSize: 10.5, padding: '2px 8px', color: '#dc2626' }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <input
                id="custom-code"
                type="text"
                placeholder="Auto-generated if blank"
                value={customCode}
                onChange={e => setCustomCode(e.target.value)}
                style={{ fontFamily: 'monospace', fontWeight: 600 }}
              />
            </div>

            {/* Assign Driver */}
            <div className="field">
              <label htmlFor="driver-id">Assign Courier (Optional)</label>
              <select
                id="driver-id"
                value={driverId}
                onChange={e => setDriverId(e.target.value)}
              >
                <option value="">Unassigned (Dispatch Later)</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.phone ? `(${d.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Service Type Selector */}
          <div style={{ marginTop: 16 }}>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
              Service Type
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { id: 'delivery', label: 'Standard Delivery', sub: 'Standard outbound delivery to customer' },
                { id: 'replacement', label: 'Replacement (Swap)', sub: 'Collect exchange item from customer first' },
                { id: 'pickup', label: 'Return Pickup', sub: 'Reverse logistics / collect return parcel' },
              ].map(item => {
                const isActive = serviceType === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setServiceType(item.id as any)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: '1.5px solid',
                      borderColor: isActive ? 'var(--brand)' : 'var(--line)',
                      background: isActive ? 'var(--brand-light)' : 'var(--surface)',
                      color: isActive ? 'var(--brand)' : 'var(--text)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: isActive ? 700 : 600 }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {item.sub}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Physical Attributes: Weight, Fragile Flag, 3PL Tracking */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 16, alignItems: 'flex-start' }}>
            <div className="field">
              <label htmlFor="package-weight">Package Weight (KG)</label>
              <input
                id="package-weight"
                type="number"
                step="0.1"
                min="0.1"
                value={weightKg}
                onChange={e => setWeightKg(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="carrier-tracking">
                3PL Carrier Tracking <span style={{ color: 'var(--muted)', fontSize: 11 }}>(Optional)</span>
              </label>
              <input
                id="carrier-tracking"
                type="text"
                placeholder="e.g. ARAMEX-4421, DHL-019"
                value={carrierTrackingCode}
                onChange={e => setCarrierTrackingCode(e.target.value)}
              />
            </div>

            <div className="field">
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                Special Handling
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: '1.5px solid',
                  borderColor: isBreakable ? '#ef4444' : 'var(--line)',
                  background: isBreakable ? 'rgba(239, 68, 68, 0.06)' : 'var(--bg)',
                  cursor: 'pointer',
                  margin: 0,
                  height: 42,
                  boxSizing: 'border-box',
                }}
              >
                <input
                  type="checkbox"
                  checked={isBreakable}
                  onChange={e => setIsBreakable(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#dc2626' }}
                />
                <div style={{ lineHeight: 1.2 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: isBreakable ? '#dc2626' : 'var(--text)' }}>
                    Fragile / Breakable
                  </span>
                  <span style={{ display: 'block', fontSize: 10.5, color: 'var(--muted)' }}>
                    Prints prominent caution on AWB
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* ROW 3: Financials & Cash on Delivery (COD) Breakdown */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1.5px solid var(--line)',
            borderRadius: 16,
            padding: '24px 22px',
            boxShadow: 'var(--shadow)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, borderBottom: '1px solid var(--line)', paddingBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                3. Cash Collection & Financial Settlement
              </h3>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                Doorstep cash-on-delivery collection and merchant / courier financial ledger splits
              </span>
            </div>
            <div style={{ fontSize: 12, background: 'var(--bg)', border: '1px solid var(--line)', padding: '5px 12px', borderRadius: 8, fontWeight: 600, color: 'var(--muted)' }}>
              Rate: 1 USD = {rate.toLocaleString()} LBP
            </div>
          </div>

          {/* Pricing Mode Selector: Added on Customer vs Free Delivery */}
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              padding: '12px 16px',
              marginBottom: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', display: 'block' }}>
                Delivery Fee Settlement Mode
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                {pricingMode === 'added'
                  ? 'Delivery fee is added to customer doorstep COD. Merchant receives 100% of net item value.'
                  : 'Free Shipping Promo: Merchant absorbs shipping fee. Customer pays only net item value.'}
              </span>
            </div>

            <div style={{ display: 'inline-flex', background: 'var(--surface)', padding: 3, borderRadius: 8, border: '1.5px solid var(--line)', gap: 4 }}>
              <button
                type="button"
                onClick={() => setPricingMode('added')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: pricingMode === 'added' ? 'var(--brand)' : 'transparent',
                  color: pricingMode === 'added' ? '#ffffff' : 'var(--muted)',
                  transition: 'all 0.15s ease',
                }}
              >
                Fee Added to Customer (Standard)
              </button>
              <button
                type="button"
                onClick={() => setPricingMode('free_delivery')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: pricingMode === 'free_delivery' ? 'var(--brand)' : 'transparent',
                  color: pricingMode === 'free_delivery' ? '#ffffff' : 'var(--muted)',
                  transition: 'all 0.15s ease',
                }}
              >
                Free Delivery (Shop Pays)
              </button>
            </div>
          </div>

          {/* 4 Financial Accounting Inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {/* Box 1: Net Item Value */}
            <div
              className="field"
              style={{
                background: 'var(--surface)',
                border: '1.5px solid var(--line)',
                borderRadius: 12,
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <label htmlFor="net-item-usd" style={{ color: 'var(--text)', fontWeight: 700, fontSize: 12.5, marginBottom: 2 }}>
                  Net Goods Price ($) <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                  Merchandise value
                </div>
              </div>
              <input
                id="net-item-usd"
                type="number"
                step="0.5"
                min="0"
                value={netItemUsd}
                onChange={e => setNetItemUsd(e.target.value)}
                required
                style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}
              />
              <div style={{ fontSize: 11.5, color: '#047857', marginTop: 8, fontWeight: 600 }}>
                Shop Payout: {formatUSD(netItemNum)}
              </div>
            </div>

            {/* Box 2: Delivery Fee */}
            <div
              className="field"
              style={{
                background: 'var(--surface)',
                border: '1.5px solid var(--line)',
                borderRadius: 12,
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <label htmlFor="delivery-fee-usd" style={{ color: 'var(--text)', fontWeight: 700, fontSize: 12.5, marginBottom: 2 }}>
                  Delivery Fee ($) <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                  {currentArea?.name || 'Tariff zone'}
                </div>
              </div>
              <input
                id="delivery-fee-usd"
                type="number"
                step="0.5"
                min="0"
                value={deliveryFeeUsd}
                onChange={e => setDeliveryFeeUsd(e.target.value)}
                required
                style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}
              />
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>
                Tariff: ${currentArea?.fee_usd || 3} ({currentArea?.name || 'Zone'})
              </div>
            </div>

            {/* Box 3: Total Doorstep COD */}
            <div
              className="field"
              style={{
                background: 'rgba(4, 120, 87, 0.04)',
                border: '1.5px solid #059669',
                borderRadius: 12,
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <label style={{ color: '#047857', fontWeight: 800, fontSize: 12.5, marginBottom: 2 }}>
                  Total Doorstep COD ($) <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <div style={{ fontSize: 11, color: '#059669', marginBottom: 8 }}>
                  Cash collected at door
                </div>
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#047857', letterSpacing: '-0.5px' }}>
                {formatUSD(codUsdNum)}
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginTop: 8 }}>
                ≈ L.L. {codLbpApprox.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
            </div>

            {/* Box 4: Courier Pay */}
            <div
              className="field"
              style={{
                background: 'var(--surface)',
                border: '1.5px solid var(--line)',
                borderRadius: 12,
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <label htmlFor="driver-pay-usd" style={{ color: 'var(--text)', fontWeight: 700, fontSize: 12.5, marginBottom: 2 }}>
                  Courier Pay ($) <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                  Driver commission
                </div>
              </div>
              <input
                id="driver-pay-usd"
                type="number"
                step="0.5"
                min="0"
                value={driverPayUsd}
                onChange={e => setDriverPayUsd(e.target.value)}
                required
                style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}
              />
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>
                Run-sheet payout
              </div>
            </div>
          </div>

          {/* ─── LIVE FINANCIAL SETTLEMENT SUMMARY ─── */}
          <div
            style={{
              marginTop: 18,
              padding: '16px 20px',
              background: 'var(--bg)',
              borderRadius: 12,
              border: '1px solid var(--line)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--muted)', fontWeight: 800 }}>
                Financial Settlement Summary
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--brand)', fontWeight: 700 }}>
                {pricingMode === 'added' ? 'Delivery Fee Added to Doorstep COD' : 'Free Delivery (Deducted from Merchant Payout)'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14 }}>
              <div>
                <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>Net Goods Value</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{formatUSD(netItemNum)}</span>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>Delivery Fee</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: pricingMode === 'added' ? '#2563eb' : '#dc2626' }}>
                  {pricingMode === 'added' ? `+${formatUSD(feeUsdNum)}` : `-${formatUSD(feeUsdNum)}`}
                </span>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>Customer COD</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#047857' }}>{formatUSD(codUsdNum)}</span>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>Merchant Payout</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#047857' }}>{formatUSD(shopNetUsd)}</span>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>Courier Pay</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{formatUSD(driverPayNum)}</span>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>Company Margin</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: companyMarginUsd >= 0 ? 'var(--brand)' : '#dc2626' }}>
                  {formatUSD(companyMarginUsd)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Bottom Actions Bar ────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface)',
            border: '1.5px solid var(--line)',
            borderRadius: 14,
            padding: '16px 22px',
            boxShadow: 'var(--shadow)',
          }}
        >
          <Link href="/orders" className="btn btn-secondary">
            Cancel
          </Link>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={submitting}
              onClick={() => submitOrder(true)}
              style={{ fontWeight: 600 }}
            >
              {submitting ? 'Creating order…' : 'Create & Add Another'}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              style={{ fontWeight: 700 }}
            >
              {submitting ? 'Creating order…' : 'Create Order →'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
