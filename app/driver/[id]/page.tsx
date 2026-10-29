import { allRows } from '@/lib/pagination'
import { notFound, redirect } from 'next/navigation'
import { ApiError } from '@/lib/api'
import { driverAccess } from '@/lib/access'
import { DriverRunSheetClient } from './driver-run-sheet-client'
import type { Metadata } from 'next'

interface DriverRunSheetPageProps {
  params: Promise<{ id: string }>
}

export const metadata: Metadata = {
  title: 'Courier Run Sheet | Cedar Delivery',
  description: 'Real-time mobile delivery manifest and navigation for Cedar couriers.',
}

export const dynamic = 'force-dynamic'

export default async function DriverRunSheetPage({ params }: DriverRunSheetPageProps) {
  const { id } = await params

  // 1. Only the signed-in courier (or their dispatch managers) can open this run sheet
  let access: Awaited<ReturnType<typeof driverAccess>>
  try {
    access = await driverAccess(id)
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect('/driver')
    notFound()
  }
  const { db: supabase } = access
  const { workspace_id, name, phone, cash_held_usd, pay_owed_usd, active } = access.driver
  const driver = { id: access.driver.id, workspace_id, name, phone, cash_held_usd, pay_owed_usd, active }

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

  // 4. Fetch pickups assigned to this driver
  const { data: rawPickups } = await supabase
    .from('pickups')
    .select(`
      *,
      shop:shop_id(id, name, phone, address),
      driver:driver_id(id, name, phone)
    `)
    .eq('driver_id', id)
    .order('requested_at', { ascending: false })

  const initialPickups = (rawPickups as any[]) || []

  return (
    <DriverRunSheetClient
      driver={driver}
      initialOrders={orders}
      initialPickups={initialPickups}
      rate={rate}
      workspaceName={workspaceName}
    />
  )
}
