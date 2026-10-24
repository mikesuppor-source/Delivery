import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isValidLebanesePhone, formatLebanesePhone } from '@/lib/phone'
import { formatOrderCode } from '@/lib/order-codes'
import { getShopForUser } from '@/lib/shop-auth'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password, shopName, prefix, phone, address, accountType } = body

    if (!email || !password || !shopName) {
      return NextResponse.json({ error: 'Email, password, and name are required.' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
    }

    if (phone && !isValidLebanesePhone(phone)) {
      return NextResponse.json({ error: 'Please enter a valid Lebanese contact phone number (+961 or 03/70/71/76/81).' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    // 1. Get default workspace
    const { data: ws, error: wsErr } = await serviceClient
      .from('workspaces')
      .select('id')
      .order('created_at')
      .limit(1)
      .single()

    if (wsErr || !ws) {
      return NextResponse.json({ error: 'No active delivery workspace found.' }, { status: 500 })
    }

    // 2. Check if email already exists in Auth
    const { data: existingUsers } = await serviceClient.auth.admin.listUsers()
    const duplicate = existingUsers?.users?.find(u => u.email?.toLowerCase() === email.trim().toLowerCase())

    let userId: string

    if (duplicate) {
      // Check if this duplicate user already has an active shop registered
      const existingShop = await getShopForUser(serviceClient, duplicate)
      if (existingShop) {
        return NextResponse.json({
          error: 'An account with this email already exists and is registered. Please sign in.',
        }, { status: 400 })
      }

      // Self-heal: user account was created during a prior failed attempt. Update credentials & proceed.
      await serviceClient.auth.admin.updateUserById(duplicate.id, {
        password,
        user_metadata: {
          shop_name: shopName.trim(),
          role: 'merchant',
          account_type: accountType || 'merchant',
        },
      })
      userId = duplicate.id
    } else {
      // 3. Create fresh user
      const { data: authData, error: authErr } = await serviceClient.auth.admin.createUser({
        email: email.trim(),
        password,
        email_confirm: true,
        user_metadata: {
          shop_name: shopName.trim(),
          role: 'merchant',
          account_type: accountType || 'merchant',
        },
      })

      if (authErr || !authData.user) {
        return NextResponse.json({ error: authErr?.message || 'Failed to create user account' }, { status: 500 })
      }
      userId = authData.user.id
    }

    const cleanPrefix = prefix ? formatOrderCode(prefix).slice(0, 5) : null
    const formattedPhone = phone ? formatLebanesePhone(phone) : null

    // 4. Create Shop record (with schema fallback if prefix/user_id columns are not yet in the DB)
    const baseShop = {
      workspace_id: ws.id,
      name: shopName.trim(),
      phone: formattedPhone,
      address: address ? address.trim() : null,
      active: true,
      balance_usd: 0,
    }

    let shop: any = null
    let shopErr: any = null

    // First attempt: insert with prefix and user_id
    const attemptWithColumns = await serviceClient
      .from('shops')
      .insert({
        ...baseShop,
        prefix: cleanPrefix,
        user_id: userId,
      })
      .select()
      .maybeSingle()

    if (!attemptWithColumns.error && attemptWithColumns.data) {
      shop = attemptWithColumns.data
    } else {
      // Schema cache fallback: columns prefix or user_id do not exist yet in live DB
      const attemptBase = await serviceClient
        .from('shops')
        .insert(baseShop)
        .select()
        .single()

      if (attemptBase.error) {
        shopErr = attemptBase.error
      } else {
        shop = attemptBase.data
      }
    }

    if (shopErr || !shop) {
      return NextResponse.json({
        error: `Shop record creation failed: ${shopErr?.message || 'Database error'}`,
      }, { status: 500 })
    }

    // 5. Always record shop_id and prefix in auth.users user_metadata for reliable zero-latency lookup
    await serviceClient.auth.admin.updateUserById(userId, {
      user_metadata: {
        shop_name: shopName.trim(),
        shop_id: shop.id,
        prefix: cleanPrefix || 'CD',
        role: 'merchant',
        account_type: accountType || 'merchant',
      },
    })

    // 6. Add workspace membership as readonly partner
    await serviceClient.from('workspace_members').upsert({
      workspace_id: ws.id,
      user_id: userId,
      role: 'readonly',
      display_name: shopName.trim(),
    }, { onConflict: 'workspace_id,user_id' })

    return NextResponse.json({
      success: true,
      message: 'Account registered successfully!',
      shop,
    })
  } catch (err: unknown) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Registration failed',
    }, { status: 500 })
  }
}
