'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

import Link from 'next/link'

export default function LoginPage() {
  const supabase = createClient()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      // If user is a merchant, route straight to /portal
      if (data?.user?.user_metadata?.role === 'merchant') {
        router.push('/portal')
      } else {
        router.push('/')
      }
      router.refresh()
    }
  }

  return (
    <div className="welcome">
      <div className="brand-icon">
        <img src="/logo.png" alt="Cedar Delivery Desk" />
      </div>
      <h1>Cedar Delivery</h1>
      <p>Sign in to your delivery desk or store account.</p>

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>

        {error && <p className="error-msg">{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {/* Store & Merchant Quick Switcher Box */}
      <div
        style={{
          marginTop: 24,
          paddingTop: 18,
          borderTop: '1px solid var(--line)',
          textAlign: 'center',
          fontSize: 12.5,
        }}
      >
        <p style={{ color: 'var(--muted)', marginBottom: 8 }}>
          <strong>Are you a Store or Online Merchant?</strong>
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
          <Link
            href="/portal/login"
            style={{ color: 'var(--brand)', fontWeight: 700 }}
          >
            Merchant Sign In
          </Link>
          <span style={{ color: 'var(--line)' }}>•</span>
          <Link
            href="/portal/signup"
            style={{ color: 'var(--brand)', fontWeight: 700 }}
          >
            Register Your Store →
          </Link>
        </div>
      </div>
    </div>
  )
}
