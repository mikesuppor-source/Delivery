'use client'

import React, { useState } from 'react'
import { WhatsAppIcon } from '@/components/whatsapp-icon'

interface DeliveryFailModalProps {
  order: {
    id: string
    code: string
    recipient_name: string | null
    recipient_phone: string | null
    shop?: { name: string; phone?: string | null } | null
  }
  onClose: () => void
  onConfirm: (data: {
    status: 'failed' | 'returned'
    failureReason: string
    notes?: string
  }) => Promise<void>
}

const PRESET_REASONS = [
  { id: 'no_answer', label: '📞 Customer Not Answering', ar: 'لم يرد على الاتصال' },
  { id: 'postponed', label: '📅 Rescheduled to Tomorrow', ar: 'تأجيل الاستلام إلى الغد' },
  { id: 'refused', label: '🚫 Refused / Canceled by Customer', ar: 'رفض الاستلام أو إلغاء الطلب' },
  { id: 'wrong_address', label: '📍 Wrong Address or Unreachable', ar: 'عنوان خاطئ أو تعذر الوصول' },
  { id: 'no_change', label: '💵 No Change Available ($100 bill)', ar: 'عدم توفر فكة أو صرف' },
]

export function DeliveryFailModal({
  order,
  onClose,
  onConfirm,
}: DeliveryFailModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>(PRESET_REASONS[0].label)
  const [statusType, setStatusType] = useState<'failed' | 'returned'>('failed')
  const [customNote, setCustomNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    try {
      await onConfirm({
        status: statusType,
        failureReason: selectedReason,
        notes: customNote.trim() || undefined,
      })
      onClose()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Error updating failure status')
    } finally {
      setSubmitting(false)
    }
  }

  // Merchant WhatsApp alert
  const merchantPhone = order.shop?.phone?.replace(/\D/g, '')
  const whatsappUrl = merchantPhone
    ? `https://wa.me/${merchantPhone}?text=${encodeURIComponent(
        `Hello ${order.shop?.name || 'Merchant'}, order #${order.code} for ${
          order.recipient_name || 'Customer'
        } could not be delivered: ${selectedReason}. ${customNote ? 'Note: ' + customNote : ''}`
      )}`
    : null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 0,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 540,
          background: '#0f172a',
          border: '1px solid #334155',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: '20px 20px 32px 20px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.7)',
          color: '#f8fafc',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#f87171', fontFamily: 'monospace' }}>
                #{order.code}
              </span>
              <span style={{ fontSize: 11, background: '#7f1d1d', color: '#fca5a5', padding: '1px 8px', borderRadius: 99, fontWeight: 700 }}>
                Delivery Postpone
              </span>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: '4px 0 0', color: '#ffffff' }}>
              Select Reason for Delay / Failure
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              color: '#94a3b8',
              width: 32,
              height: 32,
              borderRadius: '50%',
              fontSize: 16,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Preset Reason Selector Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
              Common Reasons
            </span>

            {PRESET_REASONS.map(r => {
              const isSelected = selectedReason === r.label
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedReason(r.label)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: isSelected ? 'rgba(239, 68, 68, 0.15)' : '#1e293b',
                    border: '1.5px solid ' + (isSelected ? '#ef4444' : '#334155'),
                    color: isSelected ? '#fca5a5' : '#e2e8f0',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{r.label}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{r.ar}</span>
                </button>
              )
            })}
          </div>

          {/* Action Destination: Reschedule (failed) vs Return to Merchant (returned) */}
          <div style={{ background: '#1e293b', borderRadius: 8, padding: 10, border: '1px solid #334155' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
              Action Outcome
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                type="button"
                onClick={() => setStatusType('failed')}
                style={{
                  padding: '8px',
                  borderRadius: 6,
                  border: '1.5px solid ' + (statusType === 'failed' ? '#f59e0b' : '#334155'),
                  background: statusType === 'failed' ? 'rgba(245, 158, 11, 0.15)' : '#0f172a',
                  color: statusType === 'failed' ? '#fbbf24' : '#94a3b8',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                🔄 Keep in Run Sheet (Try Tomorrow)
              </button>

              <button
                type="button"
                onClick={() => setStatusType('returned')}
                style={{
                  padding: '8px',
                  borderRadius: 6,
                  border: '1.5px solid ' + (statusType === 'returned' ? '#ef4444' : '#334155'),
                  background: statusType === 'returned' ? 'rgba(239, 68, 68, 0.15)' : '#0f172a',
                  color: statusType === 'returned' ? '#f87171' : '#94a3b8',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ↩ Return Parcel to Merchant
              </button>
            </div>
          </div>

          {/* Additional details note */}
          <div>
            <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
              Additional Courier Comments (Optional)
            </label>
            <input
              type="text"
              value={customNote}
              onChange={e => setCustomNote(e.target.value)}
              placeholder="e.g. Called twice, phone was switched off"
              style={{
                width: '100%',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 6,
                padding: '8px 10px',
                color: '#ffffff',
                fontSize: 12.5,
              }}
            />
          </div>

          {/* WhatsApp Merchant alert */}
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: '#064e3b',
                color: '#6ee7b7',
                border: '1px solid #059669',
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                textDecoration: 'none',
              }}
            >
              <WhatsAppIcon size={14} color="#6ee7b7" />
              <span>Send Reason to {order.shop?.name || 'Merchant'} on WhatsApp</span>
            </a>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            style={{
              background: '#b91c1c',
              color: '#ffffff',
              border: 'none',
              padding: '12px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 4,
            }}
          >
            {submitting ? 'Updating Order…' : 'Save & Postpone Delivery'}
          </button>
        </form>
      </div>
    </div>
  )
}
