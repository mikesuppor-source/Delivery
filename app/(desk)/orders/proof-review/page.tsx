import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProofReviewClient, type ProofRow } from './proof-review-client'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Deliveries to review | Cedar Delivery Desk' }

export default async function ProofReviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase.from('workspace_members').select('workspace_id, role').eq('user_id', user.id).order('created_at').limit(1).single()
  if (!member) redirect('/login')

  const { data } = await supabase
    .from('orders')
    .select('id, code, delivered_at, updated_at, proof_method, proof_flags, proof_reason, proof_distance_m, proof_lat, proof_lng, proof_reviewed_at, customer_confirmed_at, customer_disputed_at, customer_dispute_note, pod_photo, shop:shop_id(name), driver:driver_id(name)')
    .eq('workspace_id', member.workspace_id)
    .eq('status', 'delivered')
    .not('proof_flags', 'eq', '{}')
    .order('delivered_at', { ascending: false, nullsFirst: false })
    .limit(200)

  return (
    <div className="content">
      <ProofReviewClient workspaceId={member.workspace_id} canReview={member.role === 'owner' || member.role === 'manager'} initialRows={(data ?? []) as unknown as ProofRow[]} />
    </div>
  )
}
