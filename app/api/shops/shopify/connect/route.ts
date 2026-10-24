import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import crypto from 'crypto'
import { isValidLebanesePhone, formatLebanesePhone } from '@/lib/phone'
import { formatOrderCode } from '@/lib/order-codes'
import { getShopForUser } from '@/lib/shop-auth'

// Helper to normalize Shopify domain (e.g. "https://my-store.myshopify.com/" -> "my-store.myshopify.com")
function cleanShopifyDomain(raw: string): string {
  let cleaned = raw.trim().toLowerCase()
  cleaned = cleaned.replace(/^https?:\/\//, '')
  cleaned = cleaned.replace(/\/.*$/, '')
  if (!cleaned.includes('.')) {
    cleaned = `${cleaned}.myshopify.com`
  }
  return cleaned
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      shopId,           // Optional: If already logged in / existing merchant
      shopName,         // Required for new onboarding
      phone,            // Optional / required for new onboarding
      address,          // Optional
      email,            // Required for new onboarding
      password,         // Required for new onboarding
      shopifyDomain,    // e.g. "my-store.myshopify.com"
      accessToken,      // Optional: Shopify Admin API token "shpat_..."
      prefix,
    } = body

    if (!shopifyDomain) {
      return NextResponse.json({ error: 'Shopify store domain is required (e.g. yourstore.myshopify.com)' }, { status: 400 })
    }

    const cleanDomain = cleanShopifyDomain(shopifyDomain)
    const serviceClient = createServiceClient()

    // Base URL of our Cedar Delivery application for webhook destination
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000'
    const proto = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`

    let shopifyStoreInfo: any = null

    // ── 1. If accessToken provided, verify with Shopify Admin API ──
    if (accessToken) {
      const cleanToken = String(accessToken).trim()
      try {
        const verifyRes = await fetch(`https://${cleanDomain}/admin/api/2024-01/shop.json`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': cleanToken,
          },
        })

        if (!verifyRes.ok) {
          const errText = await verifyRes.text()
          return NextResponse.json({
            error: `Could not connect to Shopify (${verifyRes.status}). Please check your Admin API Access Token and verify that your Shopify app has 'read_orders' and 'write_orders' permissions. Details: ${errText.slice(0, 150)}`,
          }, { status: 400 })
        }

        const shopData = await verifyRes.json()
        shopifyStoreInfo = shopData.shop
      } catch (err) {
        return NextResponse.json({
          error: `Network error connecting to Shopify store "${cleanDomain}": ${err instanceof Error ? err.message : 'Unknown'}`,
        }, { status: 502 })
      }
    }

    // ── 2. Resolve or Create the Shop in Cedar Delivery ──
    let targetShop: any = null

    if (shopId) {
      // Existing shop update
      const { data: existing, error: findErr } = await serviceClient
        .from('shops')
        .select('*')
        .eq('id', shopId)
        .single()

      if (findErr || !existing) {
        return NextResponse.json({ error: 'Target shop not found' }, { status: 404 })
      }
      targetShop = existing
    } else {
      // Self-service new merchant onboarding from /shopify
      if (!email || !password) {
        return NextResponse.json({ error: 'Email and password are required to create your Cedar merchant account.' }, { status: 400 })
      }
      if (password.length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
      }
      if (phone && !isValidLebanesePhone(phone)) {
        return NextResponse.json({ error: 'Please provide a valid Lebanese phone number.' }, { status: 400 })
      }

      const effectiveShopName = (shopName || shopifyStoreInfo?.name || cleanDomain.split('.')[0] || 'Shopify Store').trim()

      // Find active workspace
      const { data: ws } = await serviceClient
        .from('workspaces')
        .select('id')
        .order('created_at')
        .limit(1)
        .single()

      if (!ws) {
        return NextResponse.json({ error: 'No active delivery workspace found.' }, { status: 500 })
      }

      // Check if user exists
      const { data: userList } = await serviceClient.auth.admin.listUsers()
      const existingUser = userList?.users?.find(u => u.email?.toLowerCase() === email.trim().toLowerCase())

      let userId: string
      if (existingUser) {
        const foundShop = await getShopForUser(serviceClient, existingUser)
        if (foundShop) {
          targetShop = foundShop
          userId = existingUser.id
        } else {
          userId = existingUser.id
          await serviceClient.auth.admin.updateUserById(userId, {
            password,
            user_metadata: { shop_name: effectiveShopName, role: 'merchant' },
          })
        }
      } else {
        const { data: newAuth, error: authErr } = await serviceClient.auth.admin.createUser({
          email: email.trim(),
          password,
          email_confirm: true,
          user_metadata: { shop_name: effectiveShopName, role: 'merchant' },
        })
        if (authErr || !newAuth.user) {
          return NextResponse.json({ error: authErr?.message || 'Failed to create user account' }, { status: 500 })
        }
        userId = newAuth.user.id
      }

      if (!targetShop) {
        const cleanPrefix = prefix ? formatOrderCode(prefix).slice(0, 5) : 'SHP'
        const formattedPhone = phone ? formatLebanesePhone(phone) : null

        const { data: newShop, error: shopErr } = await serviceClient
          .from('shops')
          .insert({
            workspace_id: ws.id,
            name: effectiveShopName,
            phone: formattedPhone,
            address: address ? address.trim() : null,
            active: true,
            balance_usd: 0,
            prefix: cleanPrefix,
            user_id: userId,
            shopify_domain: cleanDomain,
            shopify_access_token: accessToken ? String(accessToken).trim() : null,
            api_key: 'cdr_shop_' + crypto.randomBytes(16).toString('hex'),
          })
          .select()
          .single()

        if (shopErr || !newShop) {
          return NextResponse.json({ error: `Could not save shop: ${shopErr?.message}` }, { status: 500 })
        }
        targetShop = newShop

        await serviceClient.from('workspace_members').upsert({
          workspace_id: ws.id,
          user_id: userId,
          role: 'readonly',
          display_name: effectiveShopName,
        }, { onConflict: 'workspace_id,user_id' })
      }
    }

    // Ensure shop has an API key and update Shopify domain/token
    let apiKey = targetShop.api_key
    if (!apiKey) {
      apiKey = 'cdr_shop_' + crypto.randomBytes(16).toString('hex')
    }

    const shopUpdates: Record<string, any> = {
      shopify_domain: cleanDomain,
      api_key: apiKey,
    }
    if (accessToken) {
      shopUpdates.shopify_access_token = String(accessToken).trim()
    }

    await serviceClient
      .from('shops')
      .update(shopUpdates)
      .eq('id', targetShop.id)

    targetShop.api_key = apiKey
    targetShop.shopify_domain = cleanDomain

    // ── 3. Auto-install Webhook on Shopify if Access Token is provided ──
    let webhookInstalled = false
    let webhookMessage = ''
    const cedarWebhookUrl = `${appBaseUrl}/api/webhooks/shopify?shop_key=${apiKey}`

    if (accessToken) {
      const cleanToken = String(accessToken).trim()
      try {
        // First check existing webhooks to avoid duplicates
        const getHooksRes = await fetch(`https://${cleanDomain}/admin/api/2024-01/webhooks.json`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': cleanToken,
          },
        })

        let alreadyExists = false
        if (getHooksRes.ok) {
          const hooksData = await getHooksRes.json()
          const existingList: any[] = hooksData.webhooks || []
          alreadyExists = existingList.some(
            h => h.topic === 'orders/create' && h.address.includes('/api/webhooks/shopify')
          )
        }

        if (alreadyExists) {
          webhookInstalled = true
          webhookMessage = 'Webhook already installed and active.'
        } else {
          // Register webhook
          const createHookRes = await fetch(`https://${cleanDomain}/admin/api/2024-01/webhooks.json`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': cleanToken,
            },
            body: JSON.stringify({
              webhook: {
                topic: 'orders/create',
                address: cedarWebhookUrl,
                format: 'json',
              },
            }),
          })

          if (createHookRes.ok) {
            webhookInstalled = true
            webhookMessage = 'Cedar Delivery order webhook installed automatically!'
          } else {
            const hookErr = await createHookRes.text()
            webhookMessage = `Token verified, but webhook auto-install returned: ${hookErr.slice(0, 120)}`
          }
        }
      } catch (hookCatch) {
        webhookMessage = 'Token verified. You can also paste the webhook URL manually if needed.'
      }
    }

    return NextResponse.json({
      success: true,
      shop: {
        id: targetShop.id,
        name: targetShop.name,
        shopify_domain: cleanDomain,
        api_key: apiKey,
      },
      shopify_store: shopifyStoreInfo ? {
        name: shopifyStoreInfo.name,
        email: shopifyStoreInfo.email,
        currency: shopifyStoreInfo.currency,
        country: shopifyStoreInfo.country_name,
      } : null,
      webhook_installed: webhookInstalled,
      webhook_url: cedarWebhookUrl,
      message: webhookInstalled
        ? `🎉 Connected to ${shopifyStoreInfo?.name || cleanDomain}! Webhook installed automatically.`
        : `Connected to ${cleanDomain}. Copy the webhook URL into your Shopify settings to complete setup.`,
    })
  } catch (err: unknown) {
    console.error('Error in /api/shops/shopify/connect:', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Internal Server Error connecting Shopify store',
    }, { status: 500 })
  }
}
