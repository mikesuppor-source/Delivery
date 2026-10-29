import React from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { allRows } from '@/lib/pagination'
import { WarehouseClient } from './warehouse-client'

export const dynamic = 'force-dynamic'

export default async function WarehousePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: memberData } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .order('created_at')
    .limit(1)
    .single()

  const member = memberData as { workspace_id: string; role: any } | null
  if (!member) {
    redirect('/login')
  }

  const workspaceId = member.workspace_id

  // Load hubs, shelves, holds, delivery zones, and holdable orders
  const [hubsRes, shelvesRes, holdsRes, areasRes, holdableOrdersRes] = await Promise.all([
    allRows(
      supabase
        .from('hubs')
        .select('id, name, address, lat, lng, is_default, active, created_at')
        .eq('workspace_id', workspaceId)
        .order('is_default', { ascending: false }),
    ),
    allRows(
      supabase
        .from('hub_shelves')
        .select('id, hub_id, code, zone_id, created_at, zone:zone_id(id, name)')
        .eq('workspace_id', workspaceId)
        .order('code', { ascending: true }),
    ),
    allRows(
      supabase
        .from('order_holds')
        .select(`
          id,
          workspace_id,
          order_id,
          hub_id,
          shelf_code,
          reason,
          note,
          deliver_after,
          held_at,
          held_by,
          released_at,
          released_by,
          release_note,
          hub:hub_id (
            id,
            name
          ),
          order:order_id (
            id,
            code,
            status,
            recipient_name,
            recipient_phone,
            recipient_address,
            collection_usd,
            delivery_fee_usd,
            storage_fee_usd,
            is_held,
            created_at,
            shop:shop_id (
              id,
              name
            ),
            area:area_id (
              id,
              name,
              storage_fee_per_day_usd,
              free_storage_days
            )
          )
        `)
        .eq('workspace_id', workspaceId)
        .order('held_at', { ascending: false }),
    ),
    allRows(
      supabase
        .from('delivery_areas')
        .select('id, name, fee_usd, storage_fee_per_day_usd, free_storage_days, active')
        .eq('workspace_id', workspaceId)
        .eq('active', true)
        .order('name'),
    ),
    allRows(
      supabase
        .from('orders')
        .select('id, code, recipient_name, recipient_phone, recipient_address, status, is_held, shop:shop_id(name), area:area_id(name)')
        .eq('workspace_id', workspaceId)
        .eq('is_held', false)
        .in('status', ['pending', 'assigned', 'failed'])
        .order('created_at', { ascending: false })
        .limit(100),
    ),
  ])

  return (
    <div className="content" style={{ width: '100%', maxWidth: 1400, margin: '0 auto', padding: '24px 20px' }}>
      <WarehouseClient
        workspaceId={workspaceId}
        userRole={member.role}
        initialHubs={(hubsRes.data as any) || []}
        initialShelves={(shelvesRes.data as any) || []}
        initialHolds={(holdsRes.data as any) || []}
        deliveryAreas={(areasRes.data as any) || []}
        holdableOrders={(holdableOrdersRes.data as any) || []}
      />
    </div>
  )
}
