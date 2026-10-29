'use client'

import React from 'react'
import { Modal } from '@/components/modal'
import { usePortal } from '../context'
import { formatUSD, formatLBP } from '@/lib/utils'

export function CashoutModal() {
  const {
    isCashoutModalOpen,
    setIsCashoutModalOpen,
    cashoutAvailableUsd,
    cashoutAvailableLbp,
    cashoutSuccess,
    cashoutError,
    cashoutAmountUsd,
    setCashoutAmountUsd,
    cashoutMethod,
    setCashoutMethod,
    cashoutAccountDetails,
    setCashoutAccountDetails,
    cashoutNotes,
    setCashoutNotes,
    cashoutSubmitting,
    handleRequestCashout,
    cashoutHistory,
  } = usePortal()

  if (!isCashoutModalOpen) return null

  return (
    <Modal
      isOpen={isCashoutModalOpen}
      onClose={() => setIsCashoutModalOpen(false)}
      title="Request Payout / Cash-Out"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Available Balance Header */}
        <div
          style={{
            background: 'rgba(4, 120, 87, 0.08)',
            border: '1.5px solid #047857',
            borderRadius: 10,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#047857', textTransform: 'uppercase' }}>
              Available Cash for Payout
            </span>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#047857', marginTop: 2 }}>
              {formatUSD(cashoutAvailableUsd)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>Equivalent in L.L.</span>
            <strong style={{ fontSize: 16, color: 'var(--text)' }}>
              {formatLBP(cashoutAvailableLbp)}
            </strong>
          </div>
        </div>

        {cashoutSuccess && (
          <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', padding: '10px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600 }}>
            ✓ {cashoutSuccess}
          </div>
        )}

        {cashoutError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '10px 14px', borderRadius: 8, fontSize: 12.5 }}>
            {cashoutError}
          </div>
        )}

        <form onSubmit={handleRequestCashout} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
              Withdrawal Amount (USD) *
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="number"
                step="any"
                min="1"
                max={cashoutAvailableUsd}
                value={cashoutAmountUsd}
                onChange={e => setCashoutAmountUsd(e.target.value)}
                placeholder="Enter amount to withdraw"
                required
                style={{ flex: 1, fontSize: 14, fontWeight: 700 }}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setCashoutAmountUsd(String(cashoutAvailableUsd))}
                style={{ fontSize: 11, padding: '0 12px' }}
              >
                Max All
              </button>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
              Payout Transfer Method *
            </label>
            <select
              value={cashoutMethod}
              onChange={e => setCashoutMethod(e.target.value as any)}
              style={{ width: '100%', fontSize: 13 }}
            >
              <option value="whish">Whish Money (Instant App Transfer)</option>
              <option value="omt">OMT (Cash Collection Point across Lebanon)</option>
              <option value="cash_office">Cash Pickup at Dispatch Desk / Office</option>
              <option value="bank_transfer">Bank Transfer (Direct Lebanese IBAN)</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
              Account Details / Recipient Phone *
            </label>
            <input
              type="text"
              value={cashoutAccountDetails}
              onChange={e => setCashoutAccountDetails(e.target.value)}
              placeholder="e.g. Whish Phone 70-123456 or Full Name as on Lebanese ID for OMT"
              required
              style={{ fontSize: 13 }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
              Notes (Optional)
            </label>
            <input
              type="text"
              value={cashoutNotes}
              onChange={e => setCashoutNotes(e.target.value)}
              placeholder="Any special remarks or branch preference"
              style={{ fontSize: 13 }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIsCashoutModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={cashoutSubmitting || cashoutAvailableUsd <= 0}
              className="btn btn-primary"
            >
              {cashoutSubmitting ? 'Submitting…' : 'Submit Cash-Out Request'}
            </button>
          </div>
        </form>

        {/* Payout History */}
        {cashoutHistory.length > 0 && (
          <div style={{ marginTop: 12, borderTop: '1.5px solid var(--line)', paddingTop: 14 }}>
            <h4 style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>
              Recent Payout Requests
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
              {cashoutHistory.map(req => (
                <div
                  key={req.id}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--bg)',
                    border: '1px solid var(--line)',
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 12,
                  }}
                >
                  <div>
                    <strong>{formatUSD(Number(req.amount_usd))}</strong>
                    <span style={{ color: 'var(--muted)', marginLeft: 6 }}>via {req.method.toUpperCase()}</span>
                    <small style={{ display: 'block', color: 'var(--muted)', fontSize: 10.5 }}>
                      {new Date(req.created_at).toLocaleDateString()} · {req.account_details}
                    </small>
                  </div>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      padding: '2px 8px',
                      borderRadius: 99,
                      background:
                        req.status === 'paid'
                          ? '#dcfce7'
                          : req.status === 'approved'
                          ? '#dbeafe'
                          : req.status === 'rejected'
                          ? '#fee2e2'
                          : '#fef3c7',
                      color:
                        req.status === 'paid'
                          ? '#15803d'
                          : req.status === 'approved'
                          ? '#1d4ed8'
                          : req.status === 'rejected'
                          ? '#b91c1c'
                          : '#b45309',
                    }}
                  >
                    {req.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
