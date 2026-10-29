'use client'

import React, { useState } from 'react'
import { usePortal } from '../context'
import { statementPeriod, type StatementPreset } from '@/lib/finance'

const PERIODS: Array<[StatementPreset, string]> = [
  ['this_month', 'This month'],
  ['last_month', 'Last month'],
  ['last_30_days', 'Last 30 days'],
  ['this_year', 'This year'],
]

/** The shop's own account statement as a PDF: orders, fees, payouts and the balance. */
export function StatementSection() {
  const { shop } = usePortal()
  const [period, setPeriod] = useState<StatementPreset>('last_month')
  const { from, to } = statementPeriod(period)

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1.5px solid var(--line)',
        borderRadius: 14,
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 14,
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 800 }}>Account statement</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Your orders, delivery fees, payouts and balance for a period, as a PDF.</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <select aria-label="Statement period" value={period} onChange={e => setPeriod(e.target.value as StatementPreset)} style={{ fontSize: 13, padding: '8px 10px' }}>
          {PERIODS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <a className="btn btn-primary" href={`/api/statements/shop?shopId=${encodeURIComponent(shop.id)}&from=${from}&to=${to}&format=pdf`} download>
          Download PDF
        </a>
      </div>
    </div>
  )
}
