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

  const { data: driver, error } = await supabase
    .from('drivers')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !driver) {
    return NextResponse.json({ error: 'Driver not found' }, { status: 404 })
  }

  return NextResponse.json({ driver })
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, phone, active, workspaceId } = body

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
  if (active !== undefined) updates.active = Boolean(active)

  const serviceClient = createServiceClient()
  const { data: driver, error } = await serviceClient
    .from('drivers')
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
    action: 'driver.updated',
    entity_type: 'driver',
    entity_id: id,
    diff: updates,
  })

  return NextResponse.json({ success: true, driver })
}
