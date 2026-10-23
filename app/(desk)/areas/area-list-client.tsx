'use client'

import { useState } from 'react'
import { Modal } from '@/components/modal'
import { formatUSD } from '@/lib/utils'
import type { UserRole } from '@/lib/roles'

interface Area {
  id: string
  name: string
  fee_usd: number
  active: boolean
}

interface AreaListClientProps {
  areas: Area[]
  workspaceId: string
  userRole: UserRole
}

export function AreaListClient({ areas: initialAreas, workspaceId, userRole }: AreaListClientProps) {
  const [areas, setAreas] = useState<Area[]>(initialAreas)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [feeUsd, setFeeUsd] = useState('3.50')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const canEdit = userRole === 'owner' || userRole === 'manager'

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

      setAreas(prev => [data.area, ...prev])
      setIsModalOpen(false)
      setName('')
      setFeeUsd('3.50')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error adding area')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Delivery areas</h1>
          <p>Zone-based pricing for your delivery dispatch</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add area
          </button>
        )}
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Area Name / Zone</th>
                <th>Standard Delivery Fee</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {areas.map(area => (
                <tr key={area.id}>
                  <td><strong>{area.name}</strong></td>
                  <td><strong>{formatUSD(Number(area.fee_usd))}</strong></td>
                  <td>
                    <span className={`badge ${area.active ? 'badge-delivered' : 'badge-returned'}`}>
                      {area.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
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
