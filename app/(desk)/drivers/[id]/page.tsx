import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DriverProfileClient } from './driver-profile-client'
import type { UserRole } from '@/lib/roles'

interface DriverProfilePageProps {
  params: Promise<{ id: string }>
}

export default async function DriverProfilePage({ params }: DriverProfilePageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberData } = await supabase
    .from('workspace_members')
    .select('*')
    .eq('user_id', user.id)
    .single()

  const member = memberData as { workspace_id: string; role: any } | null
  if (!member) redirect('/login')

  const { data: wsData } = await supabase
    .from('workspaces')
    .select('id, name, usd_to_lbp')
    .eq('id', member.workspace_id)
    .single()

  const workspace = wsData as { id: string; name: string; usd_to_lbp: number } | null
  if (!workspace) redirect('/login')

  // Parallel fetches for driver, driver's orders, and driver settlements
  const [driverRes, ordersRes, settlementsRes] = await Promise.all([
    supabase
      .from('drivers')
      .select('*')
      .eq('id', id)
      .eq('workspace_id', workspace.id)
      .single(),

    supabase
      .from('orders')
      .select(`
        id, code, status, collection_usd, delivery_fee_usd, driver_pay_usd,
        shop_balance_usd, usd_to_lbp_rate, created_at, recipient_name,
        recipient_phone, recipient_address, notes,
        shop:shop_id(id, name, phone),
        area:area_id(id, name)
      `)
      .eq('workspace_id', workspace.id)
      .eq('driver_id', id)
      .order('created_at', { ascending: false }),

    supabase
      .from('settlements')
      .select('id, type, amount_usd, usd_to_lbp, note, created_at, created_by')
      .eq('workspace_id', workspace.id)
      .eq('driver_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (!driverRes.data) {
    notFound()
  }

  const driver = driverRes.data
  const orders = (ordersRes.data as any[]) || []
  const settlements = (settlementsRes.data as any[]) || []

  return (
    <div className="content">
      <DriverProfileClient
        driver={driver}
        initialOrders={orders}
        initialSettlements={settlements}
        workspace={workspace}
        userRole={member.role as UserRole}
      />
    </div>
  )
}
