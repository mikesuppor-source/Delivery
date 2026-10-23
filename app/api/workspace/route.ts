import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// POST /api/workspace — Create a new workspace and set the caller as Owner
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, usdToLbp, currency, displayName } = await req.json()

  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'Workspace name is required' }, { status: 400 })
  }

  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') + '-' + Math.random().toString(36).substring(2, 6)

  const serviceClient = createServiceClient()

  // Create workspace
  const { data: ws, error: wsError } = await serviceClient
    .from('workspaces')
    .insert({
      name: name.trim(),
      slug,
      usd_to_lbp: Number(usdToLbp) || 89500,
      currency: currency || 'USD',
    })
    .select('id, name')
    .single()

  if (wsError) {
    return NextResponse.json({ error: wsError.message }, { status: 500 })
  }

  // Create workspace member as owner
  const { error: memberError } = await serviceClient
    .from('workspace_members')
    .insert({
      workspace_id: ws.id,
      user_id: user.id,
      role: 'owner',
      display_name: displayName?.trim() || user.email?.split('@')[0] || 'Owner',
      joined_at: new Date().toISOString(),
    })

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 })
  }

  // Create default delivery areas
  await serviceClient.from('delivery_areas').insert([
    { workspace_id: ws.id, name: 'Beirut Central', fee_usd: 3.00 },
    { workspace_id: ws.id, name: 'Greater Beirut / Suburbs', fee_usd: 4.50 },
    { workspace_id: ws.id, name: 'Mount Lebanon', fee_usd: 6.00 },
  ])

  // Audit log
  await serviceClient.from('audit_log').insert({
    workspace_id: ws.id,
    actor_id: user.id,
    actor_email: user.email,
    action: 'workspace.created',
    entity_type: 'workspace',
    entity_id: ws.id,
    diff: { name: ws.name, slug },
  })

  return NextResponse.json({ success: true, workspace: ws })
}
