import type { SupabaseClient, User } from '@supabase/supabase-js'

export async function getShopForUser(serviceClient: SupabaseClient, user: User) {
  // 1. Try by user_metadata.shop_id
  if (user.user_metadata?.shop_id) {
    const { data: shop } = await serviceClient
      .from('shops')
      .select('*')
      .eq('id', user.user_metadata.shop_id)
      .maybeSingle()
    if (shop) return shop
  }

  // 2. Try by user_id column if it exists in DB
  try {
    const { data: shop, error } = await serviceClient
      .from('shops')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!error && shop) return shop
  } catch {
    // Ignore schema errors if column doesn't exist
  }

  // 3. Try by user_metadata.shop_name
  if (user.user_metadata?.shop_name) {
    const { data: shop } = await serviceClient
      .from('shops')
      .select('*')
      .eq('name', user.user_metadata.shop_name)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (shop) return shop
  }

  // 4. Try matching workspace_members display_name
  const { data: member } = await serviceClient
    .from('workspace_members')
    .select('workspace_id, role, display_name')
    .eq('user_id', user.id)
    .maybeSingle()

  if (member?.display_name) {
    const { data: shop } = await serviceClient
      .from('shops')
      .select('*')
      .eq('name', member.display_name)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (shop) return shop
  }

  return null
}
