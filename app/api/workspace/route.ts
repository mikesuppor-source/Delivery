import { NextResponse } from 'next/server'
import { api, ApiError, checked, textField, money } from '@/lib/api'
import { authenticated } from '@/lib/access'
import { createServiceClient } from '@/lib/supabase/server'

// POST /api/workspace — Create a new workspace and set the caller as Owner
export const POST = api(async req => {
  const { user } = await authenticated()
  const body = await req.json()
  const name = textField(body.name, 'workspace name', 100, true)
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') + '-' + Math.random().toString(36).substring(2, 6)

  const serviceClient = createServiceClient()

  // Create workspace
  const ws = checked(await serviceClient
    .from('workspaces')
    .insert({
      name,
      slug,
      usd_to_lbp: money(body.usdToLbp, 'exchange rate', 89500),
      currency: ['USD', 'LBP'].includes(body.currency) ? body.currency : 'USD',
    })
    .select('id, name')
    .single())

  // Create workspace member as owner
  checked(await serviceClient
    .from('workspace_members')
    .insert({
      workspace_id: ws.id,
      user_id: user.id,
      role: 'owner',
      display_name: textField(body.displayName, 'display name', 200) || user.email?.split('@')[0] || 'Owner',
      joined_at: new Date().toISOString(),
    })
    .select('id')
    .single())

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
})
