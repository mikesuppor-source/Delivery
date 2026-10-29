'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useDriverProfile } from '../context'
import { formatUSD } from '@/lib/utils'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { getWhatsAppUrl } from '@/lib/whatsapp'

export function HeaderSection() {
  const {
    driver,
    workspace,
    canManage,
    openSettlement,
    openShiftCloseModal,
    setEditName,
    setEditPhone,
    setEditActive,
    setEditError,
    setIsEditModalOpen,
  } = useDriverProfile()

  // Only the browser knows the site address. Reading window while rendering made the server and the browser
  // disagree, and React keeps the server's version, so the WhatsApp message went out with a link that had no address.
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/drivers"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--brand)',
            textDecoration: 'none',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Drivers Directory
        </Link>
      </div>

      {/* Driver Identity Card & Quick Actions */}
      <div
        className="panel"
        style={{
          padding: '24px 28px',
          marginBottom: 24,
          background: 'linear-gradient(135deg, var(--surface) 0%, rgba(20, 83, 45, 0.04) 100%)',
          borderColor: 'var(--line)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: 'var(--brand)',
                color: '#fff',
                fontSize: 22,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(20, 83, 45, 0.25)',
                position: 'relative',
                flexShrink: 0,
              }}
            >
              {driver.name
                .split(' ')
                .map(n => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase() || 'D'}
              <span
                style={{
                  position: 'absolute',
                  bottom: 2,
                  right: 2,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: driver.active ? '#10b981' : '#9ca3af',
                  border: '2px solid var(--surface)',
                }}
                title={driver.active ? 'Active Courier' : 'Inactive Courier'}
              />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>
                  {driver.name}
                </h1>
                <span className={`badge ${driver.active ? 'badge-delivered' : 'badge-returned'}`}>
                  {driver.active ? 'Active Courier' : 'Inactive'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                {driver.phone ? (
                  <a
                    href={getWhatsAppUrl(driver.phone, `Hello ${driver.name}, Cedar Delivery dispatch team contacting you.`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="whatsapp-badge"
                    style={{ fontSize: 13, padding: '4px 10px' }}
                    title="Chat on WhatsApp"
                  >
                    <WhatsAppIcon size={14} />
                    <span>{driver.phone}</span>
                  </a>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>No phone registered</span>
                )}

                <span style={{ color: 'var(--line)' }}>•</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Assigned Workspace: <strong>{workspace.name}</strong>
                </span>

                {driver.created_at && (
                  <>
                    <span style={{ color: 'var(--line)' }}>•</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      Joined {new Date(driver.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Link
              href={`/driver/${driver.id}`}
              target="_blank"
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title="Open driver's mobile daily run sheet"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
              Mobile Run Sheet
            </Link>

            {driver.phone && (
              <a
                href={getWhatsAppUrl(
                  driver.phone,
                  `Marhaba ${driver.name}, here is your active Cedar Delivery Daily Run Sheet:\n\n${origin}/driver/${driver.id}\n\nPlease update order statuses live as you deliver.`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#10b981',
                  borderColor: '#10b981',
                  color: '#fff',
                }}
                title="Send daily run sheet link to driver via WhatsApp"
              >
                <WhatsAppIcon size={15} />
                Send Run Sheet
              </a>
            )}

            {canManage && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => openSettlement('driver_cash_remittance')}
                  title="Record COD cash handed over by this driver"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                  Remit Cash ({formatUSD(Number(driver.cash_held_usd))})
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => openSettlement('driver_pay')}
                  title="Pay out driver delivery commissions"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="6" x2="12" y2="12" />
                    <line x1="12" y1="12" x2="16" y2="14" />
                  </svg>
                  Pay Courier ({formatUSD(Number(driver.pay_owed_usd))})
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={openShiftCloseModal}
                  title="Close today's shift, record COD cash hand-in, and print handover voucher"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#059669', borderColor: '#047857' }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                  <span>Close Shift & Settle</span>
                </button>

                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setEditName(driver.name)
                    setEditPhone(driver.phone || '')
                    setEditActive(driver.active)
                    setEditError('')
                    setIsEditModalOpen(true)
                  }}
                  title="Edit driver profile information"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit Profile
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
