'use client'

import React, { useState } from 'react'
import { Modal } from '@/components/modal'
import { normalizePhoneForWhatsApp } from '@/lib/whatsapp'
import { useShopProfile } from '../context'

interface LoginResult { email: string; link: string; emailSent: boolean; created: boolean }

/** Header button and window for giving a shop a login, or making a new password link for the one it has. */
export function ShopLoginButton() {
  const { shop } = useShopProfile()
  const [hasLogin, setHasLogin] = useState(Boolean(shop.user_id))
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState(shop.contact_email || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<LoginResult | null>(null)
  const [copied, setCopied] = useState(false)

  function show() {
    setError('')
    setResult(null)
    setCopied(false)
    setOpen(true)
  }

  async function run(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/shops/${shop.id}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hasLogin ? { action: 'link' } : { action: 'create', email: email.trim() }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Something went wrong')
      setResult(body)
      setHasLogin(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const whatsapp = result && shop.phone
    ? `https://wa.me/${normalizePhoneForWhatsApp(shop.phone)}?text=${encodeURIComponent(`Hello ${shop.name}, open this link to choose your password for the delivery portal: ${result.link}`)}`
    : ''

  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={show} title="Let this shop sign in to the delivery portal">
        {hasLogin ? 'New password link' : 'Give this shop a login'}
      </button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title={hasLogin && !result?.created ? 'New password link' : 'Give this shop a login'} maxWidth="min(92vw, 560px)">
        {!result ? (
          <form onSubmit={run}>
            {hasLogin ? (
              <p style={{ margin: '0 0 16px', fontSize: 14 }}>
                {shop.name} already has a login. Make a new link if the shop forgot its password or the old link stopped working. The old password keeps working until the shop chooses a new one.
              </p>
            ) : (
              <>
                <p style={{ margin: '0 0 16px', fontSize: 14 }}>
                  The shop will sign in with this email and a password it chooses itself. You get a private link to send to the shop.
                </p>
                <div className="field full" style={{ marginBottom: 16 }}>
                  <label htmlFor="shop-login-email">Shop email</label>
                  <input id="shop-login-email" type="email" required autoFocus placeholder="shop@example.com" value={email} onChange={e => setEmail(e.target.value)} />
                </div>
              </>
            )}
            {error && <div role="alert" data-testid="login-error" style={{ marginBottom: 12, color: '#991b1b', fontSize: 13 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={busy || (!hasLogin && !email.trim())}>
                {busy ? 'Working…' : hasLogin ? 'Make new link' : 'Create login'}
              </button>
            </div>
          </form>
        ) : (
          <div>
            <p data-testid="login-created" style={{ margin: '0 0 8px', fontSize: 14 }}>
              {result.created ? 'Login created' : 'New link ready'} for <strong>{result.email}</strong>.{' '}
              {result.emailSent ? 'We also emailed this link to the shop.' : 'We could not email it, so send the link yourself.'}
            </p>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--muted)' }}>
              Keep it private: whoever opens it can choose the shop&apos;s password. It works once and only for a short time. It is shown only now; make a new link if it expires.
            </p>
            <input data-testid="login-link" readOnly aria-label="Password link" value={result.link} onFocus={e => e.currentTarget.select()} style={{ width: '100%', marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => { navigator.clipboard?.writeText(result.link); setCopied(true) }}>{copied ? 'Copied' : 'Copy link'}</button>
              {whatsapp && <a className="btn btn-secondary" href={whatsapp} target="_blank" rel="noopener noreferrer">Send on WhatsApp</a>}
              <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>Done</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
