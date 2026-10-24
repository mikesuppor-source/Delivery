import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { formatUSD, formatLBP, usdToLbp, formatDate } from '@/lib/utils'
import type { Metadata } from 'next'

interface SettlementPrintPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ print?: string }>
}

export async function generateMetadata({ params }: SettlementPrintPageProps): Promise<Metadata> {
  const { id } = await params
  return {
    title: `Settlement Voucher #${id.slice(0, 8).toUpperCase()} — Cedar Delivery`,
    description: 'Official Cashier & Courier Handover Settlement Voucher',
  }
}

export default async function SettlementPrintPage({ params, searchParams }: SettlementPrintPageProps) {
  const { id } = await params
  const { print } = await searchParams
  const supabase = createServiceClient()

  // 1. Fetch settlement record
  const { data: settlement } = await supabase
    .from('settlements')
    .select(`
      id, type, amount_usd, usd_to_lbp, note, created_at, created_by, workspace_id,
      driver:driver_id(id, name, phone, cash_held_usd, pay_owed_usd),
      shop:shop_id(id, name, phone, balance_usd)
    `)
    .eq('id', id)
    .maybeSingle()

  if (!settlement) {
    notFound()
  }

  // 2. Fetch workspace details
  const { data: ws } = await supabase
    .from('workspaces')
    .select('id, name')
    .eq('id', settlement.workspace_id)
    .single()

  // 3. Fetch cashier user display name if available
  let cashierName = 'Cedar Cashier Desk'
  if (settlement.created_by) {
    const { data: member } = await supabase
      .from('workspace_members')
      .select('display_name')
      .eq('user_id', settlement.created_by)
      .maybeSingle()
    if (member?.display_name) {
      cashierName = member.display_name
    }
  }

  const driver = (Array.isArray(settlement.driver) ? settlement.driver[0] : settlement.driver) as unknown as { id: string; name: string; phone: string | null } | null
  const shop = (Array.isArray(settlement.shop) ? settlement.shop[0] : settlement.shop) as unknown as { id: string; name: string; phone: string | null } | null

  const isCashRemittance = settlement.type === 'driver_cash_remittance'
  const isDriverPay = settlement.type === 'driver_pay'
  const isShopPayment = settlement.type === 'shop_payment'

  const voucherTitle = isCashRemittance
    ? 'COURIER COD CASH REMITTANCE VOUCHER'
    : isDriverPay
    ? 'COURIER COMMISSION PAYOUT VOUCHER'
    : 'MERCHANT STORE SETTLEMENT VOUCHER'

  const typeDesc = isCashRemittance
    ? 'COD Cash Collected from Customers Handed Over to Cashier'
    : isDriverPay
    ? 'Courier Delivery Commission Paid by Desk'
    : 'Store Balance Payout'

  const amountUsd = Number(settlement.amount_usd) || 0
  const rate = Number(settlement.usd_to_lbp) || 89500
  const amountLbp = usdToLbp(amountUsd, rate)
  const voucherCode = `SET-${settlement.id.slice(0, 8).toUpperCase()}`

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', padding: '24px 16px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Top action toolbar (hidden during print) */}
      <div
        className="no-print"
        style={{
          maxWidth: 680,
          margin: '0 auto 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Link
          href={driver ? `/drivers/${driver.id}` : shop ? `/shops/${shop.id}` : '/statements'}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#16a34a',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Profile
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={() => window.print()}
            style={{
              padding: '9px 18px',
              borderRadius: 8,
              background: '#047857',
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 2px 8px rgba(4, 120, 87, 0.25)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Print Voucher Slip
          </button>
        </div>
      </div>

      {/* Main Printable Voucher Box */}
      <div
        id="settlement-voucher"
        style={{
          maxWidth: 680,
          margin: '0 auto',
          background: '#ffffff',
          borderRadius: 14,
          border: '2px solid #cbd5e1',
          padding: '36px 40px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.05)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: '#047857',
                  color: '#fff',
                  fontWeight: 900,
                  fontSize: 18,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                🌲
              </div>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0, letterSpacing: '-0.3px', color: '#047857' }}>
                  {ws?.name || 'CEDAR DELIVERY'}
                </h1>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '1px', textTransform: 'uppercase' }}>
                  Central Cashier & Settlement Office
                </div>
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
              {voucherCode}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Date: <strong>{formatDate(settlement.created_at)}</strong>
            </div>
          </div>
        </div>

        {/* Voucher Title Banner */}
        <div
          style={{
            marginTop: 20,
            padding: '12px 18px',
            background: isCashRemittance ? '#ecfdf5' : '#eff6ff',
            borderLeft: `5px solid ${isCashRemittance ? '#059669' : '#2563eb'}`,
            borderRadius: '0 8px 8px 0',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 900, color: isCashRemittance ? '#065f46' : '#1e40af' }}>
            {voucherTitle}
          </div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
            Transaction Type: {typeDesc}
          </div>
        </div>

        {/* Parties Information */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, margin: '24px 0' }}>
          {/* Cashier / Issuer */}
          <div style={{ padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
              Issuing Cashier
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4, color: '#0f172a' }}>
              {cashierName}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Desk Location: Central Hub
            </div>
          </div>

          {/* Courier / Beneficiary */}
          <div style={{ padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
              {driver ? 'Courier / Driver' : 'Merchant Partner'}
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4, color: '#0f172a' }}>
              {driver?.name || shop?.name || 'N/A'}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Phone: {driver?.phone || shop?.phone || 'No phone'}
            </div>
          </div>
        </div>

        {/* Transaction Summary Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
          <thead>
            <tr style={{ background: '#f1f5f9', borderTop: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1' }}>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                Description
              </th>
              <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                Amount (USD)
              </th>
              <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                Equivalent (LBP @ {rate.toLocaleString()})
              </th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '14px 14px', fontSize: 13, fontWeight: 600 }}>
                {typeDesc}
                {settlement.note && (
                  <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', marginTop: 4 }}>
                    Note: &quot;{settlement.note}&quot;
                  </div>
                )}
              </td>
              <td style={{ padding: '14px 14px', textAlign: 'right', fontSize: 16, fontWeight: 800, color: '#047857' }}>
                {formatUSD(amountUsd)}
              </td>
              <td style={{ padding: '14px 14px', textAlign: 'right', fontSize: 14, fontWeight: 700, color: '#334155' }}>
                {formatLBP(amountLbp)}
              </td>
            </tr>
            <tr style={{ background: '#f8fafc', fontWeight: 900 }}>
              <td style={{ padding: '14px 14px', fontSize: 13, textTransform: 'uppercase' }}>
                Net Total Settled
              </td>
              <td style={{ padding: '14px 14px', textAlign: 'right', fontSize: 18, color: '#047857' }}>
                {formatUSD(amountUsd)}
              </td>
              <td style={{ padding: '14px 14px', textAlign: 'right', fontSize: 15, color: '#0f172a' }}>
                {formatLBP(amountLbp)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Legal Disclaimer */}
        <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5, marginBottom: 36, fontStyle: 'italic' }}>
          Declaration: Both parties hereby declare that the funds specified in this voucher were physically counted, verified, and settled in good order. This document serves as proof of settlement.
        </div>

        {/* Signatures & Stamps */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, paddingTop: 10 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ height: 60, borderBottom: '1.5px dashed #94a3b8', marginBottom: 8 }} />
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
              Cashier Signature & Stamp
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              {cashierName}
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ height: 60, borderBottom: '1.5px dashed #94a3b8', marginBottom: 8 }} />
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
              Courier / Recipient Signature
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              {driver?.name || shop?.name || 'Authorized Beneficiary'}
            </div>
          </div>
        </div>
      </div>

      {/* Auto-print script */}
      {print === '1' && (
        <script
          dangerouslySetInnerHTML={{
            __html: `window.addEventListener('load', () => window.print());`,
          }}
        />
      )}
    </div>
  )
}
