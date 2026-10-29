'use client'

import React from 'react'
import { Modal } from '@/components/modal'
import { useDriverProfile } from '../context'
import { formatUSD, formatLBP } from '@/lib/utils'

export function ModalsSection() {
  const {
    driver,
    isSettlementModalOpen,
    setIsSettlementModalOpen,
    settlementType,
    setSettlementType,
    settlementAmount,
    setSettlementAmount,
    settlementAmountLbp,
    setSettlementAmountLbp,
    settlementNote,
    setSettlementNote,
    settling,
    settleError,
    handleRecordSettlement,

    isShiftCloseModalOpen,
    setIsShiftCloseModalOpen,
    shiftCloseMode,
    setShiftCloseMode,
    shiftHandoverUsd,
    setShiftHandoverUsd,
    shiftHandoverLbp,
    setShiftHandoverLbp,
    shiftNotes,
    setShiftNotes,
    closingShift,
    shiftCloseError,
    handleExecuteShiftClosure,
    deliveredCount,

    isEditModalOpen,
    setIsEditModalOpen,
    editName,
    setEditName,
    editPhone,
    setEditPhone,
    editActive,
    setEditActive,
    savingEdit,
    editError,
    handleSaveEdit,
  } = useDriverProfile()

  return (
    <>
      {/* ─── MODAL: RECORD SETTLEMENT ─── */}
      <Modal
        isOpen={isSettlementModalOpen}
        onClose={() => setIsSettlementModalOpen(false)}
        title={settlementType === 'driver_cash_remittance' ? 'Record Driver Cash Remittance' : 'Pay Driver Commissions'}
      >
        <form onSubmit={handleRecordSettlement}>
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 12px' }}>
              {settlementType === 'driver_cash_remittance'
                ? `Record cash collected by ${driver.name} from COD deliveries and handed over to the desk.`
                : `Record commission earnings paid out to ${driver.name}.`}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Current Unremitted COD</span>
                <strong style={{ display: 'block', fontSize: 18, marginTop: 4, color: '#b45309' }}>
                  {formatUSD(Number(driver.cash_held_usd))}
                  {driver.cash_held_lbp ? ` + ${formatLBP(Number(driver.cash_held_lbp))}` : ''}
                </strong>
              </div>
              <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Current Pay Owed</span>
                <strong style={{ display: 'block', fontSize: 18, marginTop: 4, color: 'var(--brand)' }}>
                  {formatUSD(Number(driver.pay_owed_usd))}
                </strong>
              </div>
            </div>
          </div>

          <div className="form-grid">
            <div className="field full">
              <label>Settlement Type</label>
              <select
                value={settlementType}
                onChange={e => {
                  const t = e.target.value as 'driver_cash_remittance' | 'driver_pay'
                  setSettlementType(t)
                  setSettlementAmount(
                    t === 'driver_cash_remittance'
                      ? Number(driver.cash_held_usd) > 0
                        ? driver.cash_held_usd.toString()
                        : ''
                      : Number(driver.pay_owed_usd) > 0
                      ? driver.pay_owed_usd.toString()
                      : ''
                  )
                }}
              >
                <option value="driver_cash_remittance">Driver Cash Remittance (COD Collected → Company)</option>
                <option value="driver_pay">Driver Pay (Company → Driver Commission Payout)</option>
              </select>
            </div>

            {settlementType === 'driver_cash_remittance' ? (
              <>
                <div className="field full" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label>Amount (USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={settlementAmount}
                      onChange={e => setSettlementAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <label>Amount (LBP)</label>
                    <input
                      type="number"
                      step="500"
                      min="0"
                      placeholder="0 LBP"
                      value={settlementAmountLbp}
                      onChange={e => setSettlementAmountLbp(e.target.value)}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="field full">
                <label>Amount (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={settlementAmount}
                  onChange={e => setSettlementAmount(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            )}

            <div className="field full">
              <label>Note / Reference (Optional)</label>
              <input
                type="text"
                placeholder="e.g. End of day remittance, envelope #12"
                value={settlementNote}
                onChange={e => setSettlementNote(e.target.value)}
              />
            </div>
          </div>

          {settleError && <p className="error-msg" style={{ marginTop: 12 }}>{settleError}</p>}

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setIsSettlementModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={settling}>
              {settling ? 'Recording…' : 'Confirm & Save'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── MODAL: END-OF-DAY SHIFT CLOSURE ─── */}
      <Modal
        isOpen={isShiftCloseModalOpen}
        onClose={() => setIsShiftCloseModalOpen(false)}
        title="End-of-Day Shift Closure & Cash Handover"
      >
        <form onSubmit={handleExecuteShiftClosure}>
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 14px', lineHeight: 1.45 }}>
              Reconcile courier deliveries, record physical cash remittance, and generate the official signed cashier handover voucher.
            </p>

            {/* Quick Shift Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Delivered</span>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>{deliveredCount}</div>
                <small style={{ color: 'var(--muted)', fontSize: 10 }}>Stops completed</small>
              </div>

              <div style={{ background: 'var(--bg)', border: '1.5px solid #059669', borderRadius: 8, padding: '10px' }}>
                <span style={{ fontSize: 11, color: '#059669', fontWeight: 700 }}>COD Cash Held</span>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#059669', marginTop: 2 }}>
                  {formatUSD(Number(driver.cash_held_usd))}
                </div>
                <small style={{ color: 'var(--muted)', fontSize: 10 }}>In driver pouch</small>
              </div>

              <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px' }}>
                <span style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 600 }}>Driver Pay</span>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--brand)', marginTop: 2 }}>
                  {formatUSD(Number(driver.pay_owed_usd))}
                </div>
                <small style={{ color: 'var(--muted)', fontSize: 10 }}>Commission due</small>
              </div>
            </div>

            {/* Handover Mode Tabs */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>
                SETTLEMENT METHOD
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => {
                    setShiftCloseMode('full')
                    setShiftHandoverUsd(String(driver.cash_held_usd || ''))
                  }}
                  style={{
                    background: shiftCloseMode === 'full' ? 'var(--brand)' : 'var(--bg)',
                    color: shiftCloseMode === 'full' ? '#fff' : 'var(--text)',
                    border: '1px solid ' + (shiftCloseMode === 'full' ? 'var(--brand)' : 'var(--line)'),
                    borderRadius: 6,
                    padding: '8px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  Full Cash Handover ({formatUSD(Number(driver.cash_held_usd))})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShiftCloseMode('net')
                    const net = Math.max(0, Number(driver.cash_held_usd) - Number(driver.pay_owed_usd))
                    setShiftHandoverUsd(String(net))
                  }}
                  style={{
                    background: shiftCloseMode === 'net' ? '#059669' : 'var(--bg)',
                    color: shiftCloseMode === 'net' ? '#fff' : 'var(--text)',
                    border: '1px solid ' + (shiftCloseMode === 'net' ? '#059669' : 'var(--line)'),
                    borderRadius: 6,
                    padding: '8px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  Net Handover (Deduct Pay)
                </button>
              </div>
              <small style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4, display: 'block' }}>
                {shiftCloseMode === 'full'
                  ? 'Driver hands in 100% of collected COD cash. Driver pay remains in their ledger balance.'
                  : `Driver keeps their earned commission ($${Number(driver.pay_owed_usd).toFixed(2)}) and hands in the net balance ($${Math.max(0, Number(driver.cash_held_usd) - Number(driver.pay_owed_usd)).toFixed(2)}). Both are settled.`}
              </small>
            </div>

            <div className="form-grid">
              <div className="field">
                <label>Physical USD Cash Handed to Cashier ($)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={shiftHandoverUsd}
                  onChange={e => setShiftHandoverUsd(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label>Optional LBP Cash Handed In (L.L.)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0"
                  value={shiftHandoverLbp}
                  onChange={e => setShiftHandoverLbp(e.target.value)}
                />
              </div>

              <div className="field full">
                <label>Shift Handover Notes / Memo</label>
                <input
                  type="text"
                  value={shiftNotes}
                  onChange={e => setShiftNotes(e.target.value)}
                  placeholder="e.g. Evening shift closed, cash verified in pouch"
                />
              </div>
            </div>
          </div>

          {shiftCloseError && <p className="error-msg" style={{ marginTop: 12 }}>{shiftCloseError}</p>}

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setIsShiftCloseModalOpen(false)}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={closingShift}
              style={{ background: '#059669', borderColor: '#047857' }}
            >
              {closingShift ? 'Closing Shift…' : '✓ Confirm & Print Handover Slip'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── MODAL: EDIT DRIVER PROFILE ─── */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Driver Profile">
        <form onSubmit={handleSaveEdit}>
          <div className="form-grid">
            <div className="field full">
              <label>Driver Full Name</label>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="field full">
              <label>Phone Number (WhatsApp)</label>
              <input
                type="tel"
                placeholder="+961 3 987654"
                value={editPhone}
                onChange={e => setEditPhone(e.target.value)}
              />
            </div>

            <div className="field full">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={editActive}
                  onChange={e => setEditActive(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Active Driver (available for order dispatch)</span>
              </label>
            </div>
          </div>

          {editError && <p className="error-msg" style={{ marginTop: 12 }}>{editError}</p>}

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={savingEdit}>
              {savingEdit ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  )
}
