'use client'

import React from 'react'
import Link from 'next/link'
import { useDriverProfile } from '../context'
import { formatUSD, formatLBP, usdToLbp, formatDate } from '@/lib/utils'
import { PrinterIcon } from '@/components/icons'

export function SettlementsSection() {
  const { settlements, workspace } = useDriverProfile()

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Settlement Type</th>
            <th>Amount (USD)</th>
            <th>Amount (LBP)</th>
            <th>Notes</th>
            <th>Voucher</th>
          </tr>
        </thead>
        <tbody>
          {settlements.map(item => (
            <tr key={item.id}>
              <td>
                <strong>{formatDate(item.created_at)}</strong>
              </td>
              <td>
                <span
                  className={`badge ${
                    item.type === 'driver_cash_remittance' ? 'badge-delivered' : 'badge-dispatched'
                  }`}
                >
                  {item.type === 'driver_cash_remittance'
                    ? 'COD Cash Remittance (Driver → Company)'
                    : 'Driver Commission Paid (Company → Driver)'}
                </span>
              </td>
              <td>
                <strong style={{ fontSize: 14 }}>{formatUSD(Number(item.amount_usd))}</strong>
              </td>
              <td>
                <span>{formatLBP(usdToLbp(Number(item.amount_usd), item.usd_to_lbp || workspace.usd_to_lbp))}</span>
              </td>
              <td>
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                  {item.note || '—'}
                </span>
              </td>
              <td>
                <Link
                  href={`/print/settlement/${item.id}?print=1`}
                  target="_blank"
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '4px 8px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  title="Print Cashier Handover Voucher"
                >
                  <PrinterIcon size={13} />
                  Slip
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {settlements.length === 0 && (
        <div className="empty">
          <h3>No settlements recorded yet</h3>
          <p>Use &quot;Remit Cash&quot; or &quot;Pay Courier&quot; above to log transactions for this driver.</p>
        </div>
      )}
    </div>
  )
}
