'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function PortalLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
            Store & Merchant Partner Portal
          </span>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>
            Merchant Sign In
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            Place customer orders, print barcode waybills, and track cash-on-delivery payouts.
          </p>
        </div>

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
              Store Email Address
            </label>
            <input
              id="portal-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="store@example.com"
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
            {loading ? 'Signing in…' : 'Sign in to Merchant Portfolio'}
          </button>
        </form>

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--line)', textAlign: 'center', fontSize: 13 }}>
          <p style={{ color: 'var(--muted)', marginBottom: 12 }}>
            Don&apos;t have a merchant account yet?{' '}
            <Link href="/portal/signup" style={{ color: 'var(--brand)', fontWeight: 700 }}>
              Register Your Store →
            </Link>
          </p>

          <Link href="/login" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'underline' }}>
            Switch to Cedar Desk Dispatcher Login
          </Link>
        </div>
      </div>
    </div>
  )
}
