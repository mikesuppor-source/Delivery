'use client'

import { Modal } from '@/components/modal'
import { useOrderList } from '../context'

export function DriverRequiredModal() {
  const { driverRequiredOrder, drivers, handleConfirmDriverAndStatus, isDriverRequiredModalOpen, pendingTargetStatus, promptDriverId, promptSubmitting, setDriverRequiredOrder, setIsDriverRequiredModalOpen, setPromptDriverId } = useOrderList()
  return (
    <>
      {/* ─── MODAL: WARNING DRIVER REQUIRED ─── */}
      <Modal
        isOpen={isDriverRequiredModalOpen}
        onClose={() => {
          setIsDriverRequiredModalOpen(false)
          setDriverRequiredOrder(null)
        }}
        title="Driver Assignment Required"
      >
        <form onSubmit={handleConfirmDriverAndStatus}>
          <div style={{ padding: '4px 0 16px' }}>
            <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
              Order <strong>#{driverRequiredOrder?.code}</strong> cannot be marked as{' '}
              <span className={`badge badge-${pendingTargetStatus}`} style={{ fontSize: 11, padding: '2px 8px' }}>
                {pendingTargetStatus.toUpperCase()}
              </span>{' '}
              without assigning a courier.
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
              Assigning the courier ensures their delivery pay and COD collections are accurately credited to their profile.
            </p>
          </div>

          <div className="form-grid">
            <div className="field full">
              <label>Select Courier for this Delivery</label>
              <select
                value={promptDriverId}
                onChange={e => setPromptDriverId(e.target.value)}
                required
                autoFocus
              >
                <option value="">-- Choose Driver --</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.phone ? `(${d.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-actions" style={{ marginTop: 20 }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setIsDriverRequiredModalOpen(false)
                setDriverRequiredOrder(null)
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={promptSubmitting || !promptDriverId}
            >
              {promptSubmitting ? 'Assigning…' : 'Assign Courier & Update Status'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  )
}
