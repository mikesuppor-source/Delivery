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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>✅</span>
            <div>
              <strong style={{ color: 'var(--brand)', fontSize: 14 }}>
                Order #{createdOrderCode} created successfully!
              </strong>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                Waybill barcode and tracking link are active. Form is cleared and ready for the next parcel.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link
              href={`/print/order/${createdOrderCode}`}
              target="_blank"
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 12, borderColor: 'var(--brand)', color: 'var(--brand)' }}
            >
              🖨️ Print Waybill Slip
            </Link>
            <Link
              href={`/track/${createdOrderCode}`}
              target="_blank"
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 12 }}
            >
              🔍 Public Tracking View
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
            <span style={{ fontSize: 18 }}>📍</span>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                1. Customer & Delivery Destination
              </h3>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Who is receiving the parcel and where should the courier deliver it?</span>
            </div>
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
                  👥 Repeat Customer Detected: {phoneMatchedCustomer.name}
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
                ⚡ Auto-Fill Details
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
            <span style={{ fontSize: 18 }}>📦</span>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                2. Merchant & Package Specifications
              </h3>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Sender store, waybill tracking code, service type, and courier handling</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {/* Select Shop */}
            <div className="field">
              <label htmlFor="shop-id">
                Select Shop / Merchant <span style={{ color: 'var(--danger)' }}>*</span>
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
                      const randomHex = Math.random().toString(16).substring(2, 10).toUpperCase()
                      setCustomCode(`CD-${randomHex}`)
                    }}
                    style={{ fontSize: 10.5, padding: '2px 8px' }}
                  >
                    Auto CD-XXXX
                  </button>
                  {customCode && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setCustomCode('')}
                      style={{ fontSize: 10.5, padding: '2px 8px', color: '#dc2626' }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              <input
                id="custom-code"
                type="text"
                placeholder="Leave blank for auto-generated tracking token"
                value={customCode}
                onChange={e => setCustomCode(e.target.value)}
                style={{ fontFamily: 'monospace', fontWeight: 600 }}
              />
            </div>

            {/* Assign Driver */}
            <div className="field">
              <label htmlFor="driver-id">Assign Courier / Driver (Optional)</label>
              <select
                id="driver-id"
                value={driverId}
                onChange={e => setDriverId(e.target.value)}
              >
                <option value="">Unassigned (Dispatch Later / Auto-Route)</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.phone ? `(${d.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Service Type Selector */}
          <div style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontWeight: 700, color: 'var(--brand)', margin: 0 }}>
                Service Type / نوع الطلب
              </label>
              {/* Quick Preset for Retail Return / Refund */}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setNetItemUsd('0')
                  setDeliveryFeeUsd('2')
                  setDriverPayUsd('1')
                  setPricingMode('added')
                  setNotes('Retail return pickup ($2 fee)')
                  setServiceType('pickup')
                }}
                style={{ fontSize: 11, padding: '3px 10px', borderColor: 'var(--brand)', color: 'var(--brand)', fontWeight: 600 }}
              >
                ⚡ Apply $2 Return Pickup Preset
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <button
                type="button"
                onClick={() => setServiceType('delivery')}
                style={{
                  padding: '12px 10px',
                  borderRadius: 10,
                  border: '1.5px solid',
                  borderColor: serviceType === 'delivery' ? 'var(--brand)' : 'var(--line)',
                  background: serviceType === 'delivery' ? 'var(--brand-light)' : 'var(--surface)',
                  color: serviceType === 'delivery' ? 'var(--brand)' : 'var(--text)',
                  fontWeight: serviceType === 'delivery' ? 700 : 500,
                  fontSize: 13,
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                🚚 Standard Delivery
                <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>توصيل طلب عادي</div>
              </button>

              <button
                type="button"
                onClick={() => setServiceType('replacement')}
                style={{
                  padding: '12px 10px',
                  borderRadius: 10,
                  border: '1.5px solid',
                  borderColor: serviceType === 'replacement' ? '#d97706' : 'var(--line)',
                  background: serviceType === 'replacement' ? 'rgba(217, 119, 6, 0.12)' : 'var(--surface)',
                  color: serviceType === 'replacement' ? '#b45309' : 'var(--text)',
                  fontWeight: serviceType === 'replacement' ? 700 : 500,
                  fontSize: 13,
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                🔄 Replacement
                <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>تبديل بضاعة</div>
              </button>

              <button
                type="button"
                onClick={() => setServiceType('pickup')}
                style={{
                  padding: '12px 10px',
                  borderRadius: 10,
                  border: '1.5px solid',
                  borderColor: serviceType === 'pickup' ? '#7c3aed' : 'var(--line)',
                  background: serviceType === 'pickup' ? 'rgba(124, 58, 237, 0.12)' : 'var(--surface)',
                  color: serviceType === 'pickup' ? '#7c3aed' : 'var(--text)',
                  fontWeight: serviceType === 'pickup' ? 700 : 500,
                  fontSize: 13,
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                📦 Return Pickup
                <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>استرجاع مرتجع</div>
              </button>
            </div>
          </div>

          {/* Physical Attributes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginTop: 18 }}>
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

            <div className="field" style={{ justifyContent: 'center' }}>
              <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, margin: 0, height: '100%', padding: '8px 12px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--line)' }}>
                <input
                  type="checkbox"
                  checked={isBreakable}
                  onChange={e => setIsBreakable(e.target.checked)}
                  style={{ width: 20, height: 20, accentColor: '#ea580c' }}
                />
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: isBreakable ? '#ea580c' : 'var(--text)' }}>
                    ⚠️ Fragile / Breakable (قابل للكسر)
                  </span>
                  <small style={{ color: 'var(--muted)', display: 'block', fontSize: 11 }}>
                    Prints prominent fragile warning on thermal AWB label
                  </small>
                </div>
              </label>
            </div>

            <div className="field">
              <label htmlFor="carrier-tracking">
                3PL Carrier Tracking Code <span style={{ color: 'var(--muted)', fontSize: 11 }}>(Optional)</span>
              </label>
              <input
                id="carrier-tracking"
                type="text"
                placeholder="e.g. OCT-8942, ARAMEX-4421, DHL-019"
                value={carrierTrackingCode}
                onChange={e => setCarrierTrackingCode(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* ROW 3: Financials & Cash on Delivery (COD) Breakdown */}
        <div
          style={{
            background: 'var(--surface)',
            border: '2px solid #3b82f6',
            borderRadius: 16,
            padding: '24px 22px',
            boxShadow: '0 8px 30px rgba(59, 130, 246, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, borderBottom: '1px solid var(--line)', paddingBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>💵</span>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--text)' }}>
                  3. Cash Collection & Financial Settlement
                </h3>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  COD cash collection at doorstep and automatic merchant/courier splits
                </span>
              </div>
            </div>
            <div style={{ fontSize: 12, background: 'var(--bg)', padding: '4px 10px', borderRadius: 6, fontWeight: 600, color: 'var(--brand)' }}>
              💱 1 USD = {rate.toLocaleString()} LBP
            </div>
          </div>

          {/* Pricing Mode Selector: Added on Customer vs Free Delivery */}
          <div
            style={{
              background: 'var(--bg)',
              border: '1.5px solid var(--line)',
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 20,
            }}
          >
            <label style={{ display: 'block', fontSize: 13, fontWeight: 800, color: 'var(--brand)', marginBottom: 8 }}>
              Pricing & Delivery Fee Allocation / طريقة احتساب كلفة التوصيل
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              <button
                type="button"
                onClick={() => setPricingMode('added')}
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '2px solid',
                  borderColor: pricingMode === 'added' ? '#2563eb' : 'var(--line)',
                  background: pricingMode === 'added' ? 'rgba(37, 99, 235, 0.08)' : 'var(--surface)',
                  color: pricingMode === 'added' ? '#1d4ed8' : 'var(--text)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 13.5 }}>
                  <span>🚚</span>
                  <span>Delivery Fee Added to Customer (كلفة التوصيل على الزبون)</span>
                  {pricingMode === 'added' && <span style={{ marginLeft: 'auto', color: '#2563eb' }}>✓ Active</span>}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4, lineHeight: 1.4 }}>
                  <strong>Standard E-commerce:</strong> Delivery fee is added on top of the goods. Customer pays Total COD at door ($25 Net + $3 Fee = <strong>$28.00</strong>). Shop receives full <strong>$25.00</strong>.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPricingMode('free_delivery')}
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '2px solid',
                  borderColor: pricingMode === 'free_delivery' ? '#059669' : 'var(--line)',
                  background: pricingMode === 'free_delivery' ? 'rgba(5, 150, 105, 0.08)' : 'var(--surface)',
                  color: pricingMode === 'free_delivery' ? '#047857' : 'var(--text)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 13.5 }}>
                  <span>🎁</span>
                  <span>Free Delivery / Shop Pays (توصيل مجاني - كلفة التوصيل على المتجر)</span>
                  {pricingMode === 'free_delivery' && <span style={{ marginLeft: 'auto', color: '#059669' }}>✓ Active</span>}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4, lineHeight: 1.4 }}>
                  <strong>Free Shipping Promo:</strong> Customer only pays the goods price ($25.00). Delivery fee is deducted from shop payout (Shop receives <strong>$22.00</strong>).
                </div>
              </button>
            </div>
          </div>

          {/* 4 Financial Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {/* Input 1: Net Item Value / Goods Price */}
            <div
              className="field"
              style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: 12,
                padding: '14px',
              }}
            >
              <label htmlFor="net-item-usd" style={{ color: '#0f172a', fontWeight: 800, fontSize: 13, marginBottom: 4 }}>
                📦 Net Item Price / سعر البضاعة (USD) <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                صافي قيمة البضاعة المستحقة للمتجر
              </div>
              <input
                id="net-item-usd"
                type="number"
                step="0.5"
                min="0"
                value={netItemUsd}
                onChange={e => setNetItemUsd(e.target.value)}
                required
                style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}
              />
              <div style={{ fontSize: 11.5, color: '#0284c7', marginTop: 6, fontWeight: 600 }}>
                Shop payout: {formatUSD(netItemNum)}
              </div>
            </div>

            {/* Input 2: Delivery Fee Charged to Area */}
            <div
              className="field"
              style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: 12,
                padding: '14px',
              }}
            >
              <label htmlFor="delivery-fee-usd" style={{ color: '#0f172a', fontWeight: 800, fontSize: 13, marginBottom: 4 }}>
                🚚 Delivery Fee / كلفة التوصيل (USD) <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                كلفة التوصيل للمنطقة ({currentArea?.name || 'Area Tariff'})
              </div>
              <input
                id="delivery-fee-usd"
                type="number"
                step="0.5"
                min="0"
                value={deliveryFeeUsd}
                onChange={e => setDeliveryFeeUsd(e.target.value)}
                required
                style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}
              />
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>
                Standard: ${currentArea?.fee_usd || 3} ({currentArea?.name || 'Zone'})
              </div>
            </div>

            {/* Input 3: Total COD to Collect at Doorstep (Prominently Highlighted!) */}
            <div
              className="field"
              style={{
                background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
                border: '2px solid #22c55e',
                borderRadius: 12,
                padding: '14px',
                boxShadow: '0 4px 12px rgba(34, 197, 94, 0.12)',
              }}
            >
              <label htmlFor="total-cod-display" style={{ color: '#166534', fontWeight: 800, fontSize: 13, marginBottom: 4 }}>
                💵 Total COD to Collect at Doorstep <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <div style={{ fontSize: 11, color: '#15803d', fontWeight: 600, marginBottom: 6 }}>
                المبلغ المطلوب تحصيله من الزبون عند الاستلام
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#166534', letterSpacing: '-0.5px' }}>
                {formatUSD(codUsdNum)}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0284c7', marginTop: 4 }}>
                ≈ L.L. {codLbpApprox.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#15803d', marginTop: 4, background: 'rgba(34, 197, 94, 0.15)', padding: '2px 6px', borderRadius: 4, display: 'inline-block' }}>
                {pricingMode === 'added' ? `Formula: $${netItemNum} Net + $${feeUsdNum} Fee = $${codUsdNum}` : `Formula: Free Delivery ($${netItemNum} Goods only)`}
              </div>
            </div>

            {/* Input 4: Courier Pay / Driver Commission */}
            <div
              className="field"
              style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: 12,
                padding: '14px',
              }}
            >
              <label htmlFor="driver-pay-usd" style={{ color: '#0f172a', fontWeight: 800, fontSize: 13, marginBottom: 4 }}>
                🚴 Courier Pay / أجرة السائق (USD) <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                أجرة الدليفري ({currentDriver?.name || 'Assigned Courier'})
              </div>
              <input
                id="driver-pay-usd"
                type="number"
                step="0.5"
                min="0"
                value={driverPayUsd}
                onChange={e => setDriverPayUsd(e.target.value)}
                required
                style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}
              />
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>
                Courier run-sheet earning
              </div>
            </div>
          </div>

          {/* ─── LIVE FINANCIAL SETTLEMENT BREAKDOWN RECEIPT ─── */}
          <div
            style={{
              marginTop: 20,
              padding: '18px 22px',
              background: '#090d16',
              color: '#ffffff',
              borderRadius: 14,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, borderBottom: '1px solid #1e293b', paddingBottom: 8 }}>
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: '#94a3b8', fontWeight: 800 }}>
                Live Accounting & Settlement Breakdown / كشف الحساب الفوري
              </span>
              <span style={{ fontSize: 12, color: '#38bdf8', fontWeight: 600 }}>
                {pricingMode === 'added' ? '🚚 Delivery Added to Customer' : '🎁 Free Delivery (Shop Pays)'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 18 }}>
              {/* Box A: Net Item Price */}
              <div>
                <span style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>
                  📦 Net Goods Price (سعر البضاعة):
                </span>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#ffffff' }}>
                  {formatUSD(netItemNum)}
                </span>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  Base merchandise value
                </div>
              </div>

              {/* Box B: Delivery Fee */}
              <div>
                <span style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>
                  {pricingMode === 'added' ? '➕ Delivery Fee (Paid by Customer):' : '➖ Delivery Fee (Absorbed by Shop):'}
                </span>
                <span style={{ fontSize: 20, fontWeight: 800, color: pricingMode === 'added' ? '#38bdf8' : '#f87171' }}>
                  {pricingMode === 'added' ? `+ ${formatUSD(feeUsdNum)}` : `- ${formatUSD(feeUsdNum)}`}
                </span>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  {pricingMode === 'added' ? 'Added on top of COD' : 'Deducted from merchant payout'}
                </div>
              </div>

              {/* Box C: Total Collected at Doorstep */}
              <div style={{ borderLeft: '1px solid #334155', paddingLeft: 16 }}>
                <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 700, display: 'block' }}>
                  💵 Collected at Doorstep (COD):
                </span>
                <span style={{ fontSize: 22, fontWeight: 900, color: '#4ade80' }}>
                  {formatUSD(codUsdNum)}
                </span>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  ≈ L.L. {codLbpApprox.toLocaleString()}
                </div>
              </div>

              {/* Box D: Shop Net Payout */}
              <div style={{ borderLeft: '1px solid #334155', paddingLeft: 16 }}>
                <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700, display: 'block' }}>
                  🏪 Net Payout to {currentShop?.name || 'Shop'}:
                </span>
                <span style={{ fontSize: 22, fontWeight: 900, color: shopNetUsd >= 0 ? '#4ade80' : '#f87171' }}>
                  {formatUSD(shopNetUsd)}
                </span>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {pricingMode === 'added' ? '100% full net payout' : 'Net minus delivery fee'}
                </div>
              </div>

              {/* Box E: Courier Pay */}
              <div>
                <span style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>
                  🚴 Courier Pay to {currentDriver?.name || 'Driver'}:
                </span>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#facc15' }}>
                  {formatUSD(driverPayNum)}
                </span>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  (Driver Run Sheet Pay)
                </div>
              </div>

              {/* Box F: Company Margin */}
              <div>
                <span style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>
                  📈 Company Margin:
                </span>
                <span style={{ fontSize: 20, fontWeight: 800, color: companyMarginUsd >= 0 ? '#60a5fa' : '#f87171' }}>
                  {formatUSD(companyMarginUsd)}
                </span>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  (Fee ${feeUsdNum} - Pay ${driverPayNum})
                </div>
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
