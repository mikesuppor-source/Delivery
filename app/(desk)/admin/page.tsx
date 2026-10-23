import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { InviteForm } from './invite-form'
import { MemberList } from './member-list'
import { AuditLogTable } from './audit-log-table'
import { formatDate } from '@/lib/utils'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, workspace:workspace_id(id, name)')
    .eq('user_id', user?.id ?? '')
    .single()

  if (!membership) return null
  const workspace = membership.workspace as { id: string; name: string }

  // Owner-only page
  await requireRole(workspace.id, 'owner')

  const [membersResult, invitesResult, auditResult] = await Promise.all([
    supabase
      .from('workspace_members')
      .select('id, role, display_name, joined_at, user_id')
      .eq('workspace_id', workspace.id)
      .order('created_at'),

    supabase
      .from('invitations')
      .select('id, email, role, expires_at, created_at')
      .eq('workspace_id', workspace.id)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),

    supabase
      .from('audit_log')
      .select('id, action, actor_email, entity_type, diff, created_at')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  return (
    <div className="content">
      <div className="page-heading">
        <div>
          <h1>Admin panel</h1>
          <p>Your delivery operation, connected.</p>
        </div>
      </div>

      <div className="admin-banner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <polyline points="9 12 11 14 15 10"/>
        </svg>
        <div>
          <h2>Owner administration</h2>
          <p>Manage people, protect records, and review changes.</p>
          <p style={{ marginTop: 6, fontSize: 12 }}>
            Owner: <strong>{user?.email}</strong> · Your owner account controls staff access.
          </p>
        </div>
      </div>

      {/* Staff management */}
      <MemberList
        members={membersResult.data ?? []}
        currentUserId={user?.id ?? ''}
        workspaceId={workspace.id}
      />

      {/* Invite new staff */}
      <InviteForm
        workspaceId={workspace.id}
        pendingInvites={invitesResult.data ?? []}
      />

      {/* Audit log */}
      <AuditLogTable entries={auditResult.data ?? []} />
    </div>
  )
}
