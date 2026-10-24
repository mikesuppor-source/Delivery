import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const shopId = searchParams.get('shopId')

    if (!shopId) {
      return NextResponse.json({ error: 'shopId is required' }, { status: 400 })
    }

    const serviceClient = createServiceClient()
    const { data: shop, error } = await serviceClient
      .from('shops')
      .select('id, name, api_key, shopify_domain')
      .eq('id', shopId)
      .single()

    if (error || !shop) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
    }

    // If shop does not have an api_key yet, generate one automatically
    let apiKey = shop.api_key
    if (!apiKey) {
      apiKey = 'cdr_shop_' + crypto.randomBytes(16).toString('hex')
      await serviceClient
        .from('shops')
        .update({ api_key: apiKey })
        .eq('id', shopId)
    }

    return NextResponse.json({
      shopId: shop.id,
      name: shop.name,
      api_key: apiKey,
      shopify_domain: shop.shopify_domain,
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { shopId, shopifyDomain, regenerateKey } = body

    if (!shopId) {
      return NextResponse.json({ error: 'shopId is required' }, { status: 400 })
    }

    const serviceClient = createServiceClient()
    const updates: Record<string, any> = {}

    if (shopifyDomain !== undefined) {
      updates.shopify_domain = shopifyDomain ? String(shopifyDomain).trim().toLowerCase() : null
    }

    if (regenerateKey) {
      updates.api_key = 'cdr_shop_' + crypto.randomBytes(16).toString('hex')
    }

    const { data: updatedShop, error } = await serviceClient
      .from('shops')
      .update(updates)
      .eq('id', shopId)
      .select('id, name, api_key, shopify_domain')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      shop: updatedShop,
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
