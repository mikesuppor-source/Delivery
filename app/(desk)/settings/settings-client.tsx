'use client'

import { useState } from 'react'

interface SettingsClientProps {
  workspace: {
    id: string
    name: string
    slug: string
    usd_to_lbp: number
    currency: string
  }
  isOwner: boolean
}

export function SettingsClient({ workspace, isOwner }: SettingsClientProps) {
  const [name, setName] = useState(workspace.name)
  const [currency, setCurrency] = useState(workspace.currency)
  const [usdToLbp, setUsdToLbp] = useState(String(workspace.usd_to_lbp))
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!isOwner) return
    setSaving(true)
    setError('')
    setToast('')

    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          name,
          currency,
          usdToLbp: Number(usdToLbp),
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save settings')

      setToast('Workspace settings saved successfully!')
      setTimeout(() => setToast(''), 4000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error updating settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p>Workspace configuration & live financial parameters</p>
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 640 }}>
        <div className="panel-title">
          <h2>Workspace Parameters</h2>
          <small>{isOwner ? 'Owner access' : 'Read-only access'}</small>
        </div>
        <div style={{ padding: '24px' }}>
          <form onSubmit={handleSave}>
            <div className="form-grid">
              <div className="field full">
                <label>Company / Workspace Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  disabled={!isOwner}
                  required
                />
              </div>

              <div className="field">
                <label>Default Currency</label>
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                  disabled={!isOwner}
                >
                  <option value="USD">USD ($)</option>
                  <option value="LBP">LBP (LL)</option>
                </select>
              </div>

              <div className="field">
                <label>Live Exchange Rate (1 USD in LBP)</label>
                <input
                  type="number"
                  value={usdToLbp}
                  onChange={e => setUsdToLbp(e.target.value)}
                  step="500"
                  min="0"
                  disabled={!isOwner}
                  required
                />
              </div>
            </div>

            {error && <p className="error-msg" style={{ marginTop: 14 }}>{error}</p>}

            {isOwner ? (
              <div className="form-actions" style={{ marginTop: 24 }}>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving changes…' : 'Save Changes'}
                </button>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 18 }}>
                Only the workspace owner can modify exchange rates and workspace configurations.
              </p>
            )}
          </form>
        </div>
      </div>

      {toast && (
        <div className="toast">
          <span>{toast}</span>
          <button onClick={() => setToast('')}>✕</button>
        </div>
      )}
    </>
  )
}
