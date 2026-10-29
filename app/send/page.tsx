import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/server'
import SendClient from './send-client'

export const metadata: Metadata = {
  title: 'Send a Parcel — Cedar Delivery Desk',
  description: 'Book a parcel pickup and delivery across Lebanon. Quick, reliable courier service with live tracking.',
}

export default async function SendParcelPage() {
  const db = createServiceClient()

  // Fetch primary active workspace
  const { data: ws } = await db
    .from('workspaces')
    .select('id, name, usd_to_lbp')
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  const workspaceId = ws?.id || ''
  const usdToLbp = ws?.usd_to_lbp || 89500

  // Fetch active delivery areas with fees and time slots
  const { data: areas } = await db
    .from('delivery_areas')
    .select('id, name, fee_usd, time_slots')
    .eq('workspace_id', workspaceId)
    .eq('active', true)
    .order('name')

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-xl shadow-sm">
              🌲
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">
                {ws?.name || 'Cedar Delivery'}
              </h1>
              <p className="text-xs text-slate-500">Retail Parcel Booking & Delivery</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/track"
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition"
            >
              Track a Package
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <SendClient
          workspaceId={workspaceId}
          usdToLbp={usdToLbp}
          areas={areas || []}
        />
      </main>

      <footer className="max-w-3xl mx-auto px-4 py-8 text-center text-xs text-slate-500 border-t border-slate-200 mt-12">
        <p>© {new Date().getFullYear()} Cedar Delivery. All rights reserved.</p>
        <p className="mt-1">Fast, reliable courier delivery across all regions of Lebanon.</p>
      </footer>
    </div>
  )
}
