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

  const { data: merchantShop } = await supabase.from('shops').select('id').eq('user_id', user.id).limit(1).maybeSingle()
  if (merchantShop) redirect('/portal')

  // Get user's workspace membership
  const { data: memberData } = await supabase
    .from('workspace_members')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at')
    .limit(1)
    .single()

  const member = memberData as { workspace_id: string; role: any; display_name: string | null } | null
  if (!member) {
    redirect('/onboarding')
  }

  // If user is a merchant store partner, direct them directly to their Merchant Portal
  const { data: shop } = await supabase
    .from('shops')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (shop && member.role === 'readonly') {
    redirect('/portal')
  }

  const { data: wsData } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', member.workspace_id)
    .single()

  const workspace = wsData as { id: string; name: string; usd_to_lbp: number } | null
  if (!workspace) {
    redirect('/onboarding')
  }

  return (
    <div className="shell">
      <Sidebar
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        userRole={member.role}
        userEmail={user.email ?? ''}
        displayName={member.display_name ?? user.email ?? ''}
      />
      <main>
        <Topbar
          usdToLbp={Number(workspace.usd_to_lbp)}
          workspaceId={workspace.id}
          userRole={member.role}
        />
        {children}
      </main>
    </div>
  )
}
