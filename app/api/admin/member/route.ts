import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { UserRole } from '@/lib/auth'

// PATCH — change member role
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { memberId, role, workspaceId } = await req.json()

  const { data: caller } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (caller?.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const serviceClient = createServiceClient()

  const { data: target } = await serviceClient
    .from('workspace_members')
    .select('role, user_id')
    .eq('id', memberId)
    .single()

  if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  if (target.role === 'owner') return NextResponse.json({ error: 'Cannot change owner role' }, { status: 400 })

  await serviceClient
    .from('workspace_members')
    .update({ role: role as UserRole })
    .eq('id', memberId)

  await serviceClient.from('audit_log').insert({
    workspace_id: workspaceId,
    actor_id: user.id,
    actor_email: user.email,
    action: 'member.role_changed',
    entity_type: 'workspace_member',
    entity_id: memberId,
    diff: { from: target.role, to: role },
  })

  return NextResponse.json({ success: true })
}

// DELETE — remove member
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { memberId, workspaceId } = await req.json()

  const { data: caller } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (caller?.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const serviceClient = createServiceClient()

  await serviceClient.from('audit_log').insert({
    workspace_id: workspaceId,
    actor_id: user.id,
    actor_email: user.email,
    action: 'member.removed',
    entity_type: 'workspace_member',
    entity_id: memberId,
  })

  await serviceClient
    .from('workspace_members')
    .delete()
    .eq('id', memberId)
    .eq('workspace_id', workspaceId)
    .neq('role', 'owner') // Safety: never delete owner via this route

  return NextResponse.json({ success: true })
}
