import { createServiceClient } from '@/lib/supabase/server'
import { OrderReceiptSlip } from '@/components/order-receipt-slip'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

interface PrintBulkPageProps {
  searchParams: Promise<{ ids?: string; codes?: string; print?: string }>
}

export async function generateMetadata({ searchParams }: PrintBulkPageProps): Promise<Metadata> {
  const { ids, codes } = await searchParams
  const count = (ids?.split(',').filter(Boolean).length || codes?.split(',').filter(Boolean).length || 0)
  return {
    title: `Print ${count} Waybill Receipts — Cedar Delivery`,
    description: `Batch Waybill Printing for ${count} orders with barcodes & QR codes.`,
  }
}

export default async function PrintBulkPage({ searchParams }: PrintBulkPageProps) {
  const { ids, codes, print } = await searchParams
  const supabase = createServiceClient()

  const idList = ids ? ids.split(',').map(s => s.trim()).filter(Boolean) : []
  const codeList = codes ? codes.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : []

  if (idList.length === 0 && codeList.length === 0) {
    notFound()
  }

  let query = supabase
    .from('orders')
    .select(`
      id, code, status, collection_usd, delivery_fee_usd, driver_pay_usd,
      shop_balance_usd, usd_to_lbp_rate, created_at, notes,
      recipient_name, recipient_phone, recipient_address,
      shop:shop_id(id, name, phone),
      driver:driver_id(id, name, phone),
      area:area_id(id, name)
    `)

  if (idList.length > 0) {
    query = query.in('id', idList)
  } else {
    query = query.in('code', codeList)
  }

  const { data: rawOrders } = await query

  if (!rawOrders || rawOrders.length === 0) {
    notFound()
  }

  // Fetch workspace details
  const { data: ws } = await supabase
    .from('workspaces')
    .select('name, usd_to_lbp')
    .limit(1)
    .single()

  const workspaceName = ws?.name || 'Cedar Delivery Desk'
  const workspaceRate = Number(ws?.usd_to_lbp) || 89500

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', padding: '24px 16px' }}>
      {/* Print Controls Header - Hidden during actual print */}
      <div
        className="no-print"
        style={{
          maxWidth: 680,
          margin: '0 auto 20px',
          background: '#ffffff',
          padding: '14px 20px',
          borderRadius: 10,
          border: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link
            href="/orders"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--brand)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            ← Back to Orders Desk
          </Link>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
            Batch Printing: <strong>{rawOrders.length} Waybills</strong>
          </span>
        </div>

        <button
          type="button"
          onClick={undefined}
          className="btn btn-primary"
          style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <a
            href="javascript:window.print()"
            style={{ color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Print All ({rawOrders.length}) Waybills
          </a>
        </button>
      </div>

      <style>{`
        @media print {
          body {
            background: #ffffff !important;
            padding: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          .bulk-waybill-item {
            page-break-after: always !important;
            break-after: page !important;
            margin-bottom: 0 !important;
            padding: 20px 0 !important;
          }
        }
      `}</style>

      {/* Render each waybill sequentially with page break */}
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        {rawOrders.map((order: any, idx: number) => (
          <div key={order.id} className="bulk-waybill-item" style={{ marginBottom: 32 }}>
            <div className="no-print" style={{ textAlign: 'center', marginBottom: 8, fontSize: 11, fontWeight: 700, color: '#6b7280' }}>
              WAYBILL {idx + 1} OF {rawOrders.length} — #{order.code}
            </div>
            <OrderReceiptSlip
              order={order}
              workspaceRate={workspaceRate}
              workspaceName={workspaceName}
              autoPrint={print === 'true' && idx === 0}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
