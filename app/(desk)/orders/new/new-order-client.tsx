'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LocationHelper } from '@/components/location-helper'
import { searchLebaneseTowns, type TownSearchResult } from '@/lib/lebanon-geo'
import { formatUSD } from '@/lib/utils'
import { breakdown, priceOrder } from '@/lib/pricing'
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
  driver_pay_usd?: number | null
  return_fee_usd?: number | null
  return_driver_pay_usd?: number | null
}

interface ShopAreaPrice {
  shop_id: string
  area_id: string
  fee_usd: number
}

interface NewOrderClientProps {
  workspaceId: string
  workspaceName: string
  shops: Shop[]
  drivers: Driver[]
  areas: DeliveryArea[]
  shopAreaPrices?: ShopAreaPrice[]
  userRole: UserRole
  rate: number
  defaultDriverPayUsd?: number | null
  defaultDeliveryFeeUsd?: number | null
}

export function NewOrderClient({
  workspaceId,
  workspaceName: _workspaceName,
  shops,
  drivers,
  areas,
  shopAreaPrices = [],
  userRole,
  rate,
  defaultDriverPayUsd,
  defaultDeliveryFeeUsd,
}: NewOrderClientProps) {
  const router = useRouter()

  const initialDriverPay = defaultDriverPayUsd != null ? String(defaultDriverPayUsd) : '2.00'
  const initialDeliveryFee = areas[0]?.fee_usd != null 
    ? String(areas[0].fee_usd) 
    : (defaultDeliveryFeeUsd != null ? String(defaultDeliveryFeeUsd) : '3.50')

  // Form State
  const [shopId, setShopId] = useState(shops[0]?.id || '')
  const [driverId, setDriverId] = useState('')
  const [areaId, setAreaId] = useState(areas[0]?.id || '')
  const [netItemUsd, setNetItemUsd] = useState('25')
  const [deliveryFeeUsd, setDeliveryFeeUsd] = useState(initialDeliveryFee)
  const [driverPayUsd, setDriverPayUsd] = useState(initialDriverPay)
  // Pricing Mode: 'added' (Fee added on top of net order for customer) vs 'free_delivery' (shop absorbs fee)
  const [pricingMode, setPricingMode] = useState<'added' | 'free_delivery'>('added')
  const [customCode, setCustomCode] = useState('')
  const [isPriceOverridden, setIsPriceOverridden] = useState(false)
  const [showPriceEditor, setShowPriceEditor] = useState(false)

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
  const [weightKg, setWeightKg] = useState('')
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

  // Check if current shop has a special price for the selected zone
  const specialMatch = shopAreaPrices.find(p => p.shop_id === shopId && p.area_id === areaId)
  const specialFee = specialMatch ? Number(specialMatch.fee_usd) : null

  function updatePricingFor(sId: string, aId: string) {
    if (isPriceOverridden) return
    const selArea = areas.find(a => a.id === aId) || null
    const sp = shopAreaPrices.find(p => p.shop_id === sId && p.area_id === aId)
    const spFee = sp ? Number(sp.fee_usd) : null
    const computed = priceOrder(
      selArea ? {
        fee_usd: Number(selArea.fee_usd),
        driver_pay_usd: selArea.driver_pay_usd !== null && selArea.driver_pay_usd !== undefined ? Number(selArea.driver_pay_usd) : null,
        return_fee_usd: Number(selArea.return_fee_usd ?? 2),
        return_driver_pay_usd: Number(selArea.return_driver_pay_usd ?? 1),
      } : null,
      spFee,
      {
        default_delivery_fee_usd: defaultDeliveryFeeUsd ?? null,
        default_driver_pay_usd: defaultDriverPayUsd ?? null,
      }
    )
    setDeliveryFeeUsd(String(computed.feeUsd))
    setDriverPayUsd(String(computed.driverPayUsd))
  }

  function handleAreaChange(newAreaId: string) {
    setAreaId(newAreaId)
    updatePricingFor(shopId, newAreaId)
  }

  function handleShopChange(newShopId: string) {
    setShopId(newShopId)
    updatePricingFor(newShopId, areaId)
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
    setWeightKg('')
    setIsBreakable(false)
    setCarrierTrackingCode('')
    setPhoneMatchedCustomer(null)
    setNetItemUsd('25')
    setPricingMode('added')
    setDriverPayUsd(initialDriverPay)
    if (areas[0]) {
      setAreaId(areas[0].id)
      setDeliveryFeeUsd(String(areas[0].fee_usd))
    } else {
      setDeliveryFeeUsd(initialDeliveryFee)
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

  const { customerPays, shopReceives, courierEarns, companyKeeps } = breakdown(codUsdNum, feeUsdNum, driverPayNum)
  const shopNetUsd = shopReceives

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
          weightKg: weightKg.trim() ? Number(weightKg) : null,
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

  const selectedShop = shops.find(s => s.id === shopId)

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', paddingBottom: 60 }}>
      {/* ─── Page Heading ────────────────────────────────────────── */}
      <div className="page-heading">
        <div>
          <div className="date-badge">Orders / New</div>
          <h1>Create New Order</h1>
          <p>Register delivery parcel, assign courier, and configure COD settlement</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/orders" className="btn btn-secondary">
            Cancel
          </Link>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={submitting}
            onClick={() => submitOrder(true)}
          >
            {submitting ? 'Creating…' : 'Create & Add Another'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitting}
            onClick={() => submitOrder(false)}
          >
            {submitting ? 'Creating…' : 'Create Order'}
          </button>
        </div>
      </div>

      {/* ─── Success Notification ─────────────────────────────────── */}
      {createdOrderCode && (
        <div
          style={{
            background: 'var(--brand-light)',
            border: '1.5px solid var(--brand)',
            borderRadius: 'var(--radius-sm)',
            padding: '14px 18px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <strong style={{ color: 'var(--brand)', fontSize: 13.5 }}>
              Order #{createdOrderCode} created successfully
            </strong>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
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

      {/* ─── Error Notification ──────────────────────────────────── */}
      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1.5px solid #fecaca',
            color: '#991b1b',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 16px',
            marginBottom: 20,
            fontSize: 13,
          }}
        >
          <strong>Error creating order:</strong> {error}
        </div>
      )}

      {/* ─── Main Cedar Panel Form ────────────────────────────────── */}
      <div className="panel">
        <div className="panel-title">
          <h2>Order Information & Waybill Details</h2>
          <small>Rate: 1 USD = {rate.toLocaleString()} LBP</small>
        </div>

        <div style={{ padding: '24px' }}>
          <form onSubmit={e => { e.preventDefault(); submitOrder(false) }}>
            <div className="form-grid">
              
              {/* Quick Preset for Retail Return / Refund */}
              <div
                style={{
                  gridColumn: '1 / -1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: 'var(--bg)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--line)',
                }}
              >
                <div>
                  <strong style={{ fontSize: 12, display: 'block' }}>Retail Return / Refund Pickup?</strong>
                  <small style={{ color: 'var(--muted)', fontSize: 11 }}>
                    Automatically set fee to $2.00, customer COD to $0.00, and courier pay to $1.00
                  </small>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setNetItemUsd('0')
                    setDeliveryFeeUsd('2')
                    setDriverPayUsd('1')
                    setPricingMode('added')
                    setNotes('Retail return pickup ($2 fee)')
                  }}
                  style={{
                    fontSize: 11,
                    padding: '4px 10px',
                    borderColor: 'var(--brand)',
                    color: 'var(--brand)',
                    fontWeight: 600,
                  }}
                >
                  Apply $2 Refund Preset
                </button>
              </div>

              {/* Custom Tracking Code / Waybill # */}
              <div
                className="field full"
                style={{
                  background: 'var(--bg)',
                  padding: 12,
                  borderRadius: 'var(--radius-sm)',
                  border: '1.5px solid var(--line)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label htmlFor="custom-code" style={{ margin: 0, fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                    Custom Tracking Code / Waybill # <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 11 }}>(Optional)</span>
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        const prefix = selectedShop ? selectedShop.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() : 'ORD'
                        const randomNum = Math.floor(100 + Math.random() * 900)
                        setCustomCode(`${prefix}-${randomNum}`)
                      }}
                      style={{ fontSize: 11, padding: '2px 8px' }}
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
                      style={{ fontSize: 11, padding: '2px 8px' }}
                      title="Generate standard Cedar CD-XXXX code"
                    >
                      Auto CD-XXXX
                    </button>
                    {customCode && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setCustomCode('')}
                        style={{ fontSize: 11, padding: '2px 8px', color: '#dc2626' }}
                        title="Clear custom code (auto-generate upon creation)"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                <input
                  id="custom-code"
                  type="text"
                  placeholder="Leave empty for auto CD-XXXX, or enter custom code (e.g. ZARA-101, INV-4022)"
                  value={customCode}
                  onChange={e => setCustomCode(e.target.value.toUpperCase())}
                  style={{ fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.5px' }}
                />
                <small style={{ color: 'var(--muted)', fontSize: 11, display: 'block', marginTop: 4 }}>
                  A private customer tracking link will be generated after creation.
                </small>
              </div>

              {/* Shop Selection */}
              <div className="field">
                <label htmlFor="shop-id">
                  Select Shop <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <select id="shop-id" value={shopId} onChange={e => handleShopChange(e.target.value)} required>
                  <option value="">-- Choose shop --</option>
                  {shops.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.phone ? `(${s.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Assign Driver */}
              <div className="field">
                <label htmlFor="driver-id">
                  Assign Driver <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 11 }}>(Optional)</span>
                </label>
                <select id="driver-id" value={driverId} onChange={e => setDriverId(e.target.value)}>
                  <option value="auto">Auto-Assign from Area Pool (Least Busy)</option>
                  <option value="">Unassigned (Dispatch later)</option>
                  <optgroup label="Direct Courier Selection">
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} {d.phone ? `(${d.phone})` : ''}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Delivery Area */}
              <div className="field">
                <label htmlFor="area-id">
                  Delivery Area <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <select id="area-id" value={areaId} onChange={e => handleAreaChange(e.target.value)} required>
                  <option value="">-- Choose area --</option>
                  {areas.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} (${Number(a.fee_usd).toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Pricing Mode Selector */}
              <div
                style={{
                  gridColumn: '1 / -1',
                  background: 'var(--bg)',
                  padding: 10,
                  borderRadius: 8,
                  border: '1px solid var(--line)',
                }}
              >
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--brand)', marginBottom: 6 }}>
                  Delivery Fee Allocation / احتساب كلفة التوصيل
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setPricingMode('added')}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: '1.5px solid',
                      borderColor: pricingMode === 'added' ? '#2563eb' : 'var(--line)',
                      background: pricingMode === 'added' ? 'rgba(37, 99, 235, 0.08)' : 'var(--surface)',
                      color: pricingMode === 'added' ? '#1d4ed8' : 'var(--text)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    Fee Added to Customer (كلفة التوصيل على الزبون)
                    <div style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--muted)', marginTop: 2 }}>
                      Customer pays Net (${netItemNum}) + Fee (${feeUsdNum}) = <strong>${codUsdNum} COD</strong>. Shop gets full <strong>${netItemNum}</strong>.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPricingMode('free_delivery')}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: '1.5px solid',
                      borderColor: pricingMode === 'free_delivery' ? '#059669' : 'var(--line)',
                      background: pricingMode === 'free_delivery' ? 'rgba(5, 150, 105, 0.08)' : 'var(--surface)',
                      color: pricingMode === 'free_delivery' ? '#047857' : 'var(--text)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    Free Delivery / Shop Pays (توصيل مجاني - على المتجر)
                    <div style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--muted)', marginTop: 2 }}>
                      Customer pays only goods (${netItemNum}). Fee deducted from shop payout (Shop gets <strong>{formatUSD(Math.max(0, netItemNum - feeUsdNum))}</strong>).
                    </div>
                  </button>
                </div>
              </div>

              {/* Net Item Price */}
              <div className="field">
                <label htmlFor="net-item-price" style={{ fontWeight: 700, color: '#0f172a' }}>
                  Net Item Price / سعر البضاعة (USD) <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  id="net-item-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={netItemUsd}
                  onChange={e => setNetItemUsd(e.target.value)}
                  required
                  style={{ fontWeight: 700 }}
                />
                <span style={{ fontSize: 11, color: '#0284c7', marginTop: 4 }}>
                  Shop payout: {formatUSD(shopNetUsd)}
                </span>
              </div>

              {/* Delivery Fee */}
              <div className="field">
                <label htmlFor="delivery-fee" style={{ fontWeight: 700, color: '#0f172a' }}>
                  Delivery Fee / كلفة التوصيل (USD) <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  id="delivery-fee"
                  type="number"
                  step="0.01"
                  min="0"
                  value={deliveryFeeUsd}
                  onChange={e => setDeliveryFeeUsd(e.target.value)}
                  required
                  style={{ fontWeight: 700 }}
                />
                <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  Zone tariff: ${deliveryFeeUsd}
                </span>
              </div>

              {/* Total COD to Collect */}
              <div className="field">
                <label style={{ fontWeight: 700, color: '#166534' }}>
                  Total COD to Collect (USD) <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <div style={{ padding: '8px 12px', background: '#ecfdf5', border: '1.5px solid #86efac', borderRadius: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#166534' }}>{formatUSD(codUsdNum)}</span>
                  <span style={{ fontSize: 11, color: '#0284c7', marginLeft: 8 }}>
                    ≈ L.L. {codLbpApprox.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>

              {/* Courier Pay */}
              <div className="field">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 4 }}>
                  <label htmlFor="courier-pay" style={{ fontWeight: 700, color: '#0f172a', margin: 0 }}>
                    Courier Pay / Driver Commission (USD) <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {['1.00', '1.50', '1.60', '2.00', '2.50'].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setDriverPayUsd(val)}
                        style={{
                          fontSize: 11,
                          padding: '1px 6px',
                          border: '1px solid',
                          borderColor: Number(driverPayUsd) === Number(val) ? 'var(--brand)' : 'var(--line)',
                          background: Number(driverPayUsd) === Number(val) ? 'var(--brand-light)' : 'var(--bg)',
                          color: Number(driverPayUsd) === Number(val) ? 'var(--brand)' : 'var(--muted)',
                          fontWeight: Number(driverPayUsd) === Number(val) ? 700 : 500,
                          borderRadius: 4,
                          cursor: 'pointer',
                        }}
                        title={`Set courier commission to $${val}`}
                      >
                        ${val}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  id="courier-pay"
                  type="number"
                  step="0.01"
                  min="0"
                  value={driverPayUsd}
                  onChange={e => setDriverPayUsd(e.target.value)}
                  required
                  style={{ fontWeight: 700 }}
                />
                <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  Courier run-sheet earning per order (Click preset above or type any custom amount like 1.60 or 2.00)
                </span>
              </div>

              {/* ─── PRICE CARD (§1.5) ─── */}
              <div
                className="field full"
                style={{
                  background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                  borderRadius: 12,
                  padding: '20px 24px',
                  color: '#fff',
                  boxShadow: '0 4px 14px rgba(15, 23, 42, 0.2)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94a3b8' }}>
                      Price Card / بطاقة التسعير
                    </span>
                    {specialFee !== null && (
                      <span
                        style={{
                          background: '#047857',
                          color: '#ecfdf5',
                          padding: '2px 8px',
                          borderRadius: 99,
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        Shop Special Price: ${specialFee.toFixed(2)}
                      </span>
                    )}
                    {isPriceOverridden && (
                      <span
                        style={{
                          background: '#b45309',
                          color: '#fef3c7',
                          padding: '2px 8px',
                          borderRadius: 99,
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        Custom Override Active
                      </span>
                    )}
                  </div>

                  {(userRole === 'owner' || userRole === 'manager') && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowPriceEditor(prev => !prev)}
                      style={{
                        fontSize: 11,
                        color: showPriceEditor ? '#facc15' : '#38bdf8',
                        padding: '3px 10px',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        background: 'rgba(255, 255, 255, 0.05)',
                      }}
                    >
                      {showPriceEditor ? 'Done Editing' : 'Edit Price Overrides'}
                    </button>
                  )}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: 16,
                    padding: '16px',
                    borderRadius: 8,
                    background: 'rgba(0, 0, 0, 0.25)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Customer pays (COD)</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#4ade80', marginTop: 2 }}>
                      {formatUSD(customerPays)}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      ≈ L.L. {codLbpApprox.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Shop receives</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#38bdf8', marginTop: 2 }}>
                      {formatUSD(shopReceives)}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Net merchandise payout</div>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Courier earns</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#facc15', marginTop: 2 }}>
                      {formatUSD(courierEarns)}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Run-sheet earning</div>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Company keeps</div>
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 800,
                        color: companyKeeps >= 0 ? '#34d399' : '#f87171',
                        marginTop: 2,
                      }}
                    >
                      {formatUSD(companyKeeps)}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Gross delivery margin</div>
                  </div>
                </div>

                {showPriceEditor && (userRole === 'owner' || userRole === 'manager') && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 16,
                      marginTop: 16,
                      padding: 16,
                      borderRadius: 8,
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px dashed rgba(255, 255, 255, 0.2)',
                    }}
                  >
                    <div>
                      <label style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>
                        Custom Delivery Fee (Override for this order)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={deliveryFeeUsd}
                        onChange={e => {
                          setDeliveryFeeUsd(e.target.value)
                          setIsPriceOverridden(true)
                        }}
                        style={{ background: '#0f172a', color: '#fff', border: '1px solid #334155' }}
                      />
                    </div>
                    <div>
                      <label style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>
                        Custom Courier Pay (Override for this order)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={driverPayUsd}
                        onChange={e => {
                          setDriverPayUsd(e.target.value)
                          setIsPriceOverridden(true)
                        }}
                        style={{ background: '#0f172a', color: '#fff', border: '1px solid #334155' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Customer / Recipient Full Name */}
              <div className="field full">
                <label htmlFor="recipient-name">
                  Customer / Recipient Name <span style={{ color: 'var(--danger)' }}>*</span>
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

              {/* Phone Number */}
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

              {/* Lebanese Town & Region Search */}
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

              {/* Repeat Customer CRM Match */}
              {phoneMatchedCustomer && (
                <div
                  className="field full"
                  style={{
                    background: 'rgba(37, 99, 235, 0.08)',
                    border: '1.5px solid rgba(37, 99, 235, 0.3)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    marginTop: -4,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8' }}>
                      Repeat Customer: {phoneMatchedCustomer.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
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

              {/* Delivery Address / Google Maps Pin */}
              <div className="field full">
                <LocationHelper
                  id="new-order-address"
                  address={recipientAddress}
                  onAddressChange={setRecipientAddress}
                  label="Delivery Address / Google Maps Pin"
                  placeholder="e.g. Achrafieh, Sassine Square, Bldg 12 or paste Google Maps link"
                  required
                />
              </div>

              {/* Service Type Selector */}
              <div
                className="field full"
                style={{
                  background: 'var(--bg)',
                  padding: 12,
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--line)',
                }}
              >
                <label style={{ fontWeight: 700, color: 'var(--brand)', marginBottom: 6, display: 'block' }}>
                  Service Type / نوع الطلب
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setServiceType('delivery')}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: '1.5px solid',
                      borderColor: serviceType === 'delivery' ? 'var(--brand)' : 'var(--line)',
                      background: serviceType === 'delivery' ? 'var(--brand-light)' : 'var(--surface)',
                      color: serviceType === 'delivery' ? 'var(--brand)' : 'var(--text)',
                      fontWeight: serviceType === 'delivery' ? 700 : 500,
                      fontSize: 12,
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    Delivery
                  </button>
                  <button
                    type="button"
                    onClick={() => setServiceType('replacement')}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: '1.5px solid',
                      borderColor: serviceType === 'replacement' ? '#d97706' : 'var(--line)',
                      background: serviceType === 'replacement' ? 'rgba(217, 119, 6, 0.15)' : 'var(--surface)',
                      color: serviceType === 'replacement' ? '#b45309' : 'var(--text)',
                      fontWeight: serviceType === 'replacement' ? 700 : 500,
                      fontSize: 12,
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    Replacement (تبديل)
                  </button>
                  <button
                    type="button"
                    onClick={() => setServiceType('pickup')}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: '1.5px solid',
                      borderColor: serviceType === 'pickup' ? '#7c3aed' : 'var(--line)',
                      background: serviceType === 'pickup' ? 'rgba(124, 58, 237, 0.15)' : 'var(--surface)',
                      color: serviceType === 'pickup' ? '#7c3aed' : 'var(--text)',
                      fontWeight: serviceType === 'pickup' ? 700 : 500,
                      fontSize: 12,
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    Return Pickup (مرتجع)
                  </button>
                </div>
              </div>

              {/* Package Weight */}
              <div className="field">
                <label htmlFor="package-weight">Package Weight (KG)</label>
                <input
                  id="package-weight"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="Optional (e.g. 1)"
                  value={weightKg}
                  onChange={e => setWeightKg(e.target.value)}
                />
                <small style={{ color: 'var(--muted)', fontSize: 11 }}>Optional — leave blank if not needed</small>
              </div>

              {/* Fragile / Breakable */}
              <div className="field" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={isBreakable}
                    onChange={e => setIsBreakable(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: '#dc2626' }}
                  />
                  <span style={{ fontWeight: 700, color: isBreakable ? '#dc2626' : 'var(--text)' }}>
                    Fragile / Breakable (قابل للكسر)
                  </span>
                </label>
                <small style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>
                  Prints a bold fragile warning banner on the thermal AWB label.
                </small>
              </div>

              {/* Carrier Tracking Code */}
              <div className="field full">
                <label htmlFor="carrier-tracking">Carrier Tracking Code (3PL / Octopus Code)</label>
                <input
                  id="carrier-tracking"
                  type="text"
                  placeholder="e.g. 220222385920 (Optional external courier tracking code)"
                  value={carrierTrackingCode}
                  onChange={e => setCarrierTrackingCode(e.target.value)}
                />
              </div>

              {/* Order Notes */}
              <div className="field full">
                <label htmlFor="order-notes">Order Notes / Package details</label>
                <input
                  id="order-notes"
                  type="text"
                  placeholder="Fragile, call on arrival, etc."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>

            </div>

            {/* Form Actions */}
            <div className="form-actions" style={{ marginTop: 24 }}>
              <Link href="/orders" className="btn btn-secondary">
                Cancel
              </Link>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={submitting}
                onClick={() => submitOrder(true)}
              >
                {submitting ? 'Creating…' : 'Create & Add Another'}
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting}
              >
                {submitting ? 'Creating order…' : 'Create Order'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
