'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function PortalLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeUserEmail, setActiveUserEmail] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) {
        setActiveUserEmail(data.user.email)
      }
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError(authError.message || 'Invalid email or password.')
      setLoading(false)
      return
    }

    router.push('/portal')
    router.refresh()
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: '24px 16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--surface)',
          border: '1.5px solid var(--line)',
          borderRadius: 16,
          padding: '36px 32px',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              width: 56,
              height: 56,
              margin: '0 auto 14px',
              borderRadius: 14,
              background: 'var(--brand-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--line)',
            }}
          >
            <img src="/logo.png" alt="Cedar Delivery" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          </div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '1.5px',
              color: 'var(--brand)',
              textTransform: 'uppercase',
              display: 'block',
              marginBottom: 4,
            }}
          >
            Store & Client Partner Portal
          </span>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>
            Merchant & Client Sign In
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            Place orders, schedule courier pickups, print barcode waybills, and track deliveries.
          </p>
        </div>

        {activeUserEmail && (
          <div
            style={{
              background: 'var(--brand-light)',
              border: '1.5px solid var(--brand)',
              borderRadius: 8,
              padding: '12px 14px',
              fontSize: 12.5,
              marginBottom: 18,
              textAlign: 'center',
            }}
          >
            <span style={{ color: 'var(--muted)', display: 'block' }}>Signed in as:</span>
            <strong style={{ color: 'var(--brand)', display: 'block', fontSize: 13, marginBottom: 8 }}>
              {activeUserEmail}
            </strong>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <Link href="/portal" className="btn btn-primary btn-sm" style={{ fontSize: 11, padding: '4px 12px' }}>
                Open Store Portfolio →
              </Link>
              <button
                type="button"
                onClick={async () => {
                  const supabase = createClient()
                  await supabase.auth.signOut()
                  setActiveUserEmail(null)
                }}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: 11, padding: '4px 8px' }}
              >
                Sign out
              </button>
            </div>
          </div>
        )}

        {error && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 12.5,
              marginBottom: 20,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label htmlFor="portal-email" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              Email Address
            </label>
            <input
              id="portal-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1.5px solid var(--line)',
                fontSize: 14,
              }}
            />
          </div>

          <div>
            <label htmlFor="portal-password" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              Password
            </label>
            <input
              id="portal-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1.5px solid var(--line)',
                fontSize: 14,
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{
              width: '100%',
              padding: '12px',
              fontSize: 14,
              fontWeight: 700,
              marginTop: 6,
              borderRadius: 8,
            }}
          >
            {loading ? 'Signing in…' : 'Sign in to Delivery Portfolio'}
          </button>
        </form>

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--line)', textAlign: 'center', fontSize: 13 }}>
          <p style={{ color: 'var(--muted)', marginBottom: 12 }}>
            Don&apos;t have an account yet?{' '}
            <Link href="/portal/signup" style={{ color: 'var(--brand)', fontWeight: 700 }}>
              Register Store or Client Account →
            </Link>
          </p>

          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', fontSize: 12, flexWrap: 'wrap' }}>
            <Link href="/track" style={{ color: 'var(--muted)' }}>
              Looking to track a package?
            </Link>
            <span style={{ color: 'var(--line)' }}>•</span>
            <Link href="/login" style={{ color: 'var(--muted)' }}>
              Switch to Cedar Desk Dispatcher Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
