import { allRows } from '@/lib/pagination'
import { createClient } from '@/lib/supabase/server'
// Interactive barcode & QR code camera scanner client
import { ScanClient } from './scan-client'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Barcode & QR Code Scanner | Cedar Delivery',
  description: 'Scan parcel barcodes or QR codes with camera or handheld scanner to verify, dispatch, and track orders.',
}

export default async function ScanPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user?.id ?? '')
    .order('created_at').limit(1).single()

  const workspaceId = member?.workspace_id || ''

  // Fetch active drivers for quick in-scanner assignment
  const { data: drivers } = await allRows(supabase
    .from('drivers')
    .select('id, name, phone, active')
    .eq('workspace_id', workspaceId)
    .eq('active', true)
    .order('name'))

  // Fetch workspace exchange rate
  const { data: ws } = await supabase
    .from('workspaces')
    .select('usd_to_lbp')
    .eq('id', workspaceId)
    .single()

  const rate = Number(ws?.usd_to_lbp) || 89500

  return (
    <div className="content">
      <ScanClient
        workspaceId={workspaceId}
        drivers={drivers || []}
        exchangeRate={rate}
      />
    </div>
  )
}
