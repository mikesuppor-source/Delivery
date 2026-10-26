'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LocationHelper } from '@/components/location-helper'
import { searchLebaneseTowns, type TownSearchResult } from '@/lib/lebanon-geo'
import { formatUSD, formatLBP } from '@/lib/utils'
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
  userRole,
  rate,
}: NewOrderClientProps) {
  const router = useRouter()

  // Form State
  const [shopId, setShopId] = useState(shops[0]?.id || '')
  const [driverId, setDriverId] = useState('')
  const [areaId, setAreaId] = useState(areas[0]?.id || '')
  const [collectionUsd, setCollectionUsd] = useState('25')
  const [deliveryFeeUsd, setDeliveryFeeUsd] = useState(String(areas[0]?.fee_usd || '3'))
  const [driverPayUsd, setDriverPayUsd] = useState(String(Math.max(1, (areas[0]?.fee_usd || 3) - 1)))
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
    setCollectionUsd('25')
    if (areas[0]) {
      setAreaId(areas[0].id)
      setDeliveryFeeUsd(String(areas[0].fee_usd))
      setDriverPayUsd(String(Math.max(1, areas[0].fee_usd - 1)))
    }
  }

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
          collectionUsd: Number(collectionUsd),
          deliveryFeeUsd: Number(deliveryFeeUsd),
          driverPayUsd: Number(driverPayUsd),
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

  const codUsdNum = Number(collectionUsd) || 0
  const feeUsdNum = Number(deliveryFeeUsd) || 0
  const driverPayNum = Number(driverPayUsd) || 0
  const codLbpApprox = codUsdNum * rate
  const shopNetUsd = codUsdNum - feeUsdNum
  const companyMarginUsd = feeUsdNum - driverPayNum

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
              Enter parcel information, customer CRM details, and courier assignment to generate a waybill.
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
        
        {/* ROW 1: Customer & Package Logistics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: 24 }}>
          
          {/* CARD 1: Customer CRM & Destination */}
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
              <span style={{ fontSize: 18 }}>👤</span>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                  Customer CRM & Destination
                </h3>
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Recipient contact and Lebanese geo-location</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Recipient Name */}
              <div className="field">
                <label htmlFor="recipient-name">
                  Customer / Recipient Full Name <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  id="recipient-name"
                  type="text"
                  placeholder="e.g. Karim Haddad"
                  value={recipientName}
                  onChange={e => setRecipientName(e.target.value)}
                  required
                />
              </div>

              {/* Phone & Live CRM */}
              <div className="field">
                <label htmlFor="recipient-phone">
                  Phone Number <span style={{ color: 'var(--muted)', fontSize: 11 }}>(Lebanese mobile format)</span>
                </label>
                <input
                  id="recipient-phone"
                  type="tel"
                  placeholder="e.g. +961 70 123456"
                  value={recipientPhone}
                  onChange={e => setRecipientPhone(e.target.value)}
                />
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
                    ⚡ Auto-Fill
                  </button>
                </div>
              )}

              {/* Lebanese Administrative Town Hierarchy Search */}
              <div className="field" style={{ position: 'relative' }}>
                <label htmlFor="town-search">
                  Lebanese Town & Region / البلدة والمنطقة <span style={{ color: 'var(--muted)', fontSize: 11 }}>(Arabic or English)</span>
                </label>
                <input
                  id="town-search"
                  type="text"
                  placeholder="Search town (e.g. زحلة, Achrafieh, جرجوع, Batroun)..."
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
                  placeholder="e.g. Sassine Square, Bldg 14, 2nd Floor or paste Google Maps pin link"
                  required
                />
              </div>

              {/* Order Notes */}
              <div className="field">
                <label htmlFor="order-notes">Order Notes / Courier Handling Instructions</label>
                <input
                  id="order-notes"
                  type="text"
                  placeholder="e.g. Call 10 mins before arrival, fragile glass, leave with concierge"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* CARD 2: Package Specifications & Logistics */}
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
                  Package Specs & Service Type
                </h3>
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Logistics parameters, service options, and handling</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              
              {/* Quick Preset for Retail Return / Refund */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'var(--bg)',
                  borderRadius: 10,
                  border: '1px solid var(--line)',
                }}
              >
                <div>
                  <strong style={{ fontSize: 12.5, display: 'block', color: 'var(--text)' }}>
                    Retail Return / Refund Pickup?
                  </strong>
                  <small style={{ color: 'var(--muted)', fontSize: 11 }}>
                    Automatically set fee to $2.00, customer COD to $0.00, and courier pay to $1.00
                  </small>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setCollectionUsd('0')
                    setDeliveryFeeUsd('2')
                    setDriverPayUsd('1')
                    setNotes('Retail return pickup ($2 fee)')
                    setServiceType('pickup')
                  }}
                  style={{ fontSize: 11, padding: '4px 10px', borderColor: 'var(--brand)', color: 'var(--brand)', fontWeight: 600 }}
                >
                  Apply $2 Preset
                </button>
              </div>

              {/* Service Type Buttons */}
              <div className="field">
                <label style={{ fontWeight: 700, color: 'var(--brand)', marginBottom: 8, display: 'block' }}>
                  Service Type / نوع الطلب
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setServiceType('delivery')}
                    style={{
                      padding: '10px 8px',
                      borderRadius: 8,
                      border: '1.5px solid',
                      borderColor: serviceType === 'delivery' ? 'var(--brand)' : 'var(--line)',
                      background: serviceType === 'delivery' ? 'var(--brand-light)' : 'var(--surface)',
                      color: serviceType === 'delivery' ? 'var(--brand)' : 'var(--text)',
                      fontWeight: serviceType === 'delivery' ? 700 : 500,
                      fontSize: 12.5,
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    🚚 Delivery
                    <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>توصيل قياسي</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setServiceType('replacement')}
                    style={{
                      padding: '10px 8px',
                      borderRadius: 8,
                      border: '1.5px solid',
                      borderColor: serviceType === 'replacement' ? '#d97706' : 'var(--line)',
                      background: serviceType === 'replacement' ? 'rgba(217, 119, 6, 0.12)' : 'var(--surface)',
                      color: serviceType === 'replacement' ? '#b45309' : 'var(--text)',
                      fontWeight: serviceType === 'replacement' ? 700 : 500,
                      fontSize: 12.5,
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    🔄 Replacement
                    <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>تبديل بضاعة</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setServiceType('pickup')}
                    style={{
                      padding: '10px 8px',
                      borderRadius: 8,
                      border: '1.5px solid',
                      borderColor: serviceType === 'pickup' ? '#7c3aed' : 'var(--line)',
                      background: serviceType === 'pickup' ? 'rgba(124, 58, 237, 0.12)' : 'var(--surface)',
                      color: serviceType === 'pickup' ? '#7c3aed' : 'var(--text)',
                      fontWeight: serviceType === 'pickup' ? 700 : 500,
                      fontSize: 12.5,
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    📦 Return Pickup
                    <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>استرجاع مرتجع</div>
                  </button>
                </div>
              </div>

              {/* Weight & Fragile Checkbox */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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
                  <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, margin: 0, height: '100%' }}>
                    <input
                      type="checkbox"
                      checked={isBreakable}
                      onChange={e => setIsBreakable(e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: '#ea580c' }}
                    />
                    <div>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: isBreakable ? '#ea580c' : 'var(--text)' }}>
                        ⚠️ Fragile / Breakable (قابل للكسر)
                      </span>
                      <small style={{ color: 'var(--muted)', display: 'block', fontSize: 10.5 }}>
                        Prints prominent warning banner on thermal AWB label
                      </small>
                    </div>
                  </label>
                </div>
              </div>

              {/* Carrier Tracking Code (Outsourcing) */}
              <div className="field">
                <label htmlFor="carrier-tracking">
                  Carrier Tracking Code / 3PL Code <span style={{ color: 'var(--muted)', fontSize: 11 }}>(Optional outsourced logistics tracking)</span>
                </label>
                <input
                  id="carrier-tracking"
                  type="text"
                  placeholder="e.g. OCT-98421, ARAMEX-4421, DHL-019"
                  value={carrierTrackingCode}
                  onChange={e => setCarrierTrackingCode(e.target.value)}
                />
              </div>

              {/* Custom Waybill Code Generator */}
              <div
                style={{
                  background: 'var(--bg)',
                  padding: 14,
                  borderRadius: 10,
                  border: '1.5px solid var(--line)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ margin: 0, fontWeight: 700, fontSize: 12.5, color: 'var(--text)' }}>
                    Custom Tracking Code / Waybill # <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 11 }}>(Optional)</span>
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        const selectedShop = shops.find(s => s.id === shopId)
                        const prefix = selectedShop ? selectedShop.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() : 'ORD'
                        const randomNum = Math.floor(100 + Math.random() * 900)
                        setCustomCode(`${prefix}-${randomNum}`)
                      }}
                      style={{ fontSize: 10.5, padding: '2px 8px' }}
                      title="Generate code with shop prefix (e.g. ZARA-101)"
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
                      title="Generate standard Cedar CD-XXXX code"
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
                        ✕ Clear
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Leave empty for auto-generated tracking token, or type custom code"
                  value={customCode}
                  onChange={e => setCustomCode(e.target.value)}
                  style={{ fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.5px' }}
                />
              </div>

            </div>
          </div>
        </div>

        {/* ROW 2: Financials, Pricing & Assignment */}
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
            <span style={{ fontSize: 18 }}>💰</span>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                Merchant, Courier Assignment & Financials
              </h3>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Shop source, courier pay, and COD collection amounts</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {/* Select Shop */}
            <div className="field">
              <label htmlFor="shop-id">Select Shop / Client <span style={{ color: 'var(--danger)' }}>*</span></label>
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

            {/* Assign Driver */}
            <div className="field">
              <label htmlFor="driver-id">Assign Courier (Optional)</label>
              <select
                id="driver-id"
                value={driverId}
                onChange={e => setDriverId(e.target.value)}
              >
                <option value="">Unassigned (Dispatch later)</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.phone ? `(${d.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Delivery Area */}
            <div className="field">
              <label htmlFor="area-id">Delivery Area / Tariff zone</label>
              <select
                id="area-id"
                value={areaId}
                onChange={e => handleAreaChange(e.target.value)}
              >
                {areas.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} (${Number(a.fee_usd).toFixed(2)})
                  </option>
                ))}
              </select>
            </div>

            {/* Cash Collection (USD) */}
            <div className="field">
              <label htmlFor="collection-usd">
                COD Collection (USD) <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                id="collection-usd"
                type="number"
                step="0.5"
                min="0"
                value={collectionUsd}
                onChange={e => setCollectionUsd(e.target.value)}
                required
              />
              <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                ≈ L.L. {codLbpApprox.toLocaleString('en-US', { maximumFractionDigits: 0 })} (@{rate.toLocaleString()})
              </span>
            </div>

            {/* Delivery Fee (USD) */}
            <div className="field">
              <label htmlFor="delivery-fee-usd">Delivery Fee (USD) <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                id="delivery-fee-usd"
                type="number"
                step="0.5"
                min="0"
                value={deliveryFeeUsd}
                onChange={e => setDeliveryFeeUsd(e.target.value)}
                required
              />
            </div>

            {/* Driver Pay (USD) */}
            <div className="field">
              <label htmlFor="driver-pay-usd">Courier Pay (USD) <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                id="driver-pay-usd"
                type="number"
                step="0.5"
                min="0"
                value={driverPayUsd}
                onChange={e => setDriverPayUsd(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Real-Time Financial Settlement Preview */}
          <div
            style={{
              marginTop: 18,
              padding: '12px 18px',
              background: 'var(--bg)',
              borderRadius: 12,
              border: '1px solid var(--line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Customer Pays (COD)
                </span>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>
                  {formatUSD(codUsdNum)}
                </div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Shop Net Settlement
                </span>
                <div style={{ fontSize: 15, fontWeight: 800, color: shopNetUsd >= 0 ? 'var(--brand)' : 'var(--danger)' }}>
                  {formatUSD(shopNetUsd)}
                </div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Company Margin
                </span>
                <div style={{ fontSize: 15, fontWeight: 800, color: companyMarginUsd >= 0 ? '#15803d' : 'var(--danger)' }}>
                  {formatUSD(companyMarginUsd)}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Rates dynamically bound to workspace <strong>{workspaceName}</strong>
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
