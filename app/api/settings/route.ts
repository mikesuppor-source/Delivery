import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { workspaceId, name, currency, usdToLbp } = await req.json()

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (member?.role !== 'owner') {
    return NextResponse.json({ error: 'Only owners can update workspace settings' }, { status: 403 })
  }

  const serviceClient = createServiceClient()
  const updates: Record<string, unknown> = {}
  if (name) updates.name = name.trim()
  if (currency) updates.currency = currency
  if (usdToLbp) updates.usd_to_lbp = Number(usdToLbp)

  const { data: ws, error } = await serviceClient
    .from('workspaces')
    .update(updates)
    .eq('id', workspaceId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await serviceClient.from('audit_log').insert({
    workspace_id: workspaceId,
    actor_id: user.id,
    actor_email: user.email,
    action: 'workspace.settings_updated',
    entity_type: 'workspace',
    entity_id: workspaceId,
    diff: updates,
  })

  return NextResponse.json({ success: true, workspace: ws })
}
