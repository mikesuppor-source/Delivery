import { createClient, createServiceClient } from '@/lib/supabase/server'
import { OrderReceiptSlip } from '@/components/order-receipt-slip'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

interface PrintOrderPageProps {
  params: Promise<{ code: string }>
  searchParams: Promise<{ print?: string }>
}

export async function generateMetadata({ params }: PrintOrderPageProps): Promise<Metadata> {
  const { code } = await params
  return {
    title: `Receipt Waybill #${code.toUpperCase()} — Cedar Delivery`,
    description: `Official Delivery Waybill Slip and Barcode for order #${code.toUpperCase()}.`,
  }
}

export default async function PrintOrderPage({ params, searchParams }: PrintOrderPageProps) {
  const { code } = await params
  const { print } = await searchParams
  const supabase = createServiceClient()

  const { data: rawOrder } = await supabase
    .from('orders')
    .select(`
      *,
      shop:shop_id(id, name, phone),
      driver:driver_id(id, name, phone),
      area:area_id(id, name)
    `)
    .ilike('code', code.trim())
    .maybeSingle()

  if (!rawOrder) {
    notFound()
  }

  // Get workspace info
  const { data: ws } = await supabase
    .from('workspaces')
    .select('name, usd_to_lbp')
    .limit(1)
    .single()

  const order = rawOrder as any

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', padding: '24px 16px' }}>
      <div className="no-print" style={{ maxWidth: 620, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link
            href="/portal"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--brand)',
              textDecoration: 'none',
            }}
          >
            ← Store Portal
          </Link>
          <span style={{ color: 'var(--line)' }}>|</span>
          <Link
            href="/orders"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--muted)',
              textDecoration: 'none',
            }}
          >
            Orders Desk
          </Link>
        </div>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Order Waybill: <strong>#{order.code}</strong>
        </span>
      </div>

      <OrderReceiptSlip
        order={order}
        workspaceRate={ws?.usd_to_lbp || 89500}
        workspaceName={ws?.name || 'Cedar Delivery Desk'}
        autoPrint={print === 'true'}
      />
    </div>
  )
}
