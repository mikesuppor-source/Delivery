'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TruckIcon } from '@/components/icons'
import { WhatsAppIcon } from '@/components/whatsapp-icon'

export function DriverLoginClient() {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/driver/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to sign in')
      }

      // Save locally as well
      try {
        localStorage.setItem('cedar_saved_driver_id', data.driverId)
      } catch (_e) {
        void _e
      }

      // Redirect immediately to driver's run sheet
      router.push(`/driver/${data.driverId}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid phone number or PIN')
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#090d16',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* App Logo & Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
              color: '#ffffff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
              boxShadow: '0 8px 28px rgba(16, 185, 129, 0.35)',
            }}
          >
            <TruckIcon size={32} color="#ffffff" />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.4px', color: '#ffffff' }}>
            Courier Sign In
          </h1>
          <p style={{ margin: '8px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
            Enter your mobile number and 4-digit PIN to access your daily run sheet
          </p>
        </div>

        {/* Login Card */}
        <div
          style={{
            background: '#131b2e',
            border: '1px solid #1e293b',
            borderRadius: 16,
            padding: '28px 24px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
          }}
        >
          {error && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #ef4444',
                color: '#fca5a5',
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 600,
                marginBottom: 18,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Phone Input */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#cbd5e1',
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                }}
              >
                Mobile Phone Number
              </label>
              <div style={{ position: 'relative' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#64748b',
                  }}
                >
                  +961
                </span>
                <input
                  type="tel"
                  required
                  placeholder="71 897 654"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 14px 12px 58px',
                    background: '#090d16',
                    border: '1.5px solid #334155',
                    borderRadius: 10,
                    color: '#ffffff',
                    fontSize: 15,
                    fontWeight: 600,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* PIN Input */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#cbd5e1',
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                }}
              >
                4-Digit Driver PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                required
                placeholder="••••"
                value={pin}
                onChange={e => setPin(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  background: '#090d16',
                  border: '1.5px solid #334155',
                  borderRadius: 10,
                  color: '#ffffff',
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: '4px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>
                Your PIN is given to you by dispatch
              </span>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? '#047857' : '#10b981',
                color: '#ffffff',
                border: 'none',
                padding: '14px',
                borderRadius: 10,
                fontSize: 15,
                fontWeight: 800,
                cursor: loading ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginTop: 6,
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
              }}
            >
              {loading ? (
                <span>Verifying credentials…</span>
              ) : (
                <>
                  <TruckIcon size={18} color="#ffffff" />
                  <span>Open My Run Sheet</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Help Link */}
          <div
            style={{
              marginTop: 22,
              paddingTop: 18,
              borderTop: '1px solid #1e293b',
              textAlign: 'center',
            }}
          >
            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
              Forgot your PIN or need help?
            </p>
            <a
              href="https://wa.me/96170000000?text=Hello%20Dispatch,%20I%20am%20a%20Cedar%20courier%20and%20need%20my%20driver%20login%20PIN."
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12.5,
                fontWeight: 700,
                color: '#25D366',
                textDecoration: 'none',
                marginTop: 6,
              }}
            >
              <WhatsAppIcon size={14} color="#25D366" />
              <span>Contact Dispatch on WhatsApp</span>
            </a>
          </div>
        </div>

        {/* PWA Home Screen Tip */}
        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11.5, color: '#64748b' }}>
          Tip: Tap Share $\rightarrow$ <strong>Add to Home Screen</strong> on your phone to keep the Courier App ready.
        </div>
      </div>
    </div>
  )
}
