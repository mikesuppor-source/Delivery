import { createClient, createServiceClient } from './supabase/server'
import { ApiError, checked, uuid } from './api'
import type { User } from '@supabase/supabase-js'

export async function authenticated() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new ApiError(401, 'Please sign in')
  return { client, user }
}
export async function workspaceAccess(workspaceId: unknown, roles = ['owner', 'manager'], suppliedUser?: User) {
  const user = suppliedUser || (await authenticated()).user
  const id = uuid(workspaceId, 'workspace ID')
  const db = createServiceClient()
  const { data: member } = await db.from('workspace_members').select('*').eq('workspace_id', id).eq('user_id', user.id).maybeSingle()
  if (!member || !roles.includes(member.role)) throw new ApiError(403, 'You do not have permission for this workspace')
  // Legacy merchant readonly memberships never grant staff access.
  if (member.role === 'readonly') {
    const { data: shop } = await db.from('shops').select('id').eq('workspace_id', id).eq('user_id', user.id).limit(1).maybeSingle()
    if (shop) throw new ApiError(403, 'Use the merchant portal')
  }
  return { user, member, db, workspaceId: id }
}
export async function shopAccess(shopId?: unknown) {
  const { user } = await authenticated()
  const db = createServiceClient()
  const query = db.from('shops').select('*')
  const shop = checked(await (shopId ? query.eq('id', uuid(shopId)) : query.eq('user_id', user.id).eq('active', true)).maybeSingle())
  if (!shop) throw new ApiError(404, 'Shop not found')
  if (shop.user_id !== user.id) await workspaceAccess(shop.workspace_id, ['owner', 'manager'], user)
  if (!shop.active) throw new ApiError(403, 'Shop is inactive')
  return { user, shop, db }
}
export async function driverAccess(driverId: unknown) {
  let user: User | null = null
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    user = data?.user || null
  } catch {
    user = null
  }

  const db = createServiceClient()
  const driver = checked(await db.from('drivers').select('*').eq('id', uuid(driverId)).maybeSingle())
  if (!driver) throw new ApiError(404, 'Driver not found')
  if (!driver.active) throw new ApiError(403, 'Driver is inactive')

  if (user) {
    if (driver.user_id && driver.user_id === user.id) {
      return { user, driver, db }
    }
    // If user is logged in but not linked directly to this driver, check workspace manager/owner role
    await workspaceAccess(driver.workspace_id, ['owner', 'manager'], user)
    return { user, driver, db }
  }

  // Mobile run sheet direct access: active driver updating orders assigned to their fleet profile
  return { user: null, driver, db }
}
export async function validateReferences(db: ReturnType<typeof createServiceClient>, workspaceId: string, refs: Record<string, unknown>) {
  for (const [table, value] of Object.entries(refs)) {
    if (!value) continue
    const { data } = await db.from(table as 'shops').select('id').eq('id', uuid(value)).eq('workspace_id', workspaceId).maybeSingle()
    if (!data) throw new ApiError(400, 'Invalid ' + table + ' reference for this workspace')
  }
}
