'use client'

import React from 'react'
import { formatDate } from '@/lib/utils'

interface DeliveryPodViewModalProps {
  order: {
    id: string
    code: string
    tracking_token?: string
    recipient_name: string | null
    delivered_at?: string | null
    pod_signature?: string | null
    pod_photo?: string | null
    pod_collected_lbp?: number | null
  }
  onClose: () => void
}

export function DeliveryPodViewModal({ order, onClose }: DeliveryPodViewModalProps) {
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
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: 16,
          padding: 20,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 10px 40px rgba(0,0,0,0.8)',
          color: '#f8fafc',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#10b981', fontFamily: 'monospace' }}>
              #{order.code}
            </span>
            <h3 style={{ fontSize: 17, fontWeight: 800, margin: '2px 0 0', color: '#ffffff' }}>
              Digital Proof of Delivery
            </h3>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              Delivered: {order.delivered_at ? formatDate(order.delivered_at) : 'Completed'}
            </div>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Customer Signature */}
          {order.pod_signature ? (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8', marginBottom: 6 }}>
                Customer Touch Signature
              </div>
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: 10,
                  padding: 10,
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src={'/api/orders/'+order.id+'/pod?kind=signature'}
                  alt="Customer Signature"
                  style={{ maxHeight: 120, width: 'auto', display: 'block' }}
                />
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
              No digital signature recorded.
            </div>
          )}

          {/* Photo Snapshot */}
          {order.pod_photo && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8', marginBottom: 6 }}>
                Handover / Doorstep Photo
              </div>
              <div
                style={{
                  borderRadius: 10,
                  overflow: 'hidden',
                  border: '1px solid #334155',
                }}
              >
                <img
                  src={'/api/orders/'+order.id+'/pod?kind=photo'}
                  alt="Handover Snapshot"
                  style={{ width: '100%', maxHeight: 280, objectFit: 'contain', display: 'block', background: '#020617' }}
                />
              </div>
            </div>
          )}

          {/* LBP Collection Note if any */}
          {order.pod_collected_lbp ? (
            <div style={{ background: '#1e293b', padding: '8px 12px', borderRadius: 8, fontSize: 12, color: '#cbd5e1' }}>
              Lebanese Pounds Paid: <strong>{Number(order.pod_collected_lbp).toLocaleString()} LBP</strong>
            </div>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#334155',
              color: '#ffffff',
              border: 'none',
              padding: '10px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              marginTop: 4,
            }}
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  )
}
