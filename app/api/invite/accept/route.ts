import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { UserRole } from '@/lib/auth'

// Accept invitation — called from the invite page after signup
export async function POST(req: NextRequest) {
  const { token, displayName } = await req.json()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceClient = createServiceClient()

  // Fetch the invitation
  const { data: invite } = await serviceClient
    .from('invitations')
    .select('id, workspace_id, role, email, expires_at, accepted_at')
    .eq('token', token)
    .single()

  if (!invite) return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  if (invite.accepted_at) return NextResponse.json({ error: 'Already accepted' }, { status: 400 })
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'Expired' }, { status: 400 })

  // Check email matches
  if (invite.email.toLowerCase() !== user.email?.toLowerCase()) {
    return NextResponse.json({ error: 'Email mismatch' }, { status: 403 })
  }

  // Add to workspace_members
  const { error: memberError } = await serviceClient
    .from('workspace_members')
    .upsert({
      workspace_id: invite.workspace_id,
      user_id: user.id,
      role: invite.role as UserRole,
      display_name: displayName || user.email,
      joined_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,user_id' })

  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 })

  // If invited role is driver, auto-link to existing driver or create new profile
  if (invite.role === 'driver') {
    const driverName = displayName || user.email?.split('@')[0] || 'Driver'
    const { data: existingDriver } = await serviceClient
      .from('drivers')
      .select('id')
      .eq('workspace_id', invite.workspace_id)
      .ilike('name', driverName)
      .is('user_id', null)
      .maybeSingle()

    if (existingDriver) {
      await serviceClient
        .from('drivers')
        .update({ user_id: user.id })
        .eq('id', existingDriver.id)
    } else {
      const { data: alreadyLinked } = await serviceClient
        .from('drivers')
        .select('id')
        .eq('workspace_id', invite.workspace_id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!alreadyLinked) {
        await serviceClient.from('drivers').insert({
          workspace_id: invite.workspace_id,
          name: driverName,
          user_id: user.id,
        })
      }
    }
  }

  // Mark invitation as accepted
  await serviceClient
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invite.id)

  // Audit log
  await serviceClient.from('audit_log').insert({
    workspace_id: invite.workspace_id,
    actor_id: user.id,
    actor_email: user.email,
    action: 'member.joined',
    entity_type: 'workspace_member',
    diff: { role: invite.role, display_name: displayName },
  })

  return NextResponse.json({ success: true })
}
