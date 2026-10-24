'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { isValidLebanesePhone } from '@/lib/phone'

export default function PortalSignupPage() {
  const router = useRouter()
  const [shopName, setShopName] = useState('')
  const [prefix, setPrefix] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const isPhoneValid = phone ? isValidLebanesePhone(phone) : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (phone && !isValidLebanesePhone(phone)) {
      setError('Please provide a valid Lebanese mobile or telephone number (+961 or 03/70/71/76/81).')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/portal/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopName,
          prefix: prefix || null,
          phone,
          address,
          email,
          password,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to register store.')
      }

      // Auto sign-in with credentials
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        // If signIn fails, redirect to login with prefill
        router.push('/portal/login')
        return
      }

      router.push('/portal')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: '32px 16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          background: 'var(--surface)',
          border: '1.5px solid var(--line)',
          borderRadius: 16,
          padding: '36px 32px',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div
            style={{
              width: 56,
              height: 56,
              margin: '0 auto 12px',
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
            Merchant & Store Registration
          </span>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>
            Register Your Store
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            Start creating delivery orders, printing scannable barcode waybills, and tracking your client payouts.
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
            <label htmlFor="shop-name" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              Store or Business Name *
            </label>
            <input
              id="shop-name"
              type="text"
              value={shopName}
              onChange={e => setShopName(e.target.value)}
              placeholder="e.g. Bella Boutique, TechStore Beirut"
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label htmlFor="shop-prefix" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                Barcode Prefix (Optional)
              </label>
              <input
                id="shop-prefix"
                type="text"
                value={prefix}
                onChange={e => setPrefix(e.target.value.toUpperCase().slice(0, 5))}
                placeholder="e.g. BLL, ZARA"
                maxLength={5}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1.5px solid var(--line)',
                  fontSize: 14,
                  textTransform: 'uppercase',
                  fontFamily: 'monospace',
                }}
              />
              <small style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginTop: 4 }}>
                Waybill ID: <code>{prefix || 'CD'}-XXXXXX</code>
              </small>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label htmlFor="shop-phone" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block' }}>
                  Store WhatsApp / Phone
                </label>
                {isPhoneValid !== null && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: isPhoneValid ? '#059669' : '#dc2626' }}>
                    {isPhoneValid ? '✓ Valid' : '⚠️ Invalid'}
                  </span>
                )}
              </div>
              <input
                id="shop-phone"
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="e.g. 70 123456 or +961 3..."
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: `1.5px solid ${isPhoneValid === false ? '#f87171' : 'var(--line)'}`,
                  fontSize: 14,
                }}
              />
            </div>
          </div>

          <div>
            <label htmlFor="shop-address" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              Store Pickup Address / Location
            </label>
            <input
              id="shop-address"
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="e.g. Mar Mikhael, Main St., Bldg 4, 1st floor"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1.5px solid var(--line)',
                fontSize: 14,
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label htmlFor="shop-email" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                Email Address *
              </label>
              <input
                id="shop-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="owner@boutique.com"
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

            <div>
              <label htmlFor="shop-pwd" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                Password *
              </label>
              <input
                id="shop-pwd"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                required
                minLength={6}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1.5px solid var(--line)',
                  fontSize: 14,
                }}
              />
            </div>
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
              marginTop: 8,
              borderRadius: 8,
            }}
          >
            {loading ? 'Creating Store Profile…' : 'Register Store & Access Portal →'}
          </button>
        </form>

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--line)', textAlign: 'center', fontSize: 13 }}>
          <p style={{ color: 'var(--muted)', marginBottom: 8 }}>
            Already registered?{' '}
            <Link href="/portal/login" style={{ color: 'var(--brand)', fontWeight: 700 }}>
              Sign In to Merchant Portal
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
