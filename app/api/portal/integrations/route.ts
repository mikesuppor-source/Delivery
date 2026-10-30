import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { api, ApiError, checked } from '@/lib/api'
import { shopAccess } from '@/lib/access'
import { generateApiKey } from '@/lib/api-keys'
import { parseBody, id, requiredText, z } from '@/lib/validation'
import { allowLocalWebhooks, validateWebhookUrl } from '@/lib/webhook-url'

export const dynamic = 'force-dynamic'

const MAX_ACTIVE_KEYS = 5
const newSecret = () => 'whsec_' + randomBytes(24).toString('hex')

const Action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('createKey'), shopId: id.optional(), name: requiredText(80) }),
  z.object({ action: z.literal('revokeKey'), shopId: id.optional(), keyId: id }),
  z.object({ action: z.literal('saveWebhook'), shopId: id.optional(), url: z.string().max(500), enabled: z.boolean().optional() }),
  z.object({ action: z.literal('rotateSecret'), shopId: id.optional() }),
  z.object({ action: z.literal('removeWebhook'), shopId: id.optional() }),
])

/** GET /api/portal/integrations: this shop's API keys (never the keys themselves), webhook setting and recent messages. */
export const GET = api(async req => {
  const { db, shop } = await shopAccess(new URL(req.url).searchParams.get('shopId'))
  const [keys, webhook, deliveries] = await Promise.all([
    db.from('shop_api_keys').select('id, name, key_prefix, created_at, last_used_at, revoked_at').eq('shop_id', shop.id).order('created_at', { ascending: false }),
    db.from('shop_webhooks').select('url, enabled, created_at, updated_at').eq('shop_id', shop.id).maybeSingle(),
    db.from('webhook_deliveries').select('id, event, status, attempts, last_status_code, last_error, created_at, delivered_at, next_attempt_at, payload').eq('shop_id', shop.id).order('created_at', { ascending: false }).limit(30),
  ])
  return NextResponse.json({
    keys: (keys.data ?? []).map(k => ({ id: k.id, name: k.name, prefix: k.key_prefix, createdAt: k.created_at, lastUsedAt: k.last_used_at, revokedAt: k.revoked_at })),
    webhook: webhook.data ? { url: webhook.data.url, enabled: webhook.data.enabled, updatedAt: webhook.data.updated_at } : null,
    deliveries: (deliveries.data ?? []).map(d => ({
      id: d.id, event: d.event, status: d.status, attempts: d.attempts, statusCode: d.last_status_code, error: d.last_error,
      createdAt: d.created_at, deliveredAt: d.delivered_at, nextAttemptAt: d.next_attempt_at, orderCode: (d.payload as { code?: string } | null)?.code ?? null,
    })),
  })
})

/** POST /api/portal/integrations: make or revoke a key, set, rotate or remove the webhook. A new key or secret is shown once, in this answer. */
export const POST = api(async req => {
  const body = await parseBody(req, Action)
  const { db, shop, user } = await shopAccess(body.shopId)

  if (body.action === 'createKey') {
    const { count } = await db.from('shop_api_keys').select('id', { count: 'exact', head: true }).eq('shop_id', shop.id).is('revoked_at', null)
    if ((count ?? 0) >= MAX_ACTIVE_KEYS) throw new ApiError(400, `A shop can have ${MAX_ACTIVE_KEYS} active keys. Revoke one first.`)
    const k = generateApiKey()
    const row = checked(await db.from('shop_api_keys').insert({
      workspace_id: shop.workspace_id, shop_id: shop.id, name: body.name, key_prefix: k.prefix, key_hash: k.hash, created_by: user.id,
    }).select('id, name, key_prefix, created_at').single())
    return NextResponse.json({ key: k.key, id: row.id, name: row.name, prefix: row.key_prefix, createdAt: row.created_at }, { status: 201 })
  }

  if (body.action === 'revokeKey') {
    const revoked = checked(await db.from('shop_api_keys').update({ revoked_at: new Date().toISOString() })
      .eq('id', body.keyId).eq('shop_id', shop.id).is('revoked_at', null).select('id').maybeSingle())
    return NextResponse.json({ revoked: revoked.id })
  }

  if (body.action === 'saveWebhook') {
    const url = validateWebhookUrl(body.url, { allowLocal: allowLocalWebhooks() })
    const { data: existing } = await db.from('shop_webhooks').select('shop_id').eq('shop_id', shop.id).maybeSingle()
    if (existing) {
      checked(await db.from('shop_webhooks').update({ url, enabled: body.enabled ?? true, updated_at: new Date().toISOString() }).eq('shop_id', shop.id).select('shop_id').single())
      return NextResponse.json({ url, enabled: body.enabled ?? true })
    }
    const secret = newSecret()
    checked(await db.from('shop_webhooks').insert({ shop_id: shop.id, workspace_id: shop.workspace_id, url, secret, enabled: body.enabled ?? true }).select('shop_id').single())
    return NextResponse.json({ url, enabled: body.enabled ?? true, secret }, { status: 201 })
  }

  if (body.action === 'rotateSecret') {
    const secret = newSecret()
    checked(await db.from('shop_webhooks').update({ secret, updated_at: new Date().toISOString() }).eq('shop_id', shop.id).select('shop_id').maybeSingle())
    return NextResponse.json({ secret })
  }

  await db.from('shop_webhooks').delete().eq('shop_id', shop.id)
  return NextResponse.json({ removed: true })
})
