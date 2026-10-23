import type { Database } from './supabase/database.types'

export type UserRole = Database['public']['Enums']['user_role']
export type OrderStatus = Database['public']['Enums']['order_status']

export const ROLE_HIERARCHY: UserRole[] = ['readonly', 'driver', 'manager', 'owner']

export function roleLevel(role: UserRole): number {
  return ROLE_HIERARCHY.indexOf(role)
}

/** Check if userRole meets or exceeds the required minRole */
export function hasMinRole(userRole: UserRole, minRole: UserRole | UserRole[]): boolean {
  const allowed = Array.isArray(minRole) ? minRole : [minRole]
  const userLevel = roleLevel(userRole)
  const minLevel = Math.min(...allowed.map(r => roleLevel(r)))
  return userLevel >= minLevel
}
