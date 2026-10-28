import { createClient, createServiceClient } from './supabase/server'
import { ApiError, checked, uuid } from './api'
import type { User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { DRIVER_SESSION_COOKIE, driverSessionSecret, verifyDriverSession } from './driver-session'

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
/** Returns the courier ID of a valid, unrevoked session cookie on this request. */
export async function sessionDriverId(db = createServiceClient()) {
  const token = (await cookies()).get(DRIVER_SESSION_COOKIE)?.value
  if (!token) return null
  const session = verifyDriverSession(token, driverSessionSecret())
  if (!session) return null
  const { data } = await db.from('driver_credentials').select('session_version').eq('driver_id', session.driverId).maybeSingle()
  return data?.session_version === session.version ? session.driverId : null
}
export async function driverAccess(driverId: unknown) {
  const db = createServiceClient()
  const driver = checked(await db.from('drivers').select('*').eq('id', uuid(driverId)).maybeSingle())
  if (!driver.active) throw new ApiError(403, 'Driver is inactive')

  // Courier signed in on their phone with phone + PIN
  if (await sessionDriverId(db) === driver.id) return { user: null as User | null, driver, db }

  // Staff account linked to this courier, or a manager/owner of the courier's workspace
  const user = await createClient()
    .then(client => client.auth.getUser())
    .then(({ data }) => data?.user || null)
    .catch(() => null)
  if (!user) throw new ApiError(401, 'Your courier session has expired. Please sign in again.')
  if (driver.user_id !== user.id) await workspaceAccess(driver.workspace_id, ['owner', 'manager'], user)
  return { user: user as User | null, driver, db }
}
export async function validateReferences(db: ReturnType<typeof createServiceClient>, workspaceId: string, refs: Record<string, unknown>) {
  for (const [table, value] of Object.entries(refs)) {
    if (!value) continue
    const { data } = await db.from(table as 'shops').select('id').eq('id', uuid(value)).eq('workspace_id', workspaceId).maybeSingle()
    if (!data) throw new ApiError(400, 'Invalid ' + table + ' reference for this workspace')
  }
}
