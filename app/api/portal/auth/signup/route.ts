import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isValidLebanesePhone, formatLebanesePhone } from '@/lib/phone'
import { formatOrderCode } from '@/lib/order-codes'

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

    // 2. Check if email already exists
    const { data: existingUser } = await serviceClient.auth.admin.listUsers()
    const duplicate = existingUser?.users?.find(u => u.email?.toLowerCase() === email.trim().toLowerCase())
    if (duplicate) {
      return NextResponse.json({ error: 'An account with this email already exists. Please sign in.' }, { status: 400 })
    }

    // 3. Create the user with confirmed email
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

    const userId = authData.user.id
    const cleanPrefix = prefix ? formatOrderCode(prefix).slice(0, 5) : null
    const formattedPhone = phone ? formatLebanesePhone(phone) : null

    // 4. Create Shop record linked to user
    const { data: shop, error: shopErr } = await serviceClient
      .from('shops')
      .insert({
        workspace_id: ws.id,
        name: shopName.trim(),
        phone: formattedPhone,
        address: address ? address.trim() : null,
        user_id: userId,
        prefix: cleanPrefix,
        active: true,
        balance_usd: 0,
      })
      .select()
      .single()

    if (shopErr) {
      return NextResponse.json({ error: `Shop record creation failed: ${shopErr.message}` }, { status: 500 })
    }

    // 5. Add workspace membership as readonly partner
    await serviceClient.from('workspace_members').insert({
      workspace_id: ws.id,
      user_id: userId,
      role: 'readonly',
      display_name: shopName.trim(),
    })

    return NextResponse.json({
      success: true,
      message: 'Merchant account registered successfully!',
      shop,
    })
  } catch (err: unknown) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Registration failed',
    }, { status: 500 })
  }
}
