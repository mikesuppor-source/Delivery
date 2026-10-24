import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    const rawShop = searchParams.get('shop')

    if (!code || !rawShop) {
      return NextResponse.json({ error: 'Missing code or shop parameter from Shopify callback' }, { status: 400 })
    }

    let cleanShop = rawShop.trim().toLowerCase()
    cleanShop = cleanShop.replace(/^https?:\/\//, '').replace(/\/.*$/, '')

    const clientId = process.env.SHOPIFY_CLIENT_ID || process.env.NEXT_PUBLIC_SHOPIFY_CLIENT_ID || ''
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET || ''

    if (!clientId || !clientSecret) {
      return NextResponse.json({
        error: 'Shopify Client ID or Secret not configured in environment variables.',
      }, { status: 500 })
    }

    // 1. Exchange temporary code for permanent access token
    const tokenRes = await fetch(`https://${cleanShop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    })

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text()
      return NextResponse.json({
        error: `Shopify token exchange failed (${tokenRes.status}): ${errBody.slice(0, 150)}`,
      }, { status: 400 })
    }

    const tokenData = await tokenRes.json()
    const accessToken = tokenData.access_token

    if (!accessToken) {
      return NextResponse.json({ error: 'No access token received from Shopify' }, { status: 400 })
    }

    // 2. Fetch store info from Shopify
    let storeName = cleanShop.split('.')[0]
    let storePhone = null
    let storeEmail = null

    try {
      const shopRes = await fetch(`https://${cleanShop}/admin/api/2024-01/shop.json`, {
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
      })
      if (shopRes.ok) {
        const data = await shopRes.json()
        if (data.shop) {
          storeName = data.shop.name || storeName
          storePhone = data.shop.phone || null
          storeEmail = data.shop.email || null
        }
      }
    } catch {
      // Continue even if shop info fetch fails
    }

    const serviceClient = createServiceClient()

    // 3. Find or create the shop in Cedar Delivery database
    const { data: existingShop } = await serviceClient
      .from('shops')
      .select('*')
      .eq('shopify_domain', cleanShop)
      .maybeSingle()

    let targetShop = existingShop
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000'
    const proto = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`

    if (!targetShop) {
      // Find active workspace
      const { data: ws } = await serviceClient
        .from('workspaces')
        .select('id')
        .order('created_at')
        .limit(1)
        .single()

      const generatedKey = 'cdr_shop_' + crypto.randomBytes(16).toString('hex')

      const { data: newShop, error: createErr } = await serviceClient
        .from('shops')
        .insert({
          workspace_id: ws?.id,
          name: storeName,
          shopify_domain: cleanShop,
          shopify_access_token: accessToken,
          api_key: generatedKey,
          phone: storePhone,
          active: true,
          balance_usd: 0,
        })
        .select()
        .single()

      if (createErr || !newShop) {
        return NextResponse.json({ error: `Failed to create shop record: ${createErr?.message}` }, { status: 500 })
      }
      targetShop = newShop
    } else {
      // Update existing shop with new access token
      let apiKey = targetShop.api_key
      if (!apiKey) {
        apiKey = 'cdr_shop_' + crypto.randomBytes(16).toString('hex')
      }

      await serviceClient
        .from('shops')
        .update({
          shopify_access_token: accessToken,
          shopify_domain: cleanShop,
          api_key: apiKey,
        })
        .eq('id', targetShop.id)

      targetShop.api_key = apiKey
    }

    // 4. Automatically register order webhook on Shopify
    const webhookUrl = `${appBaseUrl}/api/webhooks/shopify?shop_key=${targetShop.api_key}`
    try {
      await fetch(`https://${cleanShop}/admin/api/2024-01/webhooks.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({
          webhook: {
            topic: 'orders/create',
            address: webhookUrl,
            format: 'json',
          },
        }),
      })
    } catch {
      // Non-fatal if webhook registration fails on first try
    }

    // 5. Redirect merchant to success screen
    return NextResponse.redirect(`${appBaseUrl}/shopify?connected=true&shop=${encodeURIComponent(cleanShop)}`)
  } catch (err: unknown) {
    console.error('Error in Shopify OAuth callback:', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Error completing Shopify OAuth callback',
    }, { status: 500 })
  }
}
