'use client'

import { useState } from 'react'

type Answer = 'confirmed' | 'disputed' | 'already' | null

export function DeliveryReceivedButtons({ trackingToken, answered }: { trackingToken: string; answered: Answer }) {
  const [state, setState] = useState<Answer>(answered)
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function send(received: boolean) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/orders/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trackingToken, received, note: received ? null : note.trim() || null }) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Something went wrong')
      setState(body.result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const box = { marginTop: 16, background: 'var(--surface)', border: '1.5px solid var(--line)', borderRadius: 12, padding: '16px 18px', textAlign: 'center' as const }
  if (state === 'already') {
    return <div data-testid="received-answer" style={box}>You have already answered. Thank you. · لقد أجبت مسبقاً، شكراً لك.</div>
  }
  if (state === 'confirmed') {
    return <div data-testid="received-answer" style={box}><strong>Thank you!</strong> You confirmed that you received your parcel. · شكراً لك، تم تأكيد الاستلام.</div>
  }
  if (state === 'disputed') {
    return <div data-testid="received-answer" style={box}><strong>We are sorry.</strong> We told the delivery company that you did not receive this parcel, and they will contact you. · تم إبلاغ شركة التوصيل وسيتواصلون معك.</div>
  }
  return (
    <div data-testid="received-card" style={box}>
      <p style={{ margin: '0 0 10px', fontWeight: 700 }}>Did you receive your parcel? · هل استلمت طردك؟</p>
      {!asking ? (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => send(true)}>Yes, I got it · نعم</button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setAsking(true)}>No, I did not · لا</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea aria-label="What happened?" placeholder="What happened? (optional)" value={note} maxLength={500} onChange={e => setNote(e.target.value)} rows={3} />
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => send(false)}>Tell the delivery company</button>
        </div>
      )}
      {error && <p role="alert" style={{ color: '#991b1b', fontSize: 13, margin: '8px 0 0' }}>{error}</p>}
    </div>
  )
}
