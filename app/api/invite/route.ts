import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { UserRole } from '@/lib/auth'

// POST /api/invite — Send invitation
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email, role, workspaceId } = await req.json() as {
    email: string; role: UserRole; workspaceId: string
  }

  // Verify caller is owner
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (member?.role !== 'owner') {
    return NextResponse.json({ error: 'Only owners can invite staff' }, { status: 403 })
  }

  const serviceClient = createServiceClient()

  // Create invitation record
  const { data: invite, error } = await serviceClient
    .from('invitations')
    .insert({ workspace_id: workspaceId, email, role, invited_by: user.id })
    .select('token')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send invite email via Supabase Auth admin API
  const inviteUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/invite/${invite.token}`
  const { error: authError } = await serviceClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: inviteUrl,
  })

  // (If user already exists in auth, the invite still works via the token)

  // Audit log
  await serviceClient.from('audit_log').insert({
    workspace_id: workspaceId,
    actor_id: user.id,
    actor_email: user.email,
    action: 'member.invited',
    entity_type: 'invitation',
    diff: { email, role },
  })

  return NextResponse.json({ success: true, inviteUrl })
}

// DELETE /api/invite — Revoke invitation
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { inviteId, workspaceId } = await req.json()

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (member?.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await supabase.from('invitations').delete().eq('id', inviteId).eq('workspace_id', workspaceId)
  return NextResponse.json({ success: true })
}
