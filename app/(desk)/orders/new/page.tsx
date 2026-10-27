import { allRows } from '@/lib/pagination'
import { createClient } from '@/lib/supabase/server'
import { NewOrderClient } from './new-order-client'
import { redirect } from 'next/navigation'
import type { UserRole } from '@/lib/auth'

export const metadata = {
  title: 'New Order — Cedar Delivery Desk',
}

export default async function NewOrderPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: memberData } = await supabase
    .from('workspace_members')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at')
    .limit(1)
    .single()

  const member = memberData as { workspace_id: string; role: any } | null
  if (!member) {
    redirect('/onboarding')
  }

  const { data: wsData } = await supabase
    .from('workspaces')
    .select('id, name, usd_to_lbp, default_driver_pay_usd, default_delivery_fee_usd')
    .eq('id', member.workspace_id)
    .single()

  const workspace = wsData as {
    id: string
    name: string
    usd_to_lbp: number
    default_driver_pay_usd?: number | null
    default_delivery_fee_usd?: number | null
  } | null
  if (!workspace) {
    redirect('/onboarding')
  }

  // Parallel fetches for active shops, active drivers, and active delivery areas
  const [shopsRes, driversRes, areasRes] = await Promise.all([
    allRows(
      supabase
        .from('shops')
        .select('id, name, phone')
        .eq('workspace_id', workspace.id)
        .eq('active', true)
        .order('name')
    ),
    allRows(
      supabase
        .from('drivers')
        .select('id, name, phone')
        .eq('workspace_id', workspace.id)
        .eq('active', true)
        .order('name')
    ),
    allRows(
      supabase
        .from('delivery_areas')
        .select('id, name, fee_usd')
        .eq('workspace_id', workspace.id)
        .eq('active', true)
        .order('name')
    ),
  ])

  return (
    <div className="content">
      <NewOrderClient
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        shops={(shopsRes.data as any) || []}
        drivers={(driversRes.data as any) || []}
        areas={(areasRes.data as any) || []}
        userRole={member.role as UserRole}
        rate={Number(workspace.usd_to_lbp) || 89500}
        defaultDriverPayUsd={workspace.default_driver_pay_usd}
        defaultDeliveryFeeUsd={workspace.default_delivery_fee_usd}
      />
    </div>
  )
}
