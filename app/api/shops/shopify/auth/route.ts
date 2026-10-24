import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const rawShop = searchParams.get('shop')

    if (!rawShop) {
      return NextResponse.json({ error: 'Missing ?shop= parameter (e.g. yourstore.myshopify.com)' }, { status: 400 })
    }

    let cleanShop = rawShop.trim().toLowerCase()
    cleanShop = cleanShop.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (!cleanShop.includes('.')) {
      cleanShop = `${cleanShop}.myshopify.com`
    }

    const clientId = process.env.SHOPIFY_CLIENT_ID || process.env.NEXT_PUBLIC_SHOPIFY_CLIENT_ID || ''
    if (!clientId) {
      return NextResponse.json({
        error: 'SHOPIFY_CLIENT_ID environment variable is not configured yet on server.',
      }, { status: 500 })
    }

    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000'
    const proto = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`

    const redirectUri = `${appBaseUrl}/api/shops/shopify/callback`
    const scopes = 'read_orders,write_orders,read_fulfillments,write_fulfillments'
    const state = crypto.randomBytes(16).toString('hex')

    const installUrl = `https://${cleanShop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`

    return NextResponse.redirect(installUrl)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Auth redirect error' }, { status: 500 })
  }
}
