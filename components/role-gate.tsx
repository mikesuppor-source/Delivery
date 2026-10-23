'use client'

import type { UserRole } from '@/lib/auth'
import { hasMinRole } from '@/lib/auth'

interface RoleGateProps {
  userRole: UserRole
  minRole: UserRole | UserRole[]
  children: React.ReactNode
  fallback?: React.ReactNode
}

/** Renders children only if userRole meets the minimum required role */
export function RoleGate({ userRole, minRole, children, fallback = null }: RoleGateProps) {
  if (!hasMinRole(userRole, minRole)) return <>{fallback}</>
  return <>{children}</>
}
