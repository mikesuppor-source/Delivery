import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MapClient, type OrderStop } from './map-client'
import type { DriverMarkerData } from '@/components/leaflet-map'

export const metadata: Metadata = {
  title: 'Live Courier Map — Cedar Delivery Desk',
  description: 'Real-time GPS tracking and route monitoring for active delivery couriers.',
}

export default async function LiveMapPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .order('created_at')
    .limit(1)
    .single()

  if (!member) {
    redirect('/onboarding')
  }

  // Fetch couriers
  const { data: driversData } = await supabase
    .from('drivers')
    .select('id, name, phone, current_lat, current_lng, last_location_at, active')
    .eq('workspace_id', member.workspace_id)
    .eq('active', true)
    .order('name')

  // Fetch active in-flight orders (assigned or out for delivery)
  const { data: ordersData } = await supabase
    .from('orders')
    .select('id, code, status, recipient_name, recipient_address, driver_id, destination_town, location_lat, location_lng, collection_usd')
    .eq('workspace_id', member.workspace_id)
    .in('status', ['assigned', 'picked_up'])
    .order('created_at', { ascending: false })

  const drivers: DriverMarkerData[] = (driversData || []).map(d => ({
    id: d.id,
    name: d.name,
    phone: d.phone,
    vehicle_type: 'moto',
    current_lat: d.current_lat != null ? Number(d.current_lat) : null,
    current_lng: d.current_lng != null ? Number(d.current_lng) : null,
    last_seen_at: d.last_location_at,
  }))

  const orders: OrderStop[] = (ordersData || []).map(o => ({
    id: o.id,
    code: o.code,
    status: o.status,
    recipient_name: o.recipient_name,
    recipient_address: o.recipient_address,
    driver_id: o.driver_id,
    location_lat: o.location_lat != null ? Number(o.location_lat) : null,
    location_lng: o.location_lng != null ? Number(o.location_lng) : null,
    collection_usd: o.collection_usd != null ? Number(o.collection_usd) : null,
  }))

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>🗺️</span> Live Courier Map & Fleet GPS
          </h1>
          <p className="text-xs text-slate-500">
            Real-time fleet tracking, active stops sequence, and live courier positions
          </p>
        </div>
      </div>

      <MapClient drivers={drivers} orders={orders} />
    </div>
  )
}
