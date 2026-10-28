'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Modal } from '@/components/modal'
import { formatUSD, formatDate } from '@/lib/utils'
import type { UserRole } from '@/lib/roles'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { getWhatsAppUrl } from '@/lib/whatsapp'
import { TrashIcon } from '@/components/icons'

interface Driver {
  id: string
  name: string
  phone: string | null
  has_pin?: boolean
  active: boolean
  cash_held_usd: number
  pay_owed_usd: number
  current_lat?: number | null
  current_lng?: number | null
  last_location_at?: string | null
  active_orders_count?: number
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
  const [pinCode, setPinCode] = useState('')
  const [issuedLogin, setIssuedLogin] = useState<{ name: string; phone: string | null; pin: string } | null>(null)
  const [resettingId, setResettingId] = useState<string | null>(null)
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
          pinCode: pinCode.trim() || undefined,
          userId: userId || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add driver')

      setDrivers(prev => [data.driver, ...prev])
      setIsModalOpen(false)
      setIssuedLogin({ name: data.driver.name, phone: data.driver.phone, pin: data.pin })
      setName('')
      setPhone('')
      setPinCode('')
      setUserId('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error adding driver')
    } finally {
      setSubmitting(false)
    }
  }

  // PINs are stored hashed, so a forgotten PIN is replaced rather than shown.
  async function handleResetPin(driver: Driver) {
    if (!window.confirm(`Issue a new PIN for ${driver.name}? Their old PIN stops working and they are signed out of the courier app.`)) {
      return
    }
    setResettingId(driver.id)
    try {
      const res = await fetch(`/api/drivers/${driver.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, resetPin: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to reset PIN')
      setDrivers(prev => prev.map(d => (d.id === driver.id ? { ...d, has_pin: true } : d)))
      setIssuedLogin({ name: driver.name, phone: driver.phone, pin: data.pin })
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error resetting PIN')
    } finally {
      setResettingId(null)
    }
  }

  async function handleDeleteDriver(driverId: string, driverName: string) {
    if (!window.confirm(`Are you sure you want to permanently delete driver "${driverName}"? This will unassign this courier from all assigned orders and settlements.`)) {
      return
    }

    try {
      const res = await fetch(`/api/drivers/${driverId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete driver')

      setDrivers(prev => prev.filter(d => d.id !== driverId))
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error deleting driver')
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
                <th>Fleet Flow / Workload</th>
                <th>Live GPS Location</th>
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
                        <small style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 600 }}>
                          {driver.has_pin ? 'PIN set' : <span style={{ color: '#b45309', fontWeight: 700 }}>No PIN, cannot sign in</span>}
                        </small>
                      </div>
                    ) : '—'}
                  </td>
                  <td>
                    {driver.active_orders_count && driver.active_orders_count > 0 ? (
                      <span className="badge badge-assigned" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6' }} />
                        <span>{driver.active_orders_count} to deliver</span>
                      </span>
                    ) : (
                      <span className="badge" style={{ background: 'var(--surface-hover)', color: 'var(--muted)' }}>
                        Idle (Available)
                      </span>
                    )}
                  </td>
                  <td>
                    {driver.current_lat && driver.current_lng ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <a
                          href={`https://www.google.com/maps?q=${driver.current_lat},${driver.current_lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 11.5,
                            fontWeight: 700,
                            color: '#10b981',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            textDecoration: 'none',
                          }}
                          title="Open live coordinates on Google Maps"
                        >
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
                          <span>View on Map</span>
                        </a>
                        {driver.last_location_at && (
                          <small style={{ fontSize: 10, color: 'var(--muted)' }}>
                            {formatDate(driver.last_location_at)}
                          </small>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        No GPS ping yet
                      </span>
                    )}
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
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {canEdit && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: 11, padding: '4px 8px' }}
                          onClick={() => handleResetPin(driver)}
                          disabled={resettingId === driver.id}
                          title="Issue a new courier app PIN"
                        >
                          {resettingId === driver.id ? 'Issuing…' : driver.has_pin ? 'Reset PIN' : 'Issue PIN'}
                        </button>
                      )}
                      <Link
                        href={`/drivers/${driver.id}`}
                        className="btn btn-secondary"
                        style={{ fontSize: 12, padding: '4px 10px', textDecoration: 'none' }}
                      >
                        Profile
                      </Link>
                      {canEdit && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => handleDeleteDriver(driver.id, driver.name)}
                          style={{ fontSize: 11, padding: '4px 8px', color: '#dc2626' }}
                          title="Delete driver record"
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
                placeholder="e.g. +961 71 123456"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Courier Mobile PIN</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                placeholder="Leave blank to generate one"
                value={pinCode}
                onChange={e => setPinCode(e.target.value.replace(/\D/g, ''))}
              />
              <small style={{ color: 'var(--muted)', fontSize: 11 }}>4 to 8 digits. Shown once after saving, then stored encrypted.</small>
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

      <Modal isOpen={!!issuedLogin} onClose={() => setIssuedLogin(null)} title="Courier app login" maxWidth="min(92vw, 440px)">
        {issuedLogin && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0 }}>
              Give these details to <strong>{issuedLogin.name}</strong>. The PIN is only shown now. If it is lost, issue a new one.
            </p>
            <div style={{ background: 'var(--surface-hover)', borderRadius: 8, padding: 12, fontSize: 14 }}>
              <div>Phone: <strong>{issuedLogin.phone || '—'}</strong></div>
              <div>PIN: <strong style={{ fontSize: 20, letterSpacing: 3 }}>{issuedLogin.pin}</strong></div>
            </div>
            <div className="form-actions">
              {issuedLogin.phone && (
                <a
                  href={getWhatsAppUrl(
                    issuedLogin.phone,
                    `Hello ${issuedLogin.name}, here is your Cedar Courier App login:
📱 Phone: ${issuedLogin.phone}
🔑 PIN: ${issuedLogin.pin}
🚀 App: ${window.location.origin}/driver`
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
                >
                  <WhatsAppIcon size={13} color="#25D366" />
                  <span>Send on WhatsApp</span>
                </a>
              )}
              <button type="button" className="btn btn-primary" onClick={() => setIssuedLogin(null)}>
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
