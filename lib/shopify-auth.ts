import { createServiceClient } from '@/lib/supabase/server'

interface StoredShopifyAuth {
  access_token: string
  refresh_token?: string
  expires_at?: number // ms timestamp
}

export function parseStoredToken(raw: string | null | undefined): StoredShopifyAuth | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed.access_token) return parsed
    } catch {
      // not valid JSON
    }
  }
  return { access_token: trimmed }
}

/**
 * Ensures a valid, unexpired Shopify Admin API access token for a given shop.
 * Automatically handles:
 * 1. Returning valid cached tokens.
 * 2. Refreshing expiring tokens via refresh_token.
 * 3. Programmatically upgrading legacy non-expiring offline tokens via token-exchange.
 */
export async function getValidShopifyAccessToken(shop: {
  id: string
  shopify_domain: string
  shopify_access_token?: string | null
}): Promise<string> {
  const cleanShop = shop.shopify_domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  const clientId = process.env.SHOPIFY_CLIENT_ID || process.env.NEXT_PUBLIC_SHOPIFY_CLIENT_ID || 'cf8028e469ae3e06ebefe5fec8fd96d3'
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET || ''

  const auth = parseStoredToken(shop.shopify_access_token)
  if (!auth || !auth.access_token) {
    throw new Error(`Shop ${cleanShop} does not have a Shopify access token configured.`)
  }

  const now = Date.now()

  // 1. If we have an expires_at and it is valid for at least another 3 minutes, return it
  if (auth.expires_at && auth.expires_at > now + 3 * 60 * 1000) {
    return auth.access_token
  }

  const serviceClient = createServiceClient()

  // 2. If token is expiring/expired and we have a refresh_token, perform refresh
  if (auth.refresh_token && clientSecret) {
    try {
      const refreshRes = await fetch(`https://${cleanShop}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token: auth.refresh_token,
        }),
      })

      if (refreshRes.ok) {
        const refreshData = await refreshRes.json()
        const newAuth: StoredShopifyAuth = {
          access_token: refreshData.access_token,
          refresh_token: refreshData.refresh_token || auth.refresh_token,
          expires_at: now + ((refreshData.expires_in || 3600) - 120) * 1000,
        }

        await serviceClient
          .from('shops')
          .update({ shopify_access_token: JSON.stringify(newAuth) })
          .eq('id', shop.id)

        return newAuth.access_token
      }
    } catch (err) {
      console.error('Error refreshing Shopify token:', err)
    }
  }

  // 3. If legacy non-expiring token, perform token exchange to upgrade to expiring offline token
  if (clientSecret) {
    try {
      const exchangeRes = await fetch(`https://${cleanShop}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
          client_id: clientId,
          client_secret: clientSecret,
          subject_token: auth.access_token,
          subject_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
          requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
          expiring: '1',
        }),
      })

      if (exchangeRes.ok) {
        const exData = await exchangeRes.json()
        const newAuth: StoredShopifyAuth = {
          access_token: exData.access_token,
          refresh_token: exData.refresh_token,
          expires_at: now + ((exData.expires_in || 3600) - 120) * 1000,
        }

        await serviceClient
          .from('shops')
          .update({ shopify_access_token: JSON.stringify(newAuth) })
          .eq('id', shop.id)

        return newAuth.access_token
      } else {
        const errText = await exchangeRes.text()
        console.warn('Shopify token exchange error:', errText)
      }
    } catch (err) {
      console.error('Error performing Shopify token exchange:', err)
    }
  }

  // Fallback to existing token
  return auth.access_token
}
