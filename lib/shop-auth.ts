import type { SupabaseClient, User } from '@supabase/supabase-js'
export async function getShopForUser(client: SupabaseClient, user: User) {
  const { data, error } = await client.from('shops').select('*').eq('user_id', user.id).eq('active', true).maybeSingle()
  if (error) throw new Error('Unable to resolve shop ownership')
  return data
}
