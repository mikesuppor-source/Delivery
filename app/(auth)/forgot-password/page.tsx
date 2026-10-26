'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const supabase = createClient()
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${origin}/reset-password`,
      })

      if (resetError) {
        throw resetError
      }

      setSuccess(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send password reset email')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="welcome" style={{ maxWidth: 420, margin: '60px auto', padding: '32px 24px' }}>
      <div className="brand-icon">
        <img src="/logo.png" alt="Cedar Delivery Desk" />
      </div>
      <h1>Reset Password</h1>
      <p>Enter your account email to receive a secure password recovery link.</p>

      {success ? (
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', padding: '16px', borderRadius: 8, marginTop: 20 }}>
          <p style={{ fontWeight: 700, marginBottom: 6 }}>✓ Recovery Email Sent!</p>
          <p style={{ fontSize: 13, lineHeight: 1.5 }}>
            We have sent a password reset link to <strong>{email}</strong>. Please check your inbox and click the link to set a new password.
          </p>
          <div style={{ marginTop: 18 }}>
            <Link href="/login" className="btn btn-secondary btn-sm" style={{ display: 'inline-block' }}>
              ← Return to Login
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleReset} style={{ marginTop: 20 }}>
          <div className="field">
            <label htmlFor="reset-email">Email Address</label>
            <input
              id="reset-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>

          {error && <p className="error-msg" style={{ marginTop: 12 }}>{error}</p>}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', marginTop: 16 }}
          >
            {loading ? 'Sending link…' : 'Send Recovery Link'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13 }}>
            <Link href="/login" style={{ color: 'var(--brand)', fontWeight: 600 }}>
              ← Back to Sign In
            </Link>
          </div>
        </form>
      )}
    </div>
  )
}
