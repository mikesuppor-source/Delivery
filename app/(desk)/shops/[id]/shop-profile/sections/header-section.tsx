'use client'

import React from 'react'
import Link from 'next/link'
import { useShopProfile } from '../context'
import { formatUSD } from '@/lib/utils'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { getWhatsAppUrl } from '@/lib/whatsapp'
import { ShopifyIcon } from '@/components/shopify-icon'

export function HeaderSection() {
  const {
    shop,
    workspace,
    canManage,
    currentBalanceUSD,
    openPayoutModal,
    setActiveTab,
    setIsShopifyModalOpen,
    syncingShopify,
    handleSyncShopifyOrders,
    setEditName,
    setEditPhone,
    setEditAddress,
    setEditActive,
    setEditError,
    setIsEditModalOpen,
  } = useShopProfile()

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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>
                  {shop.name}
                </h1>
                <span className={`badge ${shop.active ? 'badge-delivered' : 'badge-returned'}`}>
                  {shop.active ? 'Active Partner Store' : 'Inactive'}
                </span>
                {shop.shopify_domain && (
                  <a
                    href={`https://${shop.shopify_domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '3px 10px',
                      borderRadius: 6,
                      background: '#ecfdf5',
                      color: '#047857',
                      border: '1px solid #a7f3d0',
                      fontSize: 12,
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                    title={`Shopify Store: https://${shop.shopify_domain}`}
                  >
                    <ShopifyIcon size={14} />
                    <span>Shopify: {shop.shopify_domain}</span>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                )}
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

                {shop.shopify_domain && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleSyncShopifyOrders}
                    disabled={syncingShopify}
                    title="Fetch and sync existing orders from Shopify store"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: '#ecfdf5',
                      borderColor: '#86efac',
                      color: '#166534',
                      fontWeight: 600,
                    }}
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      style={{ animation: syncingShopify ? 'spin 1s linear infinite' : 'none' }}
                    >
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                    <span>{syncingShopify ? 'Syncing Shopify…' : 'Sync Orders from Shopify'}</span>
                  </button>
                )}

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
    </>
  )
}
