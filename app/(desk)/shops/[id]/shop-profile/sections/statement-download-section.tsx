'use client'

import React, { useEffect, useState } from 'react'
import { useShopProfile } from '../context'
import { statementPeriod, statementTotals, type ShopStatement, type StatementPreset } from '@/lib/finance'
import { formatUSD } from '@/lib/utils'
import { getWhatsAppUrl } from '@/lib/whatsapp'

type Choice = StatementPreset | 'custom'
const CHOICES: Array<[Choice, string]> = [
  ['this_month', 'This month'],
  ['last_month', 'Last month'],
  ['last_30_days', 'Last 30 days'],
  ['this_year', 'This year'],
  ['custom', 'Custom dates'],
]

/** Download the shop's account statement as a PDF, or send its figures by WhatsApp. */
export function StatementDownloadSection() {
  const { shop, workspace } = useShopProfile()
  const [choice, setChoice] = useState<Choice>('last_month')
  const [custom, setCustom] = useState(() => statementPeriod('this_month'))
  const period = choice === 'custom' ? custom : statementPeriod(choice)
  const query = `shopId=${encodeURIComponent(shop.id)}&from=${period.from}&to=${period.to}`
  const validRange = period.from <= period.to

  const [statement, setStatement] = useState<ShopStatement | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!validRange) return
    let current = true
    setStatement(null)
    setError('')
    fetch(`/api/statements/shop?${query}&format=json`)
      .then(async res => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not load the statement')
        if (current) setStatement(data.statement)
      })
      .catch(err => current && setError(err instanceof Error ? err.message : 'Could not load the statement'))
    return () => { current = false }
  }, [query, validRange])

  const totals = statement ? statementTotals(statement) : null
  const whatsappMessage = statement && totals
    ? `Hello ${shop.name}, your ${workspace.name} account statement for ${period.from} to ${period.to}: ` +
      `opening balance ${formatUSD(statement.opening_usd)}, orders ${formatUSD(totals.orders)}, payouts ${formatUSD(totals.payouts)}, ` +
      `closing balance ${formatUSD(statement.closing_usd)}. The full statement is in your merchant portal.`
    : ''

  return (
    <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--line)' }}>
      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Account statement for {shop.name}</h3>
      <p style={{ margin: '4px 0 16px', fontSize: 13, color: 'var(--muted)' }}>
        Opening balance, every delivered or returned order, the payouts made, and the closing balance. Pick a period, then download the PDF.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        {CHOICES.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={choice === key}
            className={`btn btn-sm ${choice === key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setChoice(key)}
            style={{ fontSize: 12, padding: '4px 12px' }}
          >
            {label}
          </button>
        ))}
        {choice === 'custom' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="date" aria-label="From" value={custom.from} max={custom.to} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} style={{ fontSize: 12.5, padding: '4px 8px' }} />
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>to</span>
            <input type="date" aria-label="To" value={custom.to} min={custom.from} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} style={{ fontSize: 12.5, padding: '4px 8px' }} />
          </span>
        )}
      </div>

      {!validRange && <p role="alert" style={{ color: 'var(--danger, #b91c1c)', fontSize: 13 }}>The end date must be on or after the start date.</p>}
      {error && <p role="alert" style={{ color: 'var(--danger, #b91c1c)', fontSize: 13 }}>{error}</p>}

      {statement && totals && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
          {([
            ['Opening balance', statement.opening_usd],
            ['Orders', totals.orders],
            ['Payouts', totals.payouts],
            ...(totals.adjustments !== 0 ? [['Adjustments', totals.adjustments] as [string, number]] : []),
            ['Closing balance', statement.closing_usd],
          ] as Array<[string, number]>).map(([label, value]) => (
            <div key={label} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: value < 0 ? '#b91c1c' : 'inherit' }}>{formatUSD(value)}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {validRange ? (
          <a className="btn btn-primary" href={`/api/statements/shop?${query}&format=pdf`} download>Download PDF statement</a>
        ) : (
          <button type="button" className="btn btn-primary" disabled>Download PDF statement</button>
        )}
        {shop.phone && whatsappMessage && (
          <a className="btn btn-secondary" href={getWhatsAppUrl(shop.phone, whatsappMessage)} target="_blank" rel="noopener noreferrer">
            Send summary on WhatsApp
          </a>
        )}
      </div>
    </div>
  )
}
