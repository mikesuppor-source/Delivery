import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PortalHeader } from '@/components/portal-header'

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/portal/login')
  }

  const serviceClient = createServiceClient()

  // Find shop connected to this user
  const { data: shop } = await serviceClient
    .from('shops')
    .select('id, name, phone, address, balance_usd, prefix')
    .eq('user_id', user.id)
    .maybeSingle()

  // If no shop exists, let's see if this user is a desk owner/manager testing the portal,
  // or redirect to signup
  if (!shop) {
    // Check if desk member
    const { data: member } = await serviceClient
      .from('workspace_members')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!member) {
      redirect('/portal/signup')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <PortalHeader
        shopName={shop?.name || 'Cedar Merchant'}
        shopPrefix={shop?.prefix || 'CD'}
        userEmail={user.email || ''}
      />
      <main style={{ flex: 1, padding: '24px 20px', maxWidth: 1200, width: '100%', margin: '0 auto' }}>
        {children}
      </main>
    </div>
  )
}
