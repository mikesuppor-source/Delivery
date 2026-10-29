'use client'

import React from 'react'
import { usePortal } from '../context'
import { formatUSD, formatLBP } from '@/lib/utils'
import { ShopifyIcon } from '@/components/shopify-icon'

export function HeaderSection() {
  const {
    shop,
    rate,
    setIsShopifyModalOpen,
    setIsBulkImportModalOpen,
    handleDownloadTemplate,
    setFormError,
    setIsModalOpen,
  } = usePortal()

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1.5px solid var(--line)',
        borderRadius: 14,
        padding: '24px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
        boxShadow: 'var(--shadow)',
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--brand)' }}>
            Verified Store Portfolio
          </span>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>• Daily Desk Rate: ${formatUSD(1)} = {formatLBP(rate)}</span>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text)' }}>
          {shop.name}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
          Place delivery orders with guaranteed scannable barcodes, verified recipients, and upfront pricing.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => setIsShopifyModalOpen(true)}
          className="btn btn-secondary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '11px 16px',
            fontSize: 13,
            fontWeight: 700,
            borderRadius: 8,
            border: '1.5px solid #95BF47',
            color: 'var(--text)',
          }}
          title="Automate order sync from your Shopify store"
        >
          <ShopifyIcon size={18} />
          <span>Connect Shopify</span>
        </button>

        <button
          type="button"
          onClick={() => setIsBulkImportModalOpen(true)}
          className="btn btn-secondary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '11px 16px',
            fontSize: 13,
            fontWeight: 700,
            borderRadius: 8,
          }}
          title="Import orders from Shopify CSV or Excel export"
        >
          <span>Bulk Import CSV</span>
        </button>

        <button
          type="button"
          onClick={handleDownloadTemplate}
          className="btn btn-secondary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '11px 16px',
            fontSize: 13,
            fontWeight: 700,
            borderRadius: 8,
          }}
          title="Download CSV / Excel template for batch importing orders"
        >
          <span>Download Template</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setFormError('')
            setIsModalOpen(true)
          }}
          className="btn btn-primary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '11px 20px',
            fontSize: 13.5,
            fontWeight: 700,
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(36,99,79,0.25)',
          }}
        >
          <span style={{ fontSize: 16 }}>＋</span>
          <span>Make New Delivery Order</span>
        </button>
      </div>
    </div>
  )
}
