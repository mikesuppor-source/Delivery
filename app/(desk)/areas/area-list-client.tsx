'use client'

import { useState } from 'react'
import { Modal } from '@/components/modal'
import { formatUSD } from '@/lib/utils'
import type { UserRole } from '@/lib/roles'
import { TrashIcon, CheckIcon, AlertCircleIcon, RefreshIcon } from '@/components/icons'

interface Driver {
  id: string
  name: string
  phone: string | null
  active: boolean
}

interface Area {
  id: string
  name: string
  fee_usd: number
  active: boolean
  default_driver_id: string | null
  default_driver?: Driver | null
}

interface AreaListClientProps {
  areas: Area[]
  drivers: Driver[]
  workspaceId: string
  userRole: UserRole
}

export function AreaListClient({
  areas: initialAreas,
  drivers,
  workspaceId,
  userRole,
}: AreaListClientProps) {
  const [areas, setAreas] = useState<Area[]>(initialAreas)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [feeUsd, setFeeUsd] = useState('3.50')
  const [defaultDriverId, setDefaultDriverId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [autoAssigning, setAutoAssigning] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [updatingAreaId, setUpdatingAreaId] = useState<string | null>(null)

  const canEdit = userRole === 'owner' || userRole === 'manager'

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4500)
  }

  // Handle Add New Area
  async function handleAddArea(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/areas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          name,
          feeUsd: Number(feeUsd),
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add delivery area')

      let createdArea = data.area
      if (defaultDriverId) {
        // Update default driver if selected
        const patchRes = await fetch('/api/areas', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId,
            areaId: createdArea.id,
            defaultDriverId,
          }),
        })
        const patchData = await patchRes.json()
        if (patchRes.ok && patchData.area) {
          createdArea = patchData.area
        }
      }

      setAreas(prev => [createdArea, ...prev])
      setIsModalOpen(false)
      setName('')
      setFeeUsd('3.50')
      setDefaultDriverId('')
      showToast(`Area "${createdArea.name}" added successfully!`, 'success')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error adding area')
    } finally {
      setSubmitting(false)
    }
  }

  // Handle changing default driver on an existing area
  async function handleUpdateDefaultDriver(areaId: string, driverId: string) {
    setUpdatingAreaId(areaId)
    try {
      const res = await fetch('/api/areas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          areaId,
          defaultDriverId: driverId || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update courier assignment')

      const foundDriver = drivers.find(d => d.id === driverId) || null
      setAreas(prev =>
        prev.map(a =>
          a.id === areaId
            ? { ...a, default_driver_id: driverId || null, default_driver: foundDriver }
            : a
        )
      )

      showToast(`Default courier updated for this area!`, 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error updating area', 'error')
    } finally {
      setUpdatingAreaId(null)
    }
  }

  // Handle Delete Area
  async function handleDeleteArea(areaId: string, areaName: string) {
    if (!window.confirm(`Are you sure you want to permanently delete area "${areaName}"? Existing orders will keep their records with area unlinked.`)) {
      return
    }

    try {
      const res = await fetch('/api/areas', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, areaId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete delivery area')

      setAreas(prev => prev.filter(a => a.id !== areaId))
      showToast(`Area "${areaName}" deleted.`, 'success')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error deleting delivery area')
    }
  }

  // Trigger 1-Click Auto-Assign by Area
  async function handleAutoAssign() {
    setAutoAssigning(true)
    try {
      const res = await fetch('/api/orders/auto-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Auto-assign failed')

      showToast(data.message || `Auto-assigned ${data.count} orders!`, data.count > 0 ? 'success' : 'error')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Auto-assign failed', 'error')
    } finally {
      setAutoAssigning(false)
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Delivery areas & Zone Dispatch</h1>
          <p>Zone-based pricing and automated courier assignment for Lebanon</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {canEdit && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={autoAssigning}
                onClick={handleAutoAssign}
                title="Automatically assign all unassigned orders to their area courier"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {autoAssigning && (
                  <RefreshIcon size={14} style={{ animation: 'spin 1s linear infinite' }} />
                )}
                <span>{autoAssigning ? 'Auto-Assigning…' : 'Auto-Assign Pending Orders'}</span>
              </button>

              <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add area
              </button>
            </>
          )}
        </div>
      </div>

      {toast && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: 10,
            marginBottom: 20,
            fontSize: 14,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: toast.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${toast.type === 'success' ? '#10b981' : '#ef4444'}`,
            color: toast.type === 'success' ? '#34d399' : '#f87171',
          }}
        >
          {toast.type === 'success' ? <CheckIcon size={18} /> : <AlertCircleIcon size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Area Name / Zone</th>
                <th>Standard Delivery Fee</th>
                <th>Designated Courier (Auto-Dispatch)</th>
                <th>Status</th>
                {canEdit && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {areas.map(area => (
                <tr key={area.id}>
                  <td>
                    <strong>{area.name}</strong>
                  </td>
                  <td>
                    <strong>{formatUSD(Number(area.fee_usd))}</strong>
                  </td>
                  <td>
                    {canEdit ? (
                      <select
                        value={area.default_driver_id || ''}
                        disabled={updatingAreaId === area.id}
                        onChange={e => handleUpdateDefaultDriver(area.id, e.target.value)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 6,
                          border: '1px solid var(--line)',
                          background: 'var(--surface)',
                          color: 'var(--ink)',
                          fontSize: 13,
                          fontWeight: 600,
                          maxWidth: 220,
                        }}
                      >
                        <option value="">— Unassigned (Manual) —</option>
                        {drivers.map(d => (
                          <option key={d.id} value={d.id}>
                            {d.name} {d.phone ? `(${d.phone})` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                        {area.default_driver?.name || 'Manual dispatch'}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${area.active ? 'badge-delivered' : 'badge-returned'}`}>
                      {area.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {canEdit && (
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => handleDeleteArea(area.id, area.name)}
                        style={{
                          fontSize: 11,
                          padding: '4px 8px',
                          color: '#dc2626',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                        }}
                        title="Delete delivery area"
                      >
                        <TrashIcon size={12} color="#dc2626" />
                        <span>Delete</span>
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {areas.length === 0 && (
            <div className="empty">
              <h3>No delivery areas yet</h3>
              <p>Add pricing zones (e.g. Beirut Central, Metn, Keserwan, South).</p>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add Delivery Area">
        <form onSubmit={handleAddArea}>
          <div className="form-grid">
            <div className="field full">
              <label>Area / Zone Name</label>
              <input
                type="text"
                placeholder="e.g. Tripoli & North"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="field full">
              <label>Standard Delivery Fee (USD)</label>
              <input
                type="number"
                step="0.25"
                min="0"
                value={feeUsd}
                onChange={e => setFeeUsd(e.target.value)}
                required
              />
            </div>

            <div className="field full">
              <label>Designated Courier (Optional)</label>
              <select
                value={defaultDriverId}
                onChange={e => setDefaultDriverId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--line)',
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  fontSize: 14,
                }}
              >
                <option value="">— None (Manual assignment) —</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.phone ? `(${d.phone})` : ''}
                  </option>
                ))}
              </select>
              <small style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4, display: 'block' }}>
                Orders in this area can be auto-dispatched to this courier with 1 click.
              </small>
            </div>
          </div>

          {error && <p className="error-msg" style={{ marginTop: 12 }}>{error}</p>}

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Adding area…' : 'Add Area'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  )
}
