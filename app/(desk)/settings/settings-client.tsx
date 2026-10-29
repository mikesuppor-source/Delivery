'use client'

import { useState } from 'react'

interface SettingsClientProps {
  workspace: {
    id: string
    name: string
    slug: string
    usd_to_lbp: number
    currency: string
    default_driver_pay_usd?: number | null
    default_delivery_fee_usd?: number | null
    notify_order_created?: boolean
    notify_out_for_delivery?: boolean
    notify_delivered?: boolean
    notify_failed_attempt?: boolean
    notify_held?: boolean
    whatsapp_cloud_token?: string | null
    whatsapp_phone_number_id?: string | null
  }
  isOwner: boolean
}

export function SettingsClient({ workspace, isOwner }: SettingsClientProps) {
  const [name, setName] = useState(workspace.name)
  const [currency, setCurrency] = useState(workspace.currency)
  const [usdToLbp, setUsdToLbp] = useState(String(workspace.usd_to_lbp))
  const [defaultDriverPayUsd, setDefaultDriverPayUsd] = useState(String(workspace.default_driver_pay_usd ?? '2.00'))
  const [defaultDeliveryFeeUsd, setDefaultDeliveryFeeUsd] = useState(String(workspace.default_delivery_fee_usd ?? '3.50'))

  // Notification flags
  const [notifyOrderCreated, setNotifyOrderCreated] = useState(workspace.notify_order_created ?? true)
  const [notifyOutForDelivery, setNotifyOutForDelivery] = useState(workspace.notify_out_for_delivery ?? true)
  const [notifyDelivered, setNotifyDelivered] = useState(workspace.notify_delivered ?? true)
  const [notifyFailedAttempt, setNotifyFailedAttempt] = useState(workspace.notify_failed_attempt ?? true)
  const [notifyHeld, setNotifyHeld] = useState(workspace.notify_held ?? true)
  const [whatsappCloudToken, setWhatsappCloudToken] = useState(workspace.whatsapp_cloud_token || '')
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState(workspace.whatsapp_phone_number_id || '')

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
          defaultDriverPayUsd: Number(defaultDriverPayUsd),
          defaultDeliveryFeeUsd: Number(defaultDeliveryFeeUsd),
          notifyOrderCreated,
          notifyOutForDelivery,
          notifyDelivered,
          notifyFailedAttempt,
          notifyHeld,
          whatsappCloudToken: whatsappCloudToken.trim() || null,
          whatsappPhoneNumberId: whatsappPhoneNumberId.trim() || null,
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
          <p>Workspace configuration, financial parameters & customer notifications</p>
        </div>
      </div>

      <form onSubmit={handleSave} style={{ maxWidth: 640 }}>
        {/* PANEL 1: WORKSPACE PARAMETERS */}
        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-title">
            <h2>Workspace Parameters</h2>
            <small>{isOwner ? 'Owner access' : 'Read-only access'}</small>
          </div>
          <div style={{ padding: '24px' }}>
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

              <div className="field">
                <label>Default Courier Pay per Order (USD $)</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  placeholder="2.00"
                  value={defaultDriverPayUsd}
                  onChange={e => setDefaultDriverPayUsd(e.target.value)}
                  disabled={!isOwner}
                  required
                />
                <small style={{ color: 'var(--muted)', fontSize: 11 }}>Pre-fills courier commission on new orders (e.g. $1.60 or $2.00)</small>
              </div>

              <div className="field">
                <label>Default Standard Delivery Fee (USD $)</label>
                <input
                  type="number"
                  step="0.10"
                  min="0"
                  placeholder="3.50"
                  value={defaultDeliveryFeeUsd}
                  onChange={e => setDefaultDeliveryFeeUsd(e.target.value)}
                  disabled={!isOwner}
                  required
                />
                <small style={{ color: 'var(--muted)', fontSize: 11 }}>Standard delivery charge for orders without an area fee</small>
              </div>
            </div>
          </div>
        </div>

        {/* PANEL 2: AUTOMATIC CUSTOMER NOTIFICATIONS (WHATSAPP & SMS) */}
        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-title">
            <h2>Automatic Customer Messages (§5.1)</h2>
            <small>WhatsApp Cloud API & SMS dispatch</small>
          </div>
          <div style={{ padding: '24px' }}>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
              Choose which order lifecycle status updates automatically send a notification to the customer with their tracking link.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={notifyOrderCreated}
                  onChange={e => setNotifyOrderCreated(e.target.checked)}
                  disabled={!isOwner}
                  style={{ width: 16, height: 16, accentColor: 'var(--brand)' }}
                />
                <div>
                  <strong style={{ fontSize: 13, display: 'block' }}>Order Created & Confirmed</strong>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Sends confirmation with tracking link when a parcel is registered.
                  </span>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={notifyOutForDelivery}
                  onChange={e => setNotifyOutForDelivery(e.target.checked)}
                  disabled={!isOwner}
                  style={{ width: 16, height: 16, accentColor: 'var(--brand)' }}
                />
                <div>
                  <strong style={{ fontSize: 13, display: 'block' }}>Out for Delivery</strong>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Notifies recipient with courier name and live tracking when dispatched.
                  </span>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={notifyDelivered}
                  onChange={e => setNotifyDelivered(e.target.checked)}
                  disabled={!isOwner}
                  style={{ width: 16, height: 16, accentColor: 'var(--brand)' }}
                />
                <div>
                  <strong style={{ fontSize: 13, display: 'block' }}>Delivered & Customer Rating</strong>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Sends delivery notice with a 1–5 star rating link.
                  </span>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={notifyFailedAttempt}
                  onChange={e => setNotifyFailedAttempt(e.target.checked)}
                  disabled={!isOwner}
                  style={{ width: 16, height: 16, accentColor: 'var(--brand)' }}
                />
                <div>
                  <strong style={{ fontSize: 13, display: 'block' }}>Failed Attempt & Reschedule</strong>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Notifies customer with reason of unsuccessful attempt and rescheduling link.
                  </span>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={notifyHeld}
                  onChange={e => setNotifyHeld(e.target.checked)}
                  disabled={!isOwner}
                  style={{ width: 16, height: 16, accentColor: 'var(--brand)' }}
                />
                <div>
                  <strong style={{ fontSize: 13, display: 'block' }}>Held in Warehouse</strong>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Notifies customer if shipment is held safely until a future delivery date.
                  </span>
                </div>
              </label>
            </div>

            <div className="form-grid" style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
              <div className="field full">
                <label>WhatsApp Cloud API Phone Number ID</label>
                <input
                  type="text"
                  placeholder="e.g. 104523908239012"
                  value={whatsappPhoneNumberId}
                  onChange={e => setWhatsappPhoneNumberId(e.target.value)}
                  disabled={!isOwner}
                />
                <small style={{ color: 'var(--muted)', fontSize: 11 }}>From Meta for Developers WhatsApp Business app</small>
              </div>

              <div className="field full">
                <label>WhatsApp Cloud API Permanent System User Token</label>
                <input
                  type="password"
                  placeholder="EAAB..."
                  value={whatsappCloudToken}
                  onChange={e => setWhatsappCloudToken(e.target.value)}
                  disabled={!isOwner}
                />
                <small style={{ color: 'var(--muted)', fontSize: 11 }}>Leave empty to run in simulated mode without live API billing</small>
              </div>
            </div>
          </div>
        </div>

        {error && <p className="error-msg" style={{ marginBottom: 14 }}>{error}</p>}

        {isOwner ? (
          <div className="form-actions">
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

      {toast && (
        <div className="toast">
          <span>{toast}</span>
          <button onClick={() => setToast('')}>✕</button>
        </div>
      )}
    </>
  )
}
