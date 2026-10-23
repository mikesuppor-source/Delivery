'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { UserRole } from '@/lib/roles'
import { hasMinRole } from '@/lib/roles'

interface SidebarProps {
  workspaceId: string
  workspaceName: string
  userRole: UserRole
  userEmail: string
  displayName: string
}

export function Sidebar({ workspaceId, workspaceName, userRole, userEmail, displayName }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

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
      <div className="brand">
        <div className="brand-icon">
          <img src="/logo.png" alt="Cedar Logo" />
        </div>
        <div>
          <b>cedar</b>
          <small>DELIVERY DESK</small>
        </div>
      </div>

      <div className="workspace-label">Workspace</div>

      <nav>
        {/* Overview — all roles */}
        <Link href="/" className={isActive('/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
          <b>Overview</b>
        </Link>

        {/* Orders — all roles */}
        <Link href="/orders" className={isActive('/orders')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          </svg>
          <b>Orders</b>
        </Link>

        {/* Shops — not driver */}
        {hasMinRole(userRole, 'readonly') && userRole !== 'driver' && (
          <Link href="/shops" className={isActive('/shops')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <b>Shops</b>
          </Link>
        )}

        {/* Drivers — not driver */}
        {userRole !== 'driver' && (
          <Link href="/drivers" className={isActive('/drivers')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
              <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
            </svg>
            <b>Drivers</b>
          </Link>
        )}

        {/* Areas — owner/manager */}
        {hasMinRole(userRole, 'manager') && (
          <Link href="/areas" className={isActive('/areas')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            <b>Delivery areas</b>
          </Link>
        )}

        {/* Statements — owner/manager */}
        {hasMinRole(userRole, 'manager') && (
          <Link href="/statements" className={isActive('/statements')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
            <b>Statements</b>
          </Link>
        )}

        {/* Settings — owner/manager */}
        {hasMinRole(userRole, 'manager') && (
          <Link href="/settings" className={isActive('/settings')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            <b>Settings</b>
          </Link>
        )}

        {/* Admin — owner only */}
        {userRole === 'owner' && (
          <Link href="/admin" className={isActive('/admin')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <b>Admin</b>
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
        <button className="signout-btn" onClick={signOut}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  )
}
