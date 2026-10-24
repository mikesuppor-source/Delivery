import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: shop, error } = await supabase
    .from('shops')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !shop) {
    return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
  }

  return NextResponse.json({ shop })
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, phone, address, active, workspaceId } = body

  // Check workspace permissions
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!member || (member.role !== 'owner' && member.role !== 'manager')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name.trim()
  if (phone !== undefined) updates.phone = phone ? phone.trim() : null
  if (address !== undefined) updates.address = address ? address.trim() : null
  if (active !== undefined) updates.active = Boolean(active)

  const serviceClient = createServiceClient()
  const { data: shop, error } = await serviceClient
    .from('shops')
    .update(updates)
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await serviceClient.from('audit_log').insert({
    workspace_id: workspaceId,
    actor_id: user.id,
    actor_email: user.email,
    action: 'shop.updated',
    entity_type: 'shop',
    entity_id: id,
    diff: updates,
  })

  return NextResponse.json({ success: true, shop })
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let workspaceId = ''
  try {
    const body = await req.json()
    workspaceId = body.workspaceId
  } catch {
    const url = new URL(req.url)
    workspaceId = url.searchParams.get('workspaceId') || ''
  }

  if (!workspaceId) {
    return NextResponse.json({ error: 'Workspace ID is required' }, { status: 400 })
  }

  // Check workspace permissions
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!member || (member.role !== 'owner' && member.role !== 'manager')) {
    return NextResponse.json({ error: 'Forbidden: only owners and managers can delete shops' }, { status: 403 })
  }

  const serviceClient = createServiceClient()

  // Check shop exists
  const { data: shop } = await serviceClient
    .from('shops')
    .select('id, name')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .single()

  if (!shop) {
    return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
  }

  // Unlink settlements
  await serviceClient.from('settlements').update({ shop_id: null }).eq('shop_id', id)
  // Nullify shop_id on orders so historical delivery records aren't broken, or delete them
  await serviceClient.from('orders').update({ shop_id: null }).eq('shop_id', id)

  const { error: deleteErr } = await serviceClient
    .from('shops')
    .delete()
    .eq('id', id)
    .eq('workspace_id', workspaceId)

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 })
  }

  await serviceClient.from('audit_log').insert({
    workspace_id: workspaceId,
    actor_id: user.id,
    actor_email: user.email,
    action: 'shop.deleted',
    entity_type: 'shop',
    entity_id: id,
    diff: { name: shop.name },
  })

  return NextResponse.json({ success: true, message: `Shop "${shop.name}" deleted successfully.` })
}
