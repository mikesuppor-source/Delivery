'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { UserRole } from '@/lib/roles'
import { hasMinRole } from '@/lib/roles'
import { useI18n } from '@/lib/i18n'

interface SidebarProps {
  workspaceId: string
  workspaceName: string
  userRole: UserRole
  userEmail: string
  displayName: string
}

export function Sidebar({ userRole, displayName }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { t } = useI18n()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function isActive(href: string) {
    return pathname === href ? 'active' : ''
  }

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="brand" style={{ marginBottom: 16 }}>
        <div className="brand-icon">
          <img src="/logo.png" alt="Cedar Logo" />
        </div>
        <div>
          <b style={{ color: 'var(--ui-text)' }}>cedar</b>
          <small style={{ color: 'var(--ui-text-muted)', fontSize: 10 }}>DELIVERY DESK</small>
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, overflowY: 'auto' }}>
        {/* Overview — all roles */}
        <Link href="/" className={isActive('/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
          </svg>
          <b>{t('navOverview')}</b>
        </Link>

        {/* Orders — all roles */}
        <Link href="/orders" className={isActive('/orders')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </svg>
          <b>{t('navOrders')}</b>
        </Link>

        {/* Scan Barcodes / QR — all roles */}
        <Link href="/scan" className={isActive('/scan')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
            <line x1="7" y1="12" x2="17" y2="12" />
          </svg>
          <b>{t('navScan')}</b>
        </Link>

        {/* Shops — not driver */}
        {hasMinRole(userRole, 'readonly') && userRole !== 'driver' && (
          <Link href="/shops" className={isActive('/shops')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <b>{t('navShops')}</b>
          </Link>
        )}

        {/* Drivers — not driver */}
        {userRole !== 'driver' && (
          <Link href="/drivers" className={isActive('/drivers')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
              <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
            </svg>
            <b>{t('navDrivers')}</b>
          </Link>
        )}

        
        {/* Live Map — not driver */}
        {userRole !== 'driver' && (
          <Link href="/map" className={isActive('/map')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
              <line x1="8" y1="2" x2="8" y2="18" />
              <line x1="16" y1="6" x2="16" y2="22" />
            </svg>
            <b>Live Map</b>
          </Link>
        )}

        {/* Areas & Tariffs — owner/manager */}
        {hasMinRole(userRole, 'manager') && (
          <Link href="/areas" className={isActive('/areas')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <b>{t('navAreas')}</b>
          </Link>
        )}

        {/* Statements & Payouts — owner/manager */}
        {hasMinRole(userRole, 'manager') && (
          <Link href="/statements" className={isActive('/statements')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            <b>{t('navStatements')}</b>
          </Link>
        )}

        {/* Finance — owner/manager: shop payouts, courier pay and bonuses, expenses */}
        {hasMinRole(userRole, 'manager') && (
          <>
            <Link href="/finance/payouts" className={isActive('/finance/payouts')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" />
                <path d="M6 10v.01M18 14v.01" />
              </svg>
              <b>{t('navPayouts')}</b>
            </Link>
            <Link href="/finance/courier-pay" className={isActive('/finance/courier-pay')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
              </svg>
              <b>{t('navCourierPay')}</b>
            </Link>
            <Link href="/finance/expenses" className={isActive('/finance/expenses')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="9" y1="12" x2="15" y2="12" />
              </svg>
              <b>{t('navExpenses')}</b>
            </Link>
          </>
        )}

        {/* Reports & Profit — owner/manager */}
        {hasMinRole(userRole, 'manager') && (
          <Link href="/reports" className={isActive('/reports')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <b>{t('navReports')}</b>
          </Link>
        )}

        {/* Settings — owner/manager */}
        {hasMinRole(userRole, 'manager') && (
          <Link href="/settings" className={isActive('/settings')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <b>{t('navSettings')}</b>
          </Link>
        )}

        {/* Merchant Portal */}
        <Link href="/portal" className={isActive('/portal')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
          <b>Merchant Portal</b>
        </Link>

        {/* Admin — owner only */}
        {userRole === 'owner' && (
          <Link href="/admin" className={isActive('/admin')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <b>{t('navAdmin')}</b>
          </Link>
        )}
      </nav>

      {/* Bottom user section */}
      <div className="sidebar-bottom">
        <div className="user-info">
          <div className="avatar">{(displayName[0] ?? 'U').toUpperCase()}</div>
          <div className="user-detail">
            <span>{displayName}</span>
            <small>{userRole}</small>
          </div>
        </div>
        <button className="signout-btn" onClick={signOut} title={t('actionSignOut')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>{t('actionSignOut')}</span>
        </button>
      </div>
    </aside>
  )
}
