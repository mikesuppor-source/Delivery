'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })

      if (updateError) {
        throw updateError
      }

      setSuccess(true)
      setTimeout(() => {
        router.push('/login')
      }, 2500)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="welcome" style={{ maxWidth: 420, margin: '60px auto', padding: '32px 24px' }}>
      <div className="brand-icon">
        <img src="/logo.png" alt="Cedar Delivery Desk" />
      </div>
      <h1>Set New Password</h1>
      <p>Enter your new password below.</p>

      {success ? (
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', padding: '16px', borderRadius: 8, marginTop: 20 }}>
          <p style={{ fontWeight: 700, marginBottom: 6 }}>✓ Password Updated Successfully!</p>
          <p style={{ fontSize: 13, lineHeight: 1.5 }}>
            Your account password has been updated. Redirecting to login…
          </p>
          <div style={{ marginTop: 14 }}>
            <Link href="/login" className="btn btn-primary btn-sm">
              Sign In Now
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleUpdatePassword} style={{ marginTop: 20 }}>
          <div className="field">
            <label htmlFor="new-password">New Password</label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              autoFocus
            />
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="confirm-password">Confirm New Password</label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          {error && <p className="error-msg" style={{ marginTop: 12 }}>{error}</p>}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', marginTop: 20 }}
          >
            {loading ? 'Updating password…' : 'Save New Password'}
          </button>
        </form>
      )}
    </div>
  )
}
