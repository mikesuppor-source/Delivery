'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Modal } from '@/components/modal'
import { formatUSD } from '@/lib/utils'
import type { UserRole } from '@/lib/roles'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { getWhatsAppUrl } from '@/lib/whatsapp'

interface Driver {
  id: string
  name: string
  phone: string | null
  active: boolean
  cash_held_usd: number
  pay_owed_usd: number
}

interface MemberUser {
  id: string
  display_name: string | null
  email?: string
}

interface DriverListClientProps {
  drivers: Driver[]
  staffMembers: MemberUser[]
  workspaceId: string
  userRole: UserRole
}

export function DriverListClient({
  drivers: initialDrivers,
  staffMembers,
  workspaceId,
  userRole,
}: DriverListClientProps) {
  const [drivers, setDrivers] = useState<Driver[]>(initialDrivers)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [userId, setUserId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const canEdit = userRole === 'owner' || userRole === 'manager'

  async function handleAddDriver(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          name,
          phone,
          userId: userId || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add driver')

      setDrivers(prev => [data.driver, ...prev])
      setIsModalOpen(false)
      setName('')
      setPhone('')
      setUserId('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error adding driver')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Drivers</h1>
          <p>{drivers.length} delivery drivers active</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add driver
          </button>
        )}
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Driver Name</th>
                <th>Phone</th>
                <th>Cash Held (To Remit)</th>
                <th>Pay Owed (Earnings)</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map(driver => (
                <tr key={driver.id}>
                  <td>
                    <Link
                      href={`/drivers/${driver.id}`}
                      style={{
                        fontWeight: 700,
                        color: 'var(--brand)',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                      title="View Driver Profile & P&L"
                    >
                      <span>{driver.name}</span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </Link>
                  </td>
                  <td>
                    {driver.phone ? (
                      <a
                        href={getWhatsAppUrl(driver.phone, `Hello ${driver.name}, Cedar Delivery dispatch here.`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="whatsapp-badge"
                        title="Message courier on WhatsApp"
                      >
                        <WhatsAppIcon size={13} />
                        <span>{driver.phone}</span>
                      </a>
                    ) : '—'}
                  </td>
                  <td>
                    <strong>{formatUSD(Number(driver.cash_held_usd))}</strong>
                    <small>Unremitted COD</small>
                  </td>
                  <td>
                    <strong style={{ color: 'var(--brand)' }}>{formatUSD(Number(driver.pay_owed_usd))}</strong>
                    <small>Accumulated pay</small>
                  </td>
                  <td>
                    <span className={`badge ${driver.active ? 'badge-delivered' : 'badge-returned'}`}>
                      {driver.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Link
                      href={`/drivers/${driver.id}`}
                      className="btn btn-secondary"
                      style={{ fontSize: 12, padding: '4px 10px', textDecoration: 'none' }}
                    >
                      View Profile
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {drivers.length === 0 && (
            <div className="empty">
              <h3>No drivers registered</h3>
              <p>Add drivers to dispatch deliveries and track cash remittances.</p>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Register Driver">
        <form onSubmit={handleAddDriver}>
          <div className="form-grid">
            <div className="field full">
              <label>Driver Full Name</label>
              <input
                type="text"
                placeholder="e.g. Tarek Kassir"
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
                placeholder="e.g. +961 3 987654"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Link Staff Login Account (Optional)</label>
              <select value={userId} onChange={e => setUserId(e.target.value)}>
                <option value="">-- No App Login (Manual tracking) --</option>
                {staffMembers.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.display_name || 'Staff User'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="error-msg" style={{ marginTop: 12 }}>{error}</p>}

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Registering…' : 'Register Driver'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  )
}
