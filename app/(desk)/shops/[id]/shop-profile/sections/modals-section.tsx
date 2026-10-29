'use client'

import React from 'react'
import { Modal } from '@/components/modal'
import { useShopProfile } from '../context'
import { formatUSD, formatLBP, usdToLbp } from '@/lib/utils'
import { ShopifyIntegrationModal } from '@/components/shopify-integration-modal'

export function ModalsSection() {
  const {
    shop,
    workspace,
    isPayoutModalOpen,
    setIsPayoutModalOpen,
    settlementDirection,
    setSettlementDirection,
    payoutAmount,
    setPayoutAmount,
    payoutNote,
    setPayoutNote,
    paying,
    payoutError,
    handleRecordPayout,
    currentBalanceUSD,
    currentBalanceLBP,
    isEditModalOpen,
    setIsEditModalOpen,
    editName,
    setEditName,
    editPhone,
    setEditPhone,
    editAddress,
    setEditAddress,
    editActive,
    setEditActive,
    savingEdit,
    editError,
    handleSaveEdit,
    isShopifyModalOpen,
    setIsShopifyModalOpen,
  } = useShopProfile()

  return (
    <>
      {/* ─── MODAL: RECORD TWO-WAY SHOP SETTLEMENT ─── */}
      <Modal
        isOpen={isPayoutModalOpen}
        onClose={() => setIsPayoutModalOpen(false)}
        title={settlementDirection === 'collection_from_shop' ? `Collect Cash from ${shop.name}` : `Record Payout to ${shop.name}`}
      >
        <form onSubmit={handleRecordPayout}>
          <div style={{ marginBottom: 16 }}>
            {/* Direction Selector */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => {
                  setSettlementDirection('payout_to_shop')
                  setPayoutNote(`Delivery proceeds payout to ${shop.name}`)
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1.5px solid',
                  cursor: 'pointer',
                  textAlign: 'left',
                  background: settlementDirection === 'payout_to_shop' ? 'rgba(20, 83, 45, 0.08)' : 'var(--bg)',
                  borderColor: settlementDirection === 'payout_to_shop' ? 'var(--brand)' : 'var(--line)',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: settlementDirection === 'payout_to_shop' ? 'var(--brand)' : 'var(--text)' }}>
                  Pay Merchant (Desk → Shop)
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  We give cash to store (clears positive balance)
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSettlementDirection('collection_from_shop')
                  setPayoutNote(`Delivery fee / debt collection from ${shop.name}`)
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1.5px solid',
                  cursor: 'pointer',
                  textAlign: 'left',
                  background: settlementDirection === 'collection_from_shop' ? 'rgba(2, 132, 199, 0.08)' : 'var(--bg)',
                  borderColor: settlementDirection === 'collection_from_shop' ? '#0284c7' : 'var(--line)',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: settlementDirection === 'collection_from_shop' ? '#0284c7' : 'var(--text)' }}>
                  Collect from Merchant (Shop → Desk)
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  Store pays cash to company (settles negative debt)
                </div>
              </button>
            </div>

            <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', marginBottom: 16 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>
                {currentBalanceUSD > 0
                  ? 'Current Amount We Owe Shop'
                  : currentBalanceUSD < 0
                  ? 'Current Amount Shop Owes Us'
                  : 'Current Ledger Balance'}
              </span>
              <strong style={{ display: 'block', fontSize: 20, marginTop: 4, color: currentBalanceUSD >= 0 ? 'var(--brand)' : '#0284c7' }}>
                {formatUSD(currentBalanceUSD)}
              </strong>
              <small style={{ color: 'var(--muted)', fontSize: 11 }}>
                ≈ {formatLBP(currentBalanceLBP)} (at {workspace.usd_to_lbp.toLocaleString()} LBP/USD)
              </small>
            </div>
          </div>

          <div className="form-grid">
            <div className="field full">
              <label>
                {settlementDirection === 'collection_from_shop' ? 'Collection Amount (USD)' : 'Payout Amount (USD)'}
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={payoutAmount}
                onChange={e => setPayoutAmount(e.target.value)}
                required
                autoFocus
              />
              {payoutAmount && !isNaN(parseFloat(payoutAmount)) && (
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <small style={{ color: 'var(--muted)' }}>
                    ≈ {formatLBP(usdToLbp(parseFloat(payoutAmount), workspace.usd_to_lbp))}
                  </small>
                  <small style={{ fontWeight: 600, color: 'var(--brand)' }}>
                    Projected Balance After:{' '}
                    {formatUSD(
                      settlementDirection === 'collection_from_shop'
                        ? currentBalanceUSD + parseFloat(payoutAmount)
                        : currentBalanceUSD - parseFloat(payoutAmount),
                    )}
                  </small>
                </div>
              )}
            </div>

            <div className="field full">
              <label>Reference Note (Optional)</label>
              <input
                type="text"
                placeholder={
                  settlementDirection === 'collection_from_shop'
                    ? 'e.g. Received cash for weekly delivery fees, receipt #104'
                    : 'e.g. Cash batch handed to store owner, receipt #104'
                }
                value={payoutNote}
                onChange={e => setPayoutNote(e.target.value)}
              />
            </div>
          </div>

          {payoutError && <p className="error-msg" style={{ marginTop: 12 }}>{payoutError}</p>}

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setIsPayoutModalOpen(false)}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={paying}
              style={{
                background: settlementDirection === 'collection_from_shop' ? '#0284c7' : 'var(--brand)',
                borderColor: settlementDirection === 'collection_from_shop' ? '#0284c7' : 'var(--brand)',
              }}
            >
              {paying
                ? 'Recording…'
                : settlementDirection === 'collection_from_shop'
                ? 'Confirm Cash Collection'
                : 'Confirm Cash Payout'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── MODAL: EDIT SHOP DETAILS ─── */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Partner Store">
        <form onSubmit={handleSaveEdit}>
          <div className="form-grid">
            <div className="field full">
              <label>Store / Merchant Name</label>
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
                placeholder="+961 1 234567"
                value={editPhone}
                onChange={e => setEditPhone(e.target.value)}
              />
            </div>

            <div className="field full">
              <label>Store Address / Pickup Location</label>
              <input
                type="text"
                placeholder="Street, City, Building"
                value={editAddress}
                onChange={e => setEditAddress(e.target.value)}
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
                <span style={{ fontSize: 13, fontWeight: 600 }}>Active Partner Store (available for new orders)</span>
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

      {/* ─── SHOPIFY INTEGRATION MODAL ─── */}
      <ShopifyIntegrationModal
        isOpen={isShopifyModalOpen}
        onClose={() => setIsShopifyModalOpen(false)}
        shop={shop}
        onOrderCreated={() => {
          window.location.reload()
        }}
      />
    </>
  )
}
