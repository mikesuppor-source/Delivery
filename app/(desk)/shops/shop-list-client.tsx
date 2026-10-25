'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Modal } from '@/components/modal'
import { formatUSD } from '@/lib/utils'
import type { UserRole } from '@/lib/roles'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { getWhatsAppUrl } from '@/lib/whatsapp'
import { TrashIcon } from '@/components/icons'

interface Shop {
  id: string
  name: string
  phone: string | null
  address: string | null
  active: boolean
  balance_usd: number
  created_at: string
  shopify_domain?: string | null
}

interface ShopListClientProps {
  shops: Shop[]
  workspaceId: string
  userRole: UserRole
}

export function ShopListClient({ shops: initialShops, workspaceId, userRole }: ShopListClientProps) {
  const [shops, setShops] = useState<Shop[]>(initialShops)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const canEdit = userRole === 'owner' || userRole === 'manager'

  async function handleAddShop(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/shops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, name, phone, address }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add shop')

      setShops(prev => [data.shop, ...prev])
      setIsModalOpen(false)
      setName('')
      setPhone('')
      setAddress('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error adding shop')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteShop(shopId: string, shopName: string) {
    if (!window.confirm(`Are you sure you want to permanently delete shop "${shopName}"? This will detach its orders and settlements.`)) {
      return
    }

    try {
      const res = await fetch(`/api/shops/${shopId}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete shop')

      setShops(prev => prev.filter(s => s.id !== shopId))
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error deleting shop')
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Shops</h1>
          <p>{shops.length} partner shops registered</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add shop
          </button>
        )}
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Shop name</th>
                <th>Phone</th>
                <th>Address</th>
                <th>Outstanding Balance</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shops.map(shop => (
                <tr key={shop.id}>
                  <td>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Link
                        href={`/shops/${shop.id}`}
                        style={{
                          fontWeight: 700,
                          color: 'var(--brand)',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                        title="View Shop Profile & Statement"
                      >
                        <span>{shop.name}</span>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </Link>
                      {shop.shopify_domain && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: '#ecfdf5',
                            color: '#059669',
                            border: '1px solid #a7f3d0',
                          }}
                          title={`Shopify Store: ${shop.shopify_domain}`}
                        >
                          🛍️ Shopify
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    {shop.phone ? (
                      <a
                        href={getWhatsAppUrl(shop.phone, `Hello ${shop.name}, Cedar Delivery Desk here regarding your store deliveries and balance.`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="whatsapp-badge"
                        title="Chat with Shop on WhatsApp"
                      >
                        <WhatsAppIcon size={13} />
                        <span>{shop.phone}</span>
                      </a>
                    ) : '—'}
                  </td>
                  <td>{shop.address || '—'}</td>
                  <td style={{ color: Number(shop.balance_usd) < 0 ? 'var(--danger)' : 'inherit', fontWeight: 600 }}>
                    {formatUSD(Number(shop.balance_usd))}
                  </td>
                  <td>
                    <span className={`badge ${shop.active ? 'badge-delivered' : 'badge-returned'}`}>
                      {shop.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Link
                        href={`/shops/${shop.id}`}
                        className="btn btn-secondary"
                        style={{ fontSize: 12, padding: '4px 10px', textDecoration: 'none' }}
                      >
                        View Profile
                      </Link>
                      {canEdit && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => handleDeleteShop(shop.id, shop.name)}
                          style={{ fontSize: 11, padding: '4px 8px', color: '#dc2626' }}
                          title="Delete shop record"
                        >
                          <TrashIcon size={13} color="#dc2626" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {shops.length === 0 && (
            <div className="empty">
              <h3>No shops yet</h3>
              <p>Add your first partner store or merchant.</p>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add Partner Shop">
        <form onSubmit={handleAddShop}>
          <div className="form-grid">
            <div className="field full">
              <label>Shop / Merchant Name</label>
              <input
                type="text"
                placeholder="e.g. Beirut Artisan Bakery"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="field">
              <label>Phone Number</label>
              <input
                type="tel"
                placeholder="e.g. +961 1 234567"
                value={phone}
                onChange={e => setPhone(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Address / Location</label>
              <input
                type="text"
                placeholder="e.g. Mar Mikhael, Main St."
                value={address}
                onChange={e => setAddress(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="error-msg" style={{ marginTop: 12 }}>{error}</p>}

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Adding shop…' : 'Add Shop'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  )
}
