import { NextResponse } from 'next/server'
import { api, ApiError, checked } from '@/lib/api'
import { id, parseBody, z } from '@/lib/validation'
import { workspaceAccess } from '@/lib/access'

const CreateHubOrShelfBody = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('hub'),
    workspaceId: id,
    name: z.string().min(1).max(100),
    address: z.string().max(250).optional().nullable(),
    lat: z.number().optional().nullable(),
    lng: z.number().optional().nullable(),
    isDefault: z.boolean().optional(),
    active: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('shelf'),
    workspaceId: id,
    hubId: id,
    code: z.string().min(1).max(50),
    zoneId: id.optional().nullable(),
  }),
])

const UpdateHubOrShelfBody = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('hub'),
    workspaceId: id,
    hubId: id,
    name: z.string().min(1).max(100).optional(),
    address: z.string().max(250).optional().nullable(),
    lat: z.number().optional().nullable(),
    lng: z.number().optional().nullable(),
    isDefault: z.boolean().optional(),
    active: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('shelf'),
    workspaceId: id,
    shelfId: id,
    code: z.string().min(1).max(50).optional(),
    zoneId: id.optional().nullable(),
  }),
])

/** GET /api/hubs?workspaceId */
export const GET = api(async req => {
  const params = new URL(req.url).searchParams
  const workspaceId = params.get('workspaceId') || ''

  if (!workspaceId) {
    throw new ApiError(400, 'workspaceId query parameter is required')
  }

  const { db } = await workspaceAccess(workspaceId, ['owner', 'manager', 'driver', 'readonly'])

  const hubs = checked(
    await db
      .from('hubs')
      .select('id, name, address, lat, lng, is_default, active, created_at')
      .eq('workspace_id', workspaceId)
      .order('name', { ascending: true }),
  )

  const shelves = checked(
    await db
      .from('hub_shelves')
      .select('id, hub_id, code, zone_id, created_at, zone:zone_id(id, name)')
      .eq('workspace_id', workspaceId)
      .order('code', { ascending: true }),
  )

  return NextResponse.json({ hubs, shelves })
})

/** POST /api/hubs */
export const POST = api(async req => {
  const body = await parseBody(req, CreateHubOrShelfBody)
  const { db, workspaceId } = await workspaceAccess(body.workspaceId, ['owner', 'manager'])

  if (body.kind === 'hub') {
    if (body.isDefault) {
      // Clear previous default
      await db
        .from('hubs')
        .update({ is_default: false })
        .eq('workspace_id', workspaceId)
    }

    const hub = checked(
      await db
        .from('hubs')
        .insert({
          workspace_id: workspaceId,
          name: body.name,
          address: body.address || null,
          lat: body.lat || null,
          lng: body.lng || null,
          is_default: body.isDefault || false,
          active: body.active !== undefined ? body.active : true,
        })
        .select()
        .single(),
    )

    return NextResponse.json({ success: true, hub }, { status: 201 })
  } else {
    // kind === 'shelf'
    const shelf = checked(
      await db
        .from('hub_shelves')
        .insert({
          workspace_id: workspaceId,
          hub_id: body.hubId,
          code: body.code.toUpperCase().trim(),
          zone_id: body.zoneId || null,
        })
        .select('id, hub_id, code, zone_id, created_at, zone:zone_id(id, name)')
        .single(),
    )

    return NextResponse.json({ success: true, shelf }, { status: 201 })
  }
})

/** PATCH /api/hubs */
export const PATCH = api(async req => {
  const body = await parseBody(req, UpdateHubOrShelfBody)
  const { db, workspaceId } = await workspaceAccess(body.workspaceId, ['owner', 'manager'])

  if (body.kind === 'hub') {
    if (body.isDefault) {
      await db
        .from('hubs')
        .update({ is_default: false })
        .eq('workspace_id', workspaceId)
    }

    const patch: Record<string, any> = {}
    if (body.name !== undefined) patch.name = body.name
    if (body.address !== undefined) patch.address = body.address
    if (body.lat !== undefined) patch.lat = body.lat
    if (body.lng !== undefined) patch.lng = body.lng
    if (body.isDefault !== undefined) patch.is_default = body.isDefault
    if (body.active !== undefined) patch.active = body.active

    const hub = checked(
      await db
        .from('hubs')
        .update(patch as any)
        .eq('id', body.hubId)
        .eq('workspace_id', workspaceId)
        .select()
        .single(),
    )

    return NextResponse.json({ success: true, hub })
  } else {
    // kind === 'shelf'
    const patch: Record<string, any> = {}
    if (body.code !== undefined) patch.code = body.code.toUpperCase().trim()
    if (body.zoneId !== undefined) patch.zone_id = body.zoneId

    const shelf = checked(
      await db
        .from('hub_shelves')
        .update(patch as any)
        .eq('id', body.shelfId)
        .eq('workspace_id', workspaceId)
        .select('id, hub_id, code, zone_id, created_at, zone:zone_id(id, name)')
        .single(),
    )

    return NextResponse.json({ success: true, shelf })
  }
})
