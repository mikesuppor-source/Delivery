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
  assigned_driver_ids?: string[] | null
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
  const [initializingZones, setInitializingZones] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Multi-Courier Pool Management Modal State
  const [managingArea, setManagingArea] = useState<Area | null>(null)
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>([])
  const [savingDrivers, setSavingDrivers] = useState(false)

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
          assignedDriverIds: defaultDriverId ? [defaultDriverId] : [],
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add delivery area')

      let createdArea = data.area
      if (defaultDriverId) {
        const patchRes = await fetch('/api/areas', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId,
            areaId: createdArea.id,
            defaultDriverId,
            assignedDriverIds: [defaultDriverId],
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

  // Open Multi-Courier Fleet Pool Modal
  function openManageCouriers(area: Area) {
    setManagingArea(area)
    const existing = area.assigned_driver_ids && area.assigned_driver_ids.length > 0
      ? area.assigned_driver_ids
      : (area.default_driver_id ? [area.default_driver_id] : [])
    setSelectedDriverIds(existing)
  }

  function toggleDriver(driverId: string) {
    setSelectedDriverIds(prev =>
      prev.includes(driverId) ? prev.filter(id => id !== driverId) : [...prev, driverId]
    )
  }

  function selectAllDrivers() {
    setSelectedDriverIds(drivers.map(d => d.id))
  }

  function clearAllDrivers() {
    setSelectedDriverIds([])
  }

  // Save Fleet Courier Pool
  async function handleSaveCouriers() {
    if (!managingArea) return
    setSavingDrivers(true)
    try {
      const res = await fetch('/api/areas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          areaId: managingArea.id,
          assignedDriverIds: selectedDriverIds,
          defaultDriverId: selectedDriverIds[0] || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update courier pool')

      setAreas(prev =>
        prev.map(a =>
          a.id === managingArea.id
            ? {
                ...a,
                assigned_driver_ids: selectedDriverIds,
                default_driver_id: selectedDriverIds[0] || null,
                default_driver: drivers.find(d => d.id === selectedDriverIds[0]) || null,
              }
            : a
        )
      )
      setManagingArea(null)
      showToast(`Updated courier pool for "${managingArea.name}" (${selectedDriverIds.length} couriers assigned)!`, 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error updating courier pool', 'error')
    } finally {
      setSavingDrivers(false)
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

  // One-Click Initialize Standard Lebanese Zones with all fleet drivers
  async function handleInitLebanonZones() {
    if (!window.confirm('Create standard Lebanese delivery zones (Beirut Central, Greater Beirut, Metn, Keserwan, North/Tripoli, South/Saida, Bekaa/Zahle) with all fleet couriers assigned?')) {
      return
    }
    setInitializingZones(true)
    const standardZones = [
      { name: 'Beirut Central (بيروت المركزية)', feeUsd: 3.00 },
      { name: 'Greater Beirut & Suburbs (ضواحي بيروت)', feeUsd: 4.00 },
      { name: 'Metn & Coast (المتن والساحل)', feeUsd: 4.50 },
      { name: 'Keserwan & Jbeil (كسروان وجبيل)', feeUsd: 5.00 },
      { name: 'Chouf & Aley (الشوف وعاليه)', feeUsd: 5.50 },
      { name: 'North & Tripoli (طرابلس والشمال)', feeUsd: 7.00 },
      { name: 'South & Saida / Tyre (صيدا وصور والجنوب)', feeUsd: 7.00 },
      { name: 'Bekaa & Zahle (زحلة والبقاع)', feeUsd: 7.00 },
      { name: 'Nabatieh & Border (النبطية والجنوب)', feeUsd: 8.00 },
    ]

    try {
      const allDriverIds = drivers.map(d => d.id)
      let addedCount = 0

      for (const z of standardZones) {
        const exists = areas.some(a => a.name.toLowerCase().includes(z.name.slice(0, 8).toLowerCase()))
        if (!exists) {
          const res = await fetch('/api/areas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspaceId,
              name: z.name,
              feeUsd: z.feeUsd,
              assignedDriverIds: allDriverIds,
            }),
          })
          if (res.ok) {
            const data = await res.json()
            if (data.area) {
              setAreas(prev => [...prev, data.area])
              addedCount++
            }
          }
        }
      }

      showToast(`Initialized ${addedCount} standard Lebanese delivery zones!`, 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error initializing zones', 'error')
    } finally {
      setInitializingZones(false)
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Delivery Areas & Fleet Dispatch</h1>
          <p>Zone tariffs and multi-courier pool auto-dispatching across Lebanon</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {canEdit && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={initializingZones}
                onClick={handleInitLebanonZones}
                title="Create standard Lebanese delivery zones (Beirut, Metn, Tripoli, Saida, Bekaa)"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <span>{initializingZones ? 'Setting up…' : 'Setup Lebanese Zones'}</span>
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                disabled={autoAssigning}
                onClick={handleAutoAssign}
                title="Automatically assign pending orders fairly across their area courier pools"
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
                <th>Couriers Fleet Pool (Auto-Dispatch)</th>
                <th>Status</th>
                {canEdit && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {areas.map(area => {
                const poolIds = area.assigned_driver_ids && area.assigned_driver_ids.length > 0
                  ? area.assigned_driver_ids
                  : (area.default_driver_id ? [area.default_driver_id] : [])
                const poolDrivers = drivers.filter(d => poolIds.includes(d.id))

                return (
                  <tr key={area.id}>
                    <td>
                      <strong style={{ fontSize: 13.5 }}>{area.name}</strong>
                    </td>
                    <td>
                      <strong style={{ color: 'var(--brand)' }}>{formatUSD(Number(area.fee_usd))}</strong>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {poolDrivers.length > 0 ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: '#ecfdf5',
                                color: '#065f46',
                                border: '1px solid #a7f3d0',
                                padding: '2px 8px',
                                borderRadius: 99,
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              {poolDrivers.length} {poolDrivers.length === 1 ? 'Courier Pool' : 'Couriers Pool (Load-Balanced)'}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                              No couriers in pool
                            </span>
                          )}

                          {canEdit && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => openManageCouriers(area)}
                              style={{
                                fontSize: 11,
                                padding: '2px 8px',
                                border: '1px solid var(--line)',
                                color: 'var(--brand)',
                                fontWeight: 600,
                                background: 'var(--surface)',
                              }}
                            >
                              {poolDrivers.length > 0 ? 'Manage Fleet' : '+ Assign Fleet'}
                            </button>
                          )}
                        </div>

                        {poolDrivers.length > 0 && (
                          <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {poolDrivers.slice(0, 5).map(d => (
                              <span
                                key={d.id}
                                style={{
                                  background: 'var(--bg)',
                                  border: '1px solid var(--line)',
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  color: 'var(--text)',
                                }}
                              >
                                {d.name}
                              </span>
                            ))}
                            {poolDrivers.length > 5 && (
                              <span style={{ color: 'var(--brand)', fontWeight: 700, alignSelf: 'center' }}>
                                +{poolDrivers.length - 5} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
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
                )
              })}
            </tbody>
          </table>

          {areas.length === 0 && (
            <div className="empty">
              <h3>No delivery areas yet</h3>
              <p>Click "Setup Lebanese Zones" to quickly configure standard Lebanese delivery zones.</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── MODAL: ADD AREA ─── */}
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
                step="0.01"
                min="0"
                value={feeUsd}
                onChange={e => setFeeUsd(e.target.value)}
                required
              />
            </div>

            <div className="field full">
              <label>Designated Courier (Initial assignment)</label>
              <select
                value={defaultDriverId}
                onChange={e => setDefaultDriverId(e.target.value)}
              >
                <option value="">— Unassigned (Add couriers later) —</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.phone ? `(${d.phone})` : ''}
                  </option>
                ))}
              </select>
              <small style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4, display: 'block' }}>
                You can add multiple couriers to this area's pool after creating it.
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

      {/* ─── MODAL: MANAGE MULTI-COURIER FLEET POOL ─── */}
      {managingArea && (
        <Modal
          isOpen={!!managingArea}
          onClose={() => setManagingArea(null)}
          title={`Fleet Couriers for ${managingArea.name}`}
        >
          <div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
              Select all couriers who handle deliveries in <strong>{managingArea.name}</strong>. Orders for this area will automatically be load-balanced fairly across the selected team.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                {selectedDriverIds.length} of {drivers.length} Couriers Selected
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={selectAllDrivers}
                  style={{ fontSize: 11, padding: '2px 8px', color: 'var(--brand)', fontWeight: 600 }}
                >
                  Select All
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={clearAllDrivers}
                  style={{ fontSize: 11, padding: '2px 8px', color: '#dc2626' }}
                >
                  Clear Selection
                </button>
              </div>
            </div>

            <div
              style={{
                maxHeight: 320,
                overflowY: 'auto',
                border: '1px solid var(--line)',
                borderRadius: 8,
                padding: '6px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 8,
                background: 'var(--bg)',
              }}
            >
              {drivers.map(driver => {
                const isSelected = selectedDriverIds.includes(driver.id)
                return (
                  <label
                    key={driver.id}
                    onClick={() => toggleDriver(driver.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: '1.5px solid',
                      borderColor: isSelected ? 'var(--brand)' : 'var(--line)',
                      background: isSelected ? 'var(--brand-light)' : 'var(--surface)',
                      cursor: 'pointer',
                      margin: 0,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}} // handled by parent onClick
                      style={{ width: 16, height: 16, accentColor: 'var(--brand)' }}
                    />
                    <div style={{ lineHeight: 1.2 }}>
                      <strong style={{ fontSize: 12.5, color: isSelected ? 'var(--brand)' : 'var(--text)', display: 'block' }}>
                        {driver.name}
                      </strong>
                      <small style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {driver.phone || 'No phone'}
                      </small>
                    </div>
                  </label>
                )
              })}
            </div>

            <div className="form-actions" style={{ marginTop: 20 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setManagingArea(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={savingDrivers}
                onClick={handleSaveCouriers}
              >
                {savingDrivers ? 'Saving fleet pool…' : `Save ${selectedDriverIds.length} Couriers`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
