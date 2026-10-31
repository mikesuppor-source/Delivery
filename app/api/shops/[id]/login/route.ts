import { NextResponse } from 'next/server'
import { api, ApiError, checked, uuid } from '@/lib/api'
import { authenticated, workspaceAccess } from '@/lib/access'
import { createServiceClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { siteUrl } from '@/lib/shopify-security'
import { parseBody, z } from '@/lib/validation'
import { EMAIL_PATTERN, passwordLink, refuseStaffLogin, tryEmailLink } from '@/lib/shop-login'

export const dynamic = 'force-dynamic'

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), email: z.string().trim().toLowerCase().max(254).regex(EMAIL_PATTERN, 'Enter a valid email address') }),
  z.object({ action: z.literal('link') }),
])

/**
 * POST /api/shops/{id}/login (desk owners and managers only)
 *   create: makes a login for a shop that has none and links it to the shop.
 *   link:   makes a new password link for the shop's existing login.
 * Both answer with a one-time link where the shop chooses its password; the same link is also emailed when email is set up.
 */
export const POST = api(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const shopId = uuid((await ctx.params).id, 'shop ID')
  const body = await parseBody(req, Body)
  const { user } = await authenticated()
  const db = createServiceClient()
  const shop = checked(await db.from('shops').select('id, name, workspace_id, user_id').eq('id', shopId).maybeSingle())
  await workspaceAccess(shop.workspace_id, ['owner', 'manager'], user)
  await rateLimit('shop-login:' + user.id, 20)

  let base: string
  try { base = siteUrl() } catch { base = new URL(req.url).origin }
  const redirectTo = base + '/reset-password'
  const audit = (action: string, email: string) => db.from('audit_log').insert({
    workspace_id: shop.workspace_id, actor_id: user.id, actor_email: user.email ?? null, action, entity_type: 'shop', entity_id: shop.id, diff: { email },
  })

  if (body.action === 'create') {
    if (shop.user_id) throw new ApiError(409, 'This shop already has a login. Use "New password link" instead.')
    const created = await db.auth.admin.createUser({ email: body.email, email_confirm: true, user_metadata: { role: 'merchant', shop_name: shop.name } })
    if (created.error || !created.data.user) {
      if (created.error?.code === 'email_exists' || /already|registered|exists/i.test(created.error?.message ?? '')) {
        throw new ApiError(409, 'That email already has an account. Use a different email for this shop.')
      }
      throw new ApiError(502, 'Could not create the login. Try again in a moment.')
    }
    const login = created.data.user
    // Link only while the shop still has no login, so two people pressing the button at once cannot both win
    const linked = checked(await db.from('shops').update({ user_id: login.id }).eq('id', shop.id).is('user_id', null).select('id'))
    if (!linked.length) {
      await db.auth.admin.deleteUser(login.id)
      throw new ApiError(409, 'This shop already has a login. Use "New password link" instead.')
    }
    const link = await passwordLink(db, body.email, redirectTo)
    const emailSent = await tryEmailLink(body.email, shop.name, link)
    await audit('shop.login_created', body.email)
    return NextResponse.json({ email: body.email, link, emailSent, created: true }, { status: 201 })
  }

  if (!shop.user_id) throw new ApiError(409, 'This shop has no login yet. Create one first.')
  await refuseStaffLogin(db, shop.user_id)
  const { data: found } = await db.auth.admin.getUserById(shop.user_id)
  const email = found.user?.email
  if (!email) throw new ApiError(409, 'This shop\'s login has no email address.')
  const link = await passwordLink(db, email, redirectTo)
  const emailSent = await tryEmailLink(email, shop.name, link)
  await audit('shop.login_link', email)
  return NextResponse.json({ email, link, emailSent, created: false })
})
