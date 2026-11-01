'use client'

import Link from 'next/link'
import { useState } from 'react'

export interface ProofRow {
  id: string
  code: string
  delivered_at: string | null
  updated_at: string
  proof_method: string | null
  proof_flags: string[]
  proof_reason: string | null
  proof_distance_m: number | null
  proof_lat: number | null
  proof_lng: number | null
  proof_reviewed_at: string | null
  customer_confirmed_at: string | null
  customer_disputed_at: string | null
  customer_dispute_note: string | null
  pod_photo: string | null
  shop: { name: string } | null
  driver: { name: string } | null
}

const FLAG_WORDS: Record<string, string> = {
  customer_disputed: 'The customer says they did not receive it',
  no_code: 'The customer could not show the delivery code',
  wrong_code: 'The code was wrong or locked, a photo was used',
  unverified_code: 'Saved offline, so the code was not checked at the door',
  far_from_address: 'Marked delivered far from the address',
  no_location: 'The courier\'s location was not available',
}
const REASON_WORDS: Record<string, string> = { not_present: 'Customer was not there', no_phone: 'Customer had no phone or data', refused_code: 'Customer would not give the code', other: 'Another reason' }

export function ProofReviewClient({ workspaceId, canReview, initialRows }: { workspaceId: string; canReview: boolean; initialRows: ProofRow[] }) {
  const [rows, setRows] = useState(initialRows)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const open = rows.filter(r => !r.proof_reviewed_at)
  const done = rows.filter(r => r.proof_reviewed_at)

  async function review(row: ProofRow) {
    setBusy(row.id)
    setError('')
    try {
      const res = await fetch('/api/orders', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, orderId: row.id, proofReviewed: true }) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not save')
      setRows(current => current.map(r => (r.id === row.id ? { ...r, proof_reviewed_at: new Date().toISOString() } : r)))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const card = (row: ProofRow) => (
    <div key={row.id} data-testid="proof-row" className="panel" style={{ padding: 16, marginBottom: 12, opacity: row.proof_reviewed_at ? 0.65 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <strong style={{ fontFamily: 'monospace' }}>#{row.code}</strong>
          <span style={{ marginInlineStart: 10, fontSize: 13, color: 'var(--muted)' }}>
            {row.shop?.name ?? 'Shop'} · courier {row.driver?.name ?? 'unknown'} · {new Date(row.delivered_at ?? row.updated_at).toLocaleString()}
          </span>
        </div>
        {canReview && !row.proof_reviewed_at && (
          <button type="button" className="btn btn-primary btn-sm" disabled={busy === row.id} onClick={() => review(row)}>{busy === row.id ? 'Saving…' : 'Mark reviewed'}</button>
        )}
        {row.proof_reviewed_at && <span className="badge badge-delivered">Reviewed</span>}
      </div>
      <ul style={{ margin: '10px 0 0', paddingInlineStart: 18, fontSize: 14, lineHeight: 1.7 }}>
        {row.proof_flags.map(flag => <li key={flag}>{FLAG_WORDS[flag] ?? flag}</li>)}
      </ul>
      <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--muted)' }}>
        {row.proof_reason && <>Courier&apos;s reason: {REASON_WORDS[row.proof_reason] ?? row.proof_reason}. </>}
        {row.proof_distance_m !== null && <>The courier was {row.proof_distance_m >= 1000 ? (row.proof_distance_m / 1000).toFixed(1) + ' km' : row.proof_distance_m + ' m'} from the address pin. </>}
        {row.customer_confirmed_at && <>The customer confirmed receipt. </>}
        {row.customer_dispute_note && <>Customer says: &ldquo;{row.customer_dispute_note}&rdquo;. </>}
      </p>
      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 13, flexWrap: 'wrap' }}>
        {row.pod_photo && <a href={`/api/orders/${row.id}/pod?kind=photo`} target="_blank" rel="noopener noreferrer">View the photo</a>}
        {row.proof_lat !== null && row.proof_lng !== null && <a href={`https://maps.google.com/?q=${row.proof_lat},${row.proof_lng}`} target="_blank" rel="noopener noreferrer">Where the courier was</a>}
      </div>
    </div>
  )

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link href="/orders" style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand)', textDecoration: 'none' }}>← Back to orders</Link>
        <h1 style={{ margin: '6px 0 4px', fontSize: 24 }}>Deliveries to review</h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>These deliveries were not proved by the customer&apos;s own code, or the customer says the parcel did not arrive. Look at each one, then mark it reviewed.</p>
      </div>
      {error && <div role="alert" style={{ marginBottom: 12, color: '#991b1b' }}>{error}</div>}
      {open.length === 0 && <div className="panel" data-testid="proof-empty" style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>Nothing to review. Every delivery was proved by the customer&apos;s code.</div>}
      {open.map(card)}
      {done.length > 0 && <h2 style={{ fontSize: 16, margin: '24px 0 10px' }}>Already reviewed</h2>}
      {done.map(card)}
    </div>
  )
}
