import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/sidebar'
import { Topbar } from '@/components/topbar'

export default async function DeskLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Get user's workspace membership
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, display_name, workspace:workspace_id(id, name, usd_to_lbp)')
    .eq('user_id', user.id)
    .order('created_at')
    .limit(1)
    .single()

  if (!membership) {
    redirect('/onboarding')
  }

  const workspace = membership.workspace as { id: string; name: string; usd_to_lbp: number }

  return (
    <div className="shell">
      <Sidebar
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        userRole={membership.role}
        userEmail={user.email ?? ''}
        displayName={membership.display_name ?? user.email ?? ''}
      />
      <main>
        <Topbar
          usdToLbp={workspace.usd_to_lbp}
          workspaceId={workspace.id}
        />
        {children}
      </main>
    </div>
  )
}
