'use client'

import React, { useState } from 'react'
import { useShopProfile } from '../context'
import { useI18n } from '@/lib/i18n'
import { PAYOUT_METHODS, PAYOUT_METHOD_LABELS, type PayoutMethod } from '@/lib/finance'
import { errorMessage, sendJson } from '@/lib/finance-client'

const label = (method: string) => PAYOUT_METHOD_LABELS[method as PayoutMethod] ?? method

/** How this shop wants to be paid: shown on the Shop Payouts screen so nobody has to ask again. */
export function PayoutDetailsSection() {
  const { shop, setShop, workspace, canManage } = useShopProfile()
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [method, setMethod] = useState<string>(shop.payout_method ?? 'cash')
  const [account, setAccount] = useState(shop.payout_account ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const { shop: saved } = await sendJson<{ shop: { payout_method: string; payout_account: string | null } }>(`/api/shops/${shop.id}`, 'PATCH', {
        workspaceId: workspace.id,
        payoutMethod: method,
        payoutAccount: method === 'cash' ? '' : account.trim(),
      })
      setShop(prev => ({ ...prev, payout_method: saved.payout_method, payout_account: saved.payout_account }))
      setEditing(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '20px 32px', borderBottom: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{t('Paid by')}</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            {t(label(shop.payout_method ?? 'cash'))}
            {shop.payout_account ? <span style={{ fontFamily: 'monospace', fontWeight: 500, marginInlineStart: 10 }}>{shop.payout_account}</span> : null}
          </div>
          {(shop.payout_method ?? 'cash') !== 'cash' && !shop.payout_account && (
            <div style={{ fontSize: 12, color: '#b45309', marginTop: 2 }}>{t('No account saved yet. Add one so payouts can be sent.')}</div>
          )}
        </div>
        {canManage && !editing && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>{t('Change')}</button>
        )}
      </div>

      {editing && (
        <form onSubmit={save} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12, marginTop: 14 }}>
          <div className="field" style={{ minWidth: 180 }}>
            <label>{t('Payout method')}</label>
            <select value={method} onChange={e => setMethod(e.target.value)}>
              {PAYOUT_METHODS.map(m => <option key={m} value={m}>{t(PAYOUT_METHOD_LABELS[m])}</option>)}
            </select>
          </div>
          {method !== 'cash' && (
            <div className="field" style={{ flex: '1 1 260px' }}>
              <label>{method === 'bank' ? t('IBAN or account number') : t('Phone number or account')}</label>
              <input value={account} onChange={e => setAccount(e.target.value)} maxLength={200} placeholder={method === 'bank' ? 'LB00 0000 0000 0000' : '71 000 000'} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>{t('actionCancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? t('Saving…') : t('Save')}</button>
          </div>
          {error && <p role="alert" className="error-msg" style={{ flexBasis: '100%', margin: 0 }}>{error}</p>}
        </form>
      )}
    </div>
  )
}
