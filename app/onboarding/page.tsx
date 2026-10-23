'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function OnboardingPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [usdToLbp, setUsdToLbp] = useState('89500')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          displayName,
          currency,
          usdToLbp: Number(usdToLbp),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to setup workspace')
      }

      router.push('/')
      router.refresh()
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('An unexpected error occurred')
      }
      setLoading(false)
    }
  }

  return (
    <div className="welcome" style={{ maxWidth: 480 }}>
      <div className="brand-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/>
          <rect x="9" y="11" width="14" height="10" rx="2"/>
          <circle cx="12" cy="16" r="1"/>
          <circle cx="20" cy="16" r="1"/>
        </svg>
      </div>
      <h1>Create your Workspace</h1>
      <p>Set up your delivery company desk. You will be registered as the Owner.</p>

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="ws-name">Company / Workspace Name</label>
          <input
            id="ws-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Cedar Express Logistics"
            required
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="owner-name">Your Full Name (Owner)</label>
          <input
            id="owner-name"
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="e.g. John Doe"
            required
          />
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="currency">Base Currency</label>
            <select
              id="currency"
              value={currency}
              onChange={e => setCurrency(e.target.value)}
            >
              <option value="USD">USD ($)</option>
              <option value="LBP">LBP (LL)</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="rate">Exchange Rate (1 USD in LBP)</label>
            <input
              id="rate"
              type="number"
              value={usdToLbp}
              onChange={e => setUsdToLbp(e.target.value)}
              step="500"
              required
            />
          </div>
        </div>

        {error && <p className="error-msg">{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: 12 }}>
          {loading ? 'Setting up workspace…' : 'Launch Delivery Desk →'}
        </button>
      </form>
    </div>
  )
}
