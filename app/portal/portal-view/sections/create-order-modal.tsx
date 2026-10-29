'use client'

import React from 'react'
import { Modal } from '@/components/modal'
import { LocationHelper } from '@/components/location-helper'
import { usePortal } from '../context'
import { formatUSD, formatLBP, usdToLbp } from '@/lib/utils'
import { formatLebanesePhone } from '@/lib/phone'

export function CreateOrderModal() {
  const {
    shop,
    areas,
    specialPrices,
    rate,
    isModalOpen,
    setIsModalOpen,
    recipientName,
    setRecipientName,
    recipientPhone,
    setRecipientPhone,
    recipientAddress,
    setRecipientAddress,
    areaId,
    setAreaId,
    deliveryFeeUSD,
    deliveryFeeLBP,
    currencyMode,
    setCurrencyMode,
    rawAmount,
    setRawAmount,
    feePayerMode,
    setFeePayerMode,
    codUSD,
    codLBP,
    netPayoutUSD,
    netPayoutLBP,
    notes,
    setNotes,
    customCode,
    setCustomCode,
    serviceType,
    setServiceType,
    weightKg,
    setWeightKg,
    isBreakable,
    setIsBreakable,
    phoneMatchedCustomer,
    setPhoneMatchedCustomer,
    isPhoneValid,
    isSubmitting,
    formError,
    handleCreateOrder,
  } = usePortal()

  const specialMap = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const sp of specialPrices) {
      map.set(sp.area_id, Number(sp.fee_usd))
    }
    return map
  }, [specialPrices])

  const numericAmount = Math.max(0, parseFloat(rawAmount) || 0)
  const netGoodsUSD = currencyMode === 'USD' ? numericAmount : numericAmount / rate
  const netGoodsLBP = currencyMode === 'LBP' ? Math.round(numericAmount) : usdToLbp(netGoodsUSD, rate)

  return (
    <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Place Delivery Order — Transparent Pricing">
      <form onSubmit={handleCreateOrder} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {formError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '10px 14px', borderRadius: 8, fontSize: 12.5 }}>
            {formError}
          </div>
        )}

        {/* Recipient Full Name */}
        <div>
          <label htmlFor="modal-rec-name" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
            Recipient Full Name *
          </label>
          <input
            id="modal-rec-name"
            type="text"
            value={recipientName}
            onChange={e => setRecipientName(e.target.value)}
            placeholder="e.g. Maya Haddad"
            required
            style={{ fontSize: 13.5 }}
          />
        </div>

        {/* Recipient Lebanese Phone Number with Format Verification */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <label htmlFor="modal-rec-phone" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
              Recipient Lebanese Phone Number *
            </label>
            {isPhoneValid !== null && (
              <span style={{ fontSize: 11, fontWeight: 700, color: isPhoneValid ? '#059669' : '#dc2626' }}>
                {isPhoneValid ? `Valid (${formatLebanesePhone(recipientPhone)})` : 'Invalid format'}
              </span>
            )}
          </div>
          <input
            id="modal-rec-phone"
            type="tel"
            value={recipientPhone}
            onChange={e => setRecipientPhone(e.target.value)}
            placeholder="e.g. 70 123456 or +961 71 889900"
            required
            style={{
              fontSize: 13.5,
              borderColor: isPhoneValid === false ? '#f87171' : undefined,
            }}
          />
          <small style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginTop: 4 }}>
            Accepts Alfa & Touch mobile numbers (03, 70, 71, 76, 78, 79, 81) or Lebanese landlines.
          </small>

          {phoneMatchedCustomer && (
            <div
              style={{
                background: 'rgba(37, 99, 235, 0.08)',
                border: '1.5px solid rgba(37, 99, 235, 0.3)',
                borderRadius: 8,
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginTop: 6,
              }}
            >
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8' }}>
                  Repeat Customer Detected: {phoneMatchedCustomer.name}
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
        </div>

        {/* Service Type Selector */}
        <div style={{ background: 'var(--bg)', padding: 12, borderRadius: 8, border: '1px solid var(--line)' }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)', marginBottom: 6, display: 'block' }}>
            Service Type / نوع الخدمة
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <button
              type="button"
              onClick={() => setServiceType('delivery')}
              style={{
                padding: '8px 6px',
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
                padding: '8px 6px',
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
              Replacement
            </button>
            <button
              type="button"
              onClick={() => setServiceType('pickup')}
              style={{
                padding: '8px 6px',
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
              Return Pickup
            </button>
          </div>
        </div>

        {/* Weight & Fragile Flag */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
              Package Weight (KG)
            </label>
            <input
              type="number"
              step="any"
              min="0"
              placeholder="Optional (KG)"
              value={weightKg}
              onChange={e => setWeightKg(e.target.value)}
              style={{ fontSize: 13 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}>
              <input
                type="checkbox"
                checked={isBreakable}
                onChange={e => setIsBreakable(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: '#dc2626' }}
              />
              <span style={{ fontSize: 12, fontWeight: 700, color: isBreakable ? '#dc2626' : 'var(--text)' }}>
                Fragile / كسر
              </span>
            </label>
          </div>
        </div>

        {/* Recipient Full Address with GPS Detection & Verification */}
        <LocationHelper
          id="modal-rec-addr"
          address={recipientAddress}
          onAddressChange={setRecipientAddress}
          label="Detailed Delivery Address / Google Maps Pin"
          placeholder="e.g. Achrafieh, Sassine Square, Bldg 12 or paste Google Maps link"
          required
        />

        {/* Destination Delivery Area Selection (Shows exact fee) */}
        <div>
          <label htmlFor="modal-rec-area" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
            Destination Delivery Area (Delivery Fee Upfront) *
          </label>
          <select
            id="modal-rec-area"
            value={areaId}
            onChange={e => setAreaId(e.target.value)}
            required
            style={{ fontSize: 13.5 }}
          >
            {areas.map(a => {
              const spFee = specialMap.get(a.id)
              const fee = spFee !== undefined ? spFee : Number(a.fee_usd)
              return (
                <option key={a.id} value={a.id}>
                  {a.name} — {formatUSD(fee)} ({formatLBP(usdToLbp(fee, rate))}){spFee !== undefined ? ' ★ Special Rate' : ''}
                </option>
              )
            })}
          </select>
        </div>

        {/* Fee Allocation Mode */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
            Delivery Fee Option / خيار كلفة التوصيل
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              type="button"
              onClick={() => setFeePayerMode('customer')}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                border: '1.5px solid',
                borderColor: feePayerMode === 'customer' ? 'var(--brand)' : 'var(--line)',
                background: feePayerMode === 'customer' ? 'var(--brand-light)' : 'var(--surface)',
                color: feePayerMode === 'customer' ? 'var(--brand)' : 'var(--text)',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              Added to Customer
              <small style={{ display: 'block', fontSize: 10.5, fontWeight: 400, opacity: 0.85, marginTop: 2 }}>
                Fee added on top. You get full goods price.
              </small>
            </button>

            <button
              type="button"
              onClick={() => setFeePayerMode('shop')}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                border: '1.5px solid',
                borderColor: feePayerMode === 'shop' ? '#059669' : 'var(--line)',
                background: feePayerMode === 'shop' ? 'rgba(5, 150, 105, 0.08)' : 'var(--surface)',
                color: feePayerMode === 'shop' ? '#047857' : 'var(--text)',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              Free Delivery (Shop Pays)
              <small style={{ display: 'block', fontSize: 10.5, fontWeight: 400, opacity: 0.85, marginTop: 2 }}>
                You absorb the shipping fee as a promo.
              </small>
            </button>
          </div>
        </div>

        {/* Net Goods Price */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <label htmlFor="modal-rec-cod" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
              Net Merchandise Price / سعر البضاعة المطلوب تحصيله
            </label>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                onClick={() => setCurrencyMode('USD')}
                className={`btn btn-sm ${currencyMode === 'USD' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: 11, padding: '2px 8px' }}
              >
                USD ($)
              </button>
              <button
                type="button"
                onClick={() => setCurrencyMode('LBP')}
                className={`btn btn-sm ${currencyMode === 'LBP' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: 11, padding: '2px 8px' }}
              >
                LBP (L.L.)
              </button>
            </div>
          </div>
          <input
            id="modal-rec-cod"
            type="number"
            step={currencyMode === 'USD' ? '0.01' : '1000'}
            value={rawAmount}
            onChange={e => setRawAmount(e.target.value)}
            placeholder={currencyMode === 'USD' ? '0.00' : '0'}
            style={{ fontSize: 14, fontWeight: 700 }}
          />
        </div>

        {/* Price Transparency Breakdown Card */}
        <div
          style={{
            background: 'var(--brand-light)',
            border: '1.5px solid var(--brand)',
            borderRadius: 8,
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            fontSize: 12.5,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--brand)' }}>
            Upfront Price & Settlement Breakdown
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted)' }}>Net Goods Price (سعر البضاعة):</span>
            <strong>{formatUSD(netGoodsUSD)} <small style={{ fontWeight: 400 }}>({formatLBP(netGoodsLBP)})</small></strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted)' }}>
              {feePayerMode === 'customer' ? 'Delivery Fee (Paid by Customer):' : 'Delivery Fee (Paid by Shop):'}
            </span>
            <span style={{ color: feePayerMode === 'customer' ? '#2563eb' : '#dc2626', fontWeight: 600 }}>
              {feePayerMode === 'customer' ? `+${formatUSD(deliveryFeeUSD)}` : `-${formatUSD(deliveryFeeUSD)}`}
              <small style={{ fontWeight: 400, marginLeft: 4 }}>({formatLBP(deliveryFeeLBP)})</small>
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.6)', padding: '6px 10px', borderRadius: 6 }}>
            <span style={{ color: '#166534', fontWeight: 700 }}>Total to Collect from Customer at Door:</span>
            <strong style={{ color: '#166534', fontSize: 14 }}>
              {formatUSD(codUSD)} <small style={{ fontWeight: 600 }}>({formatLBP(codLBP)})</small>
            </strong>
          </div>

          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, color: 'var(--text)' }}>Net Money You Will Receive:</span>
            <strong style={{ fontSize: 15, color: '#047857' }}>
              {formatUSD(netPayoutUSD)}
              <small style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--muted)', textAlign: 'right' }}>
                ({formatLBP(netPayoutLBP)})
              </small>
            </strong>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="modal-rec-notes" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
            Notes / Instructions for Courier (Optional)
          </label>
          <textarea
            id="modal-rec-notes"
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Fragile package, call 15 minutes before arrival..."
            style={{ fontSize: 12.5 }}
          />
        </div>

        {/* Custom Tracking Code (Optional) */}
        <div>
          <label htmlFor="modal-rec-code" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
            Custom Tracking Number / Invoice ID (Optional)
          </label>
          <input
            id="modal-rec-code"
            type="text"
            value={customCode}
            onChange={e => setCustomCode(e.target.value.toUpperCase())}
            placeholder={`Leave empty for auto-generated non-repeating ${shop.prefix || 'CD'}-XXXXXX`}
            style={{ fontSize: 12, fontFamily: 'monospace' }}
          />
          <small style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginTop: 3 }}>
            Guaranteed unique: will check database to prevent duplicates.
          </small>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
          <button
            type="button"
            onClick={() => setIsModalOpen(false)}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn btn-primary"
            style={{ padding: '10px 20px', fontWeight: 700 }}
          >
            {isSubmitting ? 'Placing Order & Generating Barcode…' : 'Confirm & Generate Waybill Slip'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
