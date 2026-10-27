import { allRows } from '@/lib/pagination'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { DriverRunSheetClient } from './driver-run-sheet-client'
import type { Metadata } from 'next'

interface DriverRunSheetPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: DriverRunSheetPageProps): Promise<Metadata> {
  const { id } = await params
  const supabase = createServiceClient()
  const { data: driver } = await supabase
    .from('drivers')
    .select('name')
    .eq('id', id)
    .maybeSingle()

  return {
    title: driver?.name ? `Driver Run Sheet — ${driver.name} | Cedar Delivery` : 'Courier Run Sheet',
    description: 'Real-time mobile delivery manifest and navigation for Cedar couriers.',
  }
}

export const dynamic = 'force-dynamic'

export default async function DriverRunSheetPage({ params }: DriverRunSheetPageProps) {
  const { id } = await params
  const supabase = createServiceClient()

  // 1. Fetch driver details
  const { data: driver, error: driverErr } = await supabase
    .from('drivers')
    .select('id, workspace_id, name, phone, cash_held_usd, pay_owed_usd, active')
    .eq('id', id)
    .maybeSingle()

  if (driverErr || !driver) {
    notFound()
  }

  // 2. Fetch workspace info
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name, usd_to_lbp')
    .eq('id', driver.workspace_id)
    .single()

  const workspaceName = workspace?.name || 'Cedar Delivery'
  const rate = Number(workspace?.usd_to_lbp) || 89500

  // 3. Fetch all orders assigned to this driver
  const { data: rawOrders } = await allRows(supabase
    .from('orders')
    .select(`
      *,
      shop:shop_id(id, name, phone),
      area:area_id(id, name)
    `)
    .eq('driver_id', id)
    .order('created_at', { ascending: false }))

  const orders = ((rawOrders as any[]) || []).map(o => ({...o, recipient_address: o.location_lat != null && o.location_lng != null ? (o.recipient_address || '') + ' (https://maps.google.com/?q=' + o.location_lat + ',' + o.location_lng + ')' : o.recipient_address}))

  return (
    <DriverRunSheetClient
      driver={driver}
      initialOrders={orders}
      rate={rate}
      workspaceName={workspaceName}
    />
  )
}
