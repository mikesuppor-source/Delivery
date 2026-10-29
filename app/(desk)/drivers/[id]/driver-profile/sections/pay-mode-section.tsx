'use client'

import React, { useState } from 'react'
import { useDriverProfile } from '../context'
import { useI18n } from '@/lib/i18n'
import { describePayMode, percentPay } from '@/lib/finance'
import { errorMessage, sendJson } from '@/lib/finance-client'
import { formatUSD } from '@/lib/utils'

/**
 * How this courier is paid: the fixed rate saved on each order (set per zone), or a share of the
 * customer fee. A percent rate is applied when an order is assigned to the courier.
 */
export function PayModeSection() {
  const { driver, setDriver, workspace, canManage } = useDriverProfile()
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [mode, setMode] = useState<'fixed' | 'percent'>(driver.pay_mode === 'percent' ? 'percent' : 'fixed')
  const [percent, setPercent] = useState(driver.pay_percent != null ? String(driver.pay_percent) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const typed = Number(percent)
  const preview = mode === 'percent' && Number.isFinite(typed) && typed > 0 ? formatUSD(percentPay(8, typed)) : null

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (mode === 'percent' && !(typed >= 0 && typed <= 100 && percent !== '')) throw new Error(t('Enter a percentage between 0 and 100'))
      const { driver: saved } = await sendJson<{ driver: { pay_mode: string; pay_percent: number | null } }>(`/api/drivers/${driver.id}`, 'PATCH', {
        workspaceId: workspace.id,
        payMode: mode,
        payPercent: mode === 'percent' ? typed : null,
      })
      setDriver(prev => ({ ...prev, pay_mode: saved.pay_mode, pay_percent: saved.pay_percent == null ? null : Number(saved.pay_percent) }))
      setEditing(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="panel" style={{ padding: '16px 24px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{t('How this courier is paid')}</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{describePayMode(driver.pay_mode, driver.pay_percent, t)}</div>
        </div>
        {canManage && !editing && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>{t('Change')}</button>
        )}
      </div>

      {editing && (
        <form onSubmit={save} style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t('Pay method')}</legend>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              {/* Inputs are full width by default, so a radio button needs its own size */}
              <input type="radio" name="pay-mode" checked={mode === 'fixed'} onChange={() => setMode('fixed')} style={{ width: 16, height: 16, flex: 'none', accentColor: 'var(--brand)' }} />
              {t('Fixed rate: the courier pay saved on each order (set per zone)')}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="radio" name="pay-mode" checked={mode === 'percent'} onChange={() => setMode('percent')} style={{ width: 16, height: 16, flex: 'none', accentColor: 'var(--brand)' }} />
              {t('Share of the customer fee')}
            </label>
          </fieldset>

          {mode === 'percent' && (
            <div className="field" style={{ maxWidth: 220 }}>
              <label>{t('Percent of the fee (%)')}</label>
              <input type="number" min="0" max="100" step="0.5" value={percent} onChange={e => setPercent(e.target.value)} required />
              {preview && <small style={{ color: 'var(--muted)', fontSize: 11 }}>{t('On an {fee} delivery fee this courier earns {amount}', { fee: formatUSD(8), amount: preview })}</small>}
            </div>
          )}

          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            {t("Applies to orders assigned from now on. Orders already delivered or returned keep the pay they were booked with, and returns pay the zone's return rate.")}
          </p>
          {error && <p role="alert" className="error-msg" style={{ margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>{t('actionCancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? t('Saving…') : t('Save')}</button>
          </div>
        </form>
      )}
    </div>
  )
}
