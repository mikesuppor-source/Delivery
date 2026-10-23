import { redirect } from 'next/navigation'
import { createClient } from './supabase/server'
import type { UserRole } from './supabase/database.types'

export type { UserRole }

const ROLE_HIERARCHY: UserRole[] = ['readonly', 'driver', 'manager', 'owner']

export function roleLevel(role: UserRole): number {
  return ROLE_HIERARCHY.indexOf(role)
}

export function hasMinRole(userRole: UserRole, minRole: UserRole | UserRole[]): boolean {
  const allowed = Array.isArray(minRole) ? minRole : [minRole]
  const userLevel = roleLevel(userRole)
  const minLevel = Math.min(...allowed.map(r => roleLevel(r)))
  return userLevel >= minLevel
}

/** Get the currently authenticated user */
export async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/** Get the member record for the current user in a workspace */
export async function getMember(workspaceId: string) {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) return null

  const { data } = await supabase
    .from('workspace_members')
    .select('id, role, display_name, joined_at')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!data) return null
  return { ...data, userId: user.id, email: user.email ?? '' }
}

/**
 * Enforce role requirement in a Server Component or Route Handler.
 * Redirects to /login if not authenticated, or / if insufficient role.
 */
export async function requireRole(
  workspaceId: string,
  minRole: UserRole | UserRole[]
) {
  const member = await getMember(workspaceId)
  if (!member) redirect('/login')
  if (!hasMinRole(member.role as UserRole, minRole)) redirect('/')
  return member
}

/** Write an audit log entry using the service role (bypasses RLS) */
export async function writeAuditLog({
  workspaceId,
  actorId,
  actorEmail,
  action,
  entityType,
  entityId,
  diff,
}: {
  workspaceId: string
  actorId: string
  actorEmail: string
  action: string
  entityType?: string
  entityId?: string
  diff?: object
}) {
  const { createServiceClient } = await import('./supabase/server')
  const serviceClient = createServiceClient()
  await serviceClient.from('audit_log').insert({
    workspace_id: workspaceId,
    actor_id: actorId,
    actor_email: actorEmail,
    action,
    entity_type: entityType,
    entity_id: entityId,
    diff: diff ?? null,
  })
}
