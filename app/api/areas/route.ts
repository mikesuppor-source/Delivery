import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { workspaceId, name, feeUsd } = await req.json()

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!member || (member.role !== 'owner' && member.role !== 'manager')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const serviceClient = createServiceClient()
  const { data: area, error } = await serviceClient
    .from('delivery_areas')
    .insert({
      workspace_id: workspaceId,
      name: name.trim(),
      fee_usd: Number(feeUsd) || 0,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await serviceClient.from('audit_log').insert({
    workspace_id: workspaceId,
    actor_id: user.id,
    actor_email: user.email,
    action: 'area.created',
    entity_type: 'delivery_area',
    entity_id: area.id,
    diff: { name: area.name, fee_usd: area.fee_usd },
  })

  return NextResponse.json({ success: true, area })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let workspaceId = ''
  let areaId = ''

  try {
    const body = await req.json()
    workspaceId = body.workspaceId
    areaId = body.areaId || body.id
  } catch {
    const url = new URL(req.url)
    workspaceId = url.searchParams.get('workspaceId') || ''
    areaId = url.searchParams.get('areaId') || url.searchParams.get('id') || ''
  }

  if (!workspaceId || !areaId) {
    return NextResponse.json({ error: 'Workspace ID and Area ID are required' }, { status: 400 })
  }

  // Check caller role
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!member || (member.role !== 'owner' && member.role !== 'manager')) {
    return NextResponse.json({ error: 'Forbidden: only owners and managers can delete delivery areas' }, { status: 403 })
  }

  const serviceClient = createServiceClient()

  // Nullify area_id on orders so historical delivery records aren't broken
  await serviceClient.from('orders').update({ area_id: null }).eq('area_id', areaId)

  const { error: deleteErr } = await serviceClient
    .from('delivery_areas')
    .delete()
    .eq('id', areaId)
    .eq('workspace_id', workspaceId)

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 })
  }

  await serviceClient.from('audit_log').insert({
    workspace_id: workspaceId,
    actor_id: user.id,
    actor_email: user.email,
    action: 'area.deleted',
    entity_type: 'delivery_area',
    entity_id: areaId,
    diff: { areaId },
  })

  return NextResponse.json({ success: true, message: 'Delivery area deleted successfully.' })
}
