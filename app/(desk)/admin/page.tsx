import { allRows } from '@/lib/pagination'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { InviteForm } from './invite-form'
import { MemberList } from './member-list'
import { AuditLogTable } from './audit-log-table'
import { formatDate } from '@/lib/utils'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: memberData } = await supabase
    .from('workspace_members')
    .select('*')
    .eq('user_id', user?.id ?? '')
    .order('created_at').limit(1).single()

  const member = memberData as { workspace_id: string; role: string } | null
  if (!member) return null

  const { data: wsData } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', member.workspace_id)
    .single()

  const workspace = wsData as { id: string; name: string } | null
  if (!workspace) return null

  // Owner-only page
  await requireRole(workspace.id, 'owner')

  const [membersResult, invitesResult, auditResult] = await Promise.all([
    allRows(supabase
      .from('workspace_members')
      .select('id, role, display_name, joined_at, user_id')
      .eq('workspace_id', workspace.id)
      .order('created_at')),

    allRows(supabase
      .from('invitations')
      .select('id, email, role, expires_at, created_at')
      .eq('workspace_id', workspace.id)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })),

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
        members={(membersResult.data as any) ?? []}
        currentUserId={user?.id ?? ''}
        workspaceId={workspace.id}
      />

      {/* Invite new staff */}
      <InviteForm
        workspaceId={workspace.id}
        pendingInvites={(invitesResult.data as any) ?? []}
      />

      {/* Audit log */}
      <AuditLogTable entries={(auditResult.data as any) ?? []} />
    </div>
  )
}
