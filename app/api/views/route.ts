import { NextResponse } from 'next/server'
import { api, ApiError, checked } from '@/lib/api'
import { id, parseBody, z } from '@/lib/validation'
import { workspaceAccess } from '@/lib/access'

const CreateViewBody = z.object({
  workspaceId: id,
  page: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  filters: z.record(z.string(), z.any()),
})

/** GET /api/views?workspaceId&page — list current user's saved views for this page */
export const GET = api(async req => {
  const params = new URL(req.url).searchParams
  const workspaceId = params.get('workspaceId') || ''
  const page = params.get('page') || ''

  if (!workspaceId || !page) {
    throw new ApiError(400, 'workspaceId and page query parameters are required')
  }

  const { db, user } = await workspaceAccess(workspaceId, ['owner', 'manager', 'driver', 'readonly'])

  const views = checked(
    await db
      .from('saved_views')
      .select('id, name, page, filters, updated_at')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .eq('page', page)
      .order('name', { ascending: true }),
  )

  return NextResponse.json({ views })
})

/** POST /api/views — create or update a saved view */
export const POST = api(async req => {
  const body = await parseBody(req, CreateViewBody)
  const { db, user } = await workspaceAccess(body.workspaceId, ['owner', 'manager', 'driver', 'readonly'])

  const result = await db
    .from('saved_views')
    .upsert(
      {
        workspace_id: body.workspaceId,
        user_id: user.id,
        page: body.page,
        name: body.name,
        filters: body.filters,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id,user_id,page,name' },
    )
    .select('id, name, page, filters, updated_at')
    .single()

  return NextResponse.json({ success: true, view: checked(result) })
})

/** DELETE /api/views?workspaceId&viewId — delete a saved view */
export const DELETE = api(async req => {
  const params = new URL(req.url).searchParams
  const workspaceId = params.get('workspaceId') || ''
  const viewId = params.get('viewId') || ''

  if (!workspaceId || !viewId) {
    throw new ApiError(400, 'workspaceId and viewId query parameters are required')
  }

  const { db, user } = await workspaceAccess(workspaceId, ['owner', 'manager', 'driver', 'readonly'])

  const { error } = await db
    .from('saved_views')
    .delete()
    .eq('id', viewId)
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)

  if (error) {
    throw new ApiError(500, error.message)
  }

  return NextResponse.json({ success: true })
})
