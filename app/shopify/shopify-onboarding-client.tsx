'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ShopifyIcon } from '@/components/shopify-icon'
import { isValidLebanesePhone, formatLebanesePhone } from '@/lib/phone'
import { createClient } from '@/lib/supabase/client'

export function ShopifyOnboardingClient() {
  const router = useRouter()

  // Form Fields
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [connectMode, setConnectMode] = useState<'auto' | 'webhook'>('auto')
  const [shopName, setShopName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [shopifyDomain, setShopifyDomain] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [prefix, setPrefix] = useState('')

  // State
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectedData, setConnectedData] = useState<any>(null)
  const [showTokenHelp, setShowTokenHelp] = useState(false)
  const [testOrderLoading, setTestOrderLoading] = useState(false)
  const [testOrderSuccess, setTestOrderSuccess] = useState<string | null>(null)

  const isPhoneValid = phone ? isValidLebanesePhone(phone) : null

  // Clean domain on blur
  function handleDomainBlur() {
    let clean = shopifyDomain.trim().toLowerCase()
    clean = clean.replace(/^https?:\/\//, '')
    clean = clean.replace(/\/.*$/, '')
    if (clean && !clean.includes('.')) {
      clean = `${clean}.myshopify.com`
    }
    setShopifyDomain(clean)
  }

  // Handle Step 1 Validation
  function handleNextStep(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!shopName.trim()) {
      setError('Please enter your Store or Brand Name.')
      return
    }
    if (!email.trim() || !password) {
      setError('Email and password are required for your Merchant Portal access.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (phone && !isValidLebanesePhone(phone)) {
      setError('Please enter a valid Lebanese phone number (e.g. +961 70 123456 or 03 123456).')
      return
    }

    setStep(2)
  }

  // Handle Shopify Connection
  async function handleConnectShopify(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!shopifyDomain.trim()) {
      setError('Please enter your Shopify store URL (e.g. yourstore.myshopify.com).')
      return
    }

    if (connectMode === 'auto' && !accessToken.trim()) {
      setError('Please paste your Shopify Admin API Access Token, or switch to the Manual Webhook tab.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/shops/shopify/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopName: shopName.trim(),
          phone: phone ? formatLebanesePhone(phone) : null,
          address: address.trim(),
          email: email.trim(),
          password,
          shopifyDomain: shopifyDomain.trim(),
          accessToken: connectMode === 'auto' ? accessToken.trim() : undefined,
          prefix: prefix.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to connect Shopify store.')
      }

      setConnectedData(data)
      setStep(3)

      // Sign user into supabase session automatically
      const supabase = createClient()
      await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Connection failed. Please check your details.')
    } finally {
      setLoading(false)
    }
  }

  // Send Live Test Order
  async function handleSendTestOrder() {
    if (!connectedData?.shop?.api_key) return
    setTestOrderLoading(true)
    setTestOrderSuccess(null)
    setError(null)

    try {
      const sampleShopifyPayload = {
        id: Math.floor(1000000000 + Math.random() * 9000000000),
        order_number: Math.floor(1000 + Math.random() * 9000),
        created_at: new Date().toISOString(),
        financial_status: 'pending',
        currency: 'USD',
        total_price: '42.00',
        customer: {
          first_name: 'Karim',
          last_name: 'El-Khoury',
          phone: '+961 71 890123',
          email: 'karim@example.com',
        },
        shipping_address: {
          name: 'Karim El-Khoury',
          phone: '+961 71 890123',
          address1: 'Rue Monot, Saint Joseph Bldg, 2nd Fl',
          city: 'Beirut',
          province: 'Beirut',
          country: 'Lebanon',
        },
        line_items: [
          { title: 'Oversized Linen Shirt (Olive / L)', quantity: 1, price: '30.00' },
          { title: 'Leather Cardholder (Black)', quantity: 1, price: '12.00' },
        ],
        note: 'Please call recipient before delivery. Ring bell 2B.',
      }

      const res = await fetch(`/api/webhooks/shopify?shop_key=${connectedData.shop.api_key}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Shop-Domain': connectedData.shop.shopify_domain || 'test.myshopify.com',
        },
        body: JSON.stringify(sampleShopifyPayload),
      })

      const testResult = await res.json()
      if (!res.ok) throw new Error(testResult.error || 'Failed to send test order')

      setTestOrderSuccess(
        `🎉 Success! Test order #${sampleShopifyPayload.order_number} received! Waybill Code: ${testResult.order?.code || 'Generated'}`
      )
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to simulate test order')
    } finally {
      setTestOrderLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 16px 80px' }}>
      {/* ─── Hero Header ─── */}
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 18px',
            background: 'rgba(150, 191, 54, 0.12)',
            borderRadius: 999,
            border: '1px solid rgba(150, 191, 54, 0.3)',
            marginBottom: 16,
          }}
        >
          <ShopifyIcon size={20} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#5e8e3e' }}>
            Official Shopify Delivery Connector for Lebanon
          </span>
        </div>

        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.6px', marginBottom: 12, color: 'var(--text)' }}>
          Connect Your Shopify Store to Cedar Delivery
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-dim)', maxWidth: 580, margin: '0 auto', lineHeight: 1.6 }}>
          Automate all your e-commerce shipping in Lebanon. Instant courier dispatch, cash on delivery (COD) in USD & LBP,
          barcode waybills, and live customer tracking.
        </p>

        {/* Stepper Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: step >= 1 ? 'var(--brand)' : 'var(--line)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              1
            </span>
            <span style={{ fontSize: 13, fontWeight: step === 1 ? 700 : 500, color: step === 1 ? 'var(--text)' : 'var(--text-dim)' }}>
              Store Profile
            </span>
          </div>

          <div style={{ width: 32, height: 2, background: step >= 2 ? 'var(--brand)' : 'var(--line)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: step >= 2 ? 'var(--brand)' : 'var(--line)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              2
            </span>
            <span style={{ fontSize: 13, fontWeight: step === 2 ? 700 : 500, color: step === 2 ? 'var(--text)' : 'var(--text-dim)' }}>
              Shopify Sync
            </span>
          </div>

          <div style={{ width: 32, height: 2, background: step >= 3 ? 'var(--brand)' : 'var(--line)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: step >= 3 ? '#16a34a' : 'var(--line)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ✓
            </span>
            <span style={{ fontSize: 13, fontWeight: step === 3 ? 700 : 500, color: step === 3 ? 'var(--text)' : 'var(--text-dim)' }}>
              Ready to Deliver
            </span>
          </div>
        </div>
      </div>

      {/* ─── Main Card ─── */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1.5px solid var(--line)',
          borderRadius: 20,
          padding: '36px 32px',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {error && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 10,
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 20,
              lineHeight: 1.5,
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* ─── STEP 1: Store & Contact Details ─── */}
        {step === 1 && (
          <form onSubmit={handleNextStep}>
            <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>
              Step 1: Your Store & Contact Details
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 22 }}>
              These details are used for courier package pickup and your Cedar Merchant Portal account.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Brand / Store Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Beirut Apparel, Cedar Perfumes"
                  value={shopName}
                  onChange={e => setShopName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1.5px solid var(--line)',
                    background: 'var(--surface-input, transparent)',
                    color: 'var(--text)',
                    fontSize: 14,
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    WhatsApp / Contact Phone <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. +961 70 123456"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1.5px solid ${isPhoneValid === false ? '#ef4444' : 'var(--line)'}`,
                      background: 'var(--surface-input, transparent)',
                      color: 'var(--text)',
                      fontSize: 14,
                    }}
                  />
                  {isPhoneValid === false && (
                    <small style={{ color: '#ef4444', fontSize: 11, marginTop: 4, display: 'block' }}>
                      Enter a valid Lebanese phone (+961 or 03/70/71/76/81)
                    </small>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    Waybill Prefix (Optional)
                  </label>
                  <input
                    type="text"
                    maxLength={5}
                    placeholder="e.g. BEY, OAK (defaults to SHP)"
                    value={prefix}
                    onChange={e => setPrefix(e.target.value.toUpperCase())}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: '1.5px solid var(--line)',
                      background: 'var(--surface-input, transparent)',
                      color: 'var(--text)',
                      fontSize: 14,
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Store Pickup Address in Lebanon
                </label>
                <input
                  type="text"
                  placeholder="e.g. Achrafieh, Sassine Square, Bldg 14, 2nd Fl"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1.5px solid var(--line)',
                    background: 'var(--surface-input, transparent)',
                    color: 'var(--text)',
                    fontSize: 14,
                  }}
                />
              </div>

              <div style={{ height: 1, background: 'var(--line)', margin: '8px 0' }} />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    Merchant Portal Email <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="store@yourbrand.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: '1.5px solid var(--line)',
                      background: 'var(--surface-input, transparent)',
                      color: 'var(--text)',
                      fontSize: 14,
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    Create Password <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={6}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: '1.5px solid var(--line)',
                      background: 'var(--surface-input, transparent)',
                      color: 'var(--text)',
                      fontSize: 14,
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <Link href="/portal/login" style={{ fontSize: 13, color: 'var(--brand)', textDecoration: 'none' }}>
                  Already have an account? Sign in →
                </Link>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ padding: '11px 26px', fontSize: 14, fontWeight: 700 }}
                >
                  Next: Shopify Setup →
                </button>
              </div>
            </div>
          </form>
        )}

        {/* ─── STEP 2: Shopify Connection ─── */}
        {step === 2 && (
          <form onSubmit={handleConnectShopify}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 4, color: 'var(--text)' }}>
                  Step 2: Connect Your Shopify Store
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                  Choose how you want Cedar Delivery to link to your Shopify store.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setStep(1)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-dim)',
                  fontSize: 13,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                ← Back
              </button>
            </div>

            {/* Mode Selector Tabs */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                background: 'var(--bg-subtle, rgba(0,0,0,0.03))',
                padding: 4,
                borderRadius: 12,
                border: '1px solid var(--line)',
                marginBottom: 24,
              }}
            >
              <button
                type="button"
                onClick={() => setConnectMode('auto')}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: connectMode === 'auto' ? 'var(--surface)' : 'transparent',
                  color: connectMode === 'auto' ? 'var(--text)' : 'var(--text-dim)',
                  fontWeight: connectMode === 'auto' ? 700 : 500,
                  fontSize: 13,
                  cursor: 'pointer',
                  boxShadow: connectMode === 'auto' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <span>⚡ 1-Click Auto-Connect</span>
                <span style={{ fontSize: 10, background: '#16a34a', color: '#fff', padding: '1px 6px', borderRadius: 999 }}>
                  Recommended
                </span>
              </button>

              <button
                type="button"
                onClick={() => setConnectMode('webhook')}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: connectMode === 'webhook' ? 'var(--surface)' : 'transparent',
                  color: connectMode === 'webhook' ? 'var(--text)' : 'var(--text-dim)',
                  fontWeight: connectMode === 'webhook' ? 700 : 500,
                  fontSize: 13,
                  cursor: 'pointer',
                  boxShadow: connectMode === 'webhook' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <span>📋 Manual Webhook</span>
              </button>
            </div>

            {/* Shopify Store URL */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Shopify Store URL <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="e.g. your-brand.myshopify.com"
                  value={shopifyDomain}
                  onChange={e => setShopifyDomain(e.target.value)}
                  onBlur={handleDomainBlur}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 38px',
                    borderRadius: 8,
                    border: '1.5px solid var(--line)',
                    background: 'var(--surface-input, transparent)',
                    color: 'var(--text)',
                    fontSize: 14,
                  }}
                />
                <div style={{ position: 'absolute', left: 12, top: 11 }}>
                  <ShopifyIcon size={16} />
                </div>
              </div>
              <small style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 4, display: 'block' }}>
                Enter your <code style={{ color: 'var(--brand)' }}>.myshopify.com</code> handle or custom domain.
              </small>
            </div>

            {/* Mode A: Auto-Connect via Access Token */}
            {connectMode === 'auto' && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>
                    Shopify Admin API Access Token <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowTokenHelp(!showTokenHelp)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--brand)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {showTokenHelp ? 'Hide guide ▲' : 'Where do I find this? (3 steps) ▼'}
                  </button>
                </div>

                <input
                  type="password"
                  placeholder="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={accessToken}
                  onChange={e => setAccessToken(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1.5px solid var(--line)',
                    background: 'var(--surface-input, transparent)',
                    color: 'var(--text)',
                    fontSize: 14,
                    fontFamily: 'monospace',
                  }}
                />

                {/* Collapsible Token Guide */}
                {showTokenHelp && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 16,
                      borderRadius: 12,
                      background: 'rgba(2, 132, 199, 0.05)',
                      border: '1px solid rgba(2, 132, 199, 0.2)',
                      fontSize: 12.5,
                      lineHeight: 1.6,
                      color: 'var(--text)',
                    }}
                  >
                    <b style={{ color: '#0284c7', display: 'block', marginBottom: 6 }}>
                      How to get your Shopify Token in 60 seconds:
                    </b>
                    <ol style={{ paddingLeft: 18, margin: 0 }}>
                      <li>
                        In Shopify Admin, go to <b>Settings ⚙️</b> → <b>Apps and sales channels</b>.
                      </li>
                      <li>
                        Click <b>Develop apps</b> → <b>Create an app</b> (name it <i>Cedar Delivery</i>).
                      </li>
                      <li>
                        Under <b>Configuration</b>, grant <b>Admin API scopes</b>: check <code>read_orders</code> and{' '}
                        <code>write_orders</code>.
                      </li>
                      <li>
                        Click <b>Install app</b>, then click <b>Reveal token once</b> and copy the token starting with{' '}
                        <code>shpat_</code>.
                      </li>
                    </ol>
                    <small style={{ color: 'var(--text-dim)', marginTop: 8, display: 'block' }}>
                      Cedar Delivery uses this token securely to automatically install the delivery webhook without you touching code.
                    </small>
                  </div>
                )}
              </div>
            )}

            {/* Mode B: Manual Webhook Explanation */}
            {connectMode === 'webhook' && (
              <div
                style={{
                  marginBottom: 20,
                  padding: 16,
                  borderRadius: 12,
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  fontSize: 12.5,
                  color: 'var(--text)',
                  lineHeight: 1.6,
                }}
              >
                <b style={{ color: '#d97706', display: 'block', marginBottom: 4 }}>
                  No Token Needed:
                </b>
                Click <b>Create Account & Get Webhook</b> below. You will receive your dedicated Cedar Delivery Webhook URL
                to paste once into your Shopify Admin under <i>Settings → Notifications → Webhooks</i>.
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '13px',
                fontSize: 15,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <ShopifyIcon size={18} />
              <span>
                {loading
                  ? 'Connecting to Shopify...'
                  : connectMode === 'auto'
                  ? '⚡ Connect Store & Auto-Install Webhook'
                  : 'Register Store & Get Webhook URL →'}
              </span>
            </button>
          </form>
        )}

        {/* ─── STEP 3: Success & Verification ─── */}
        {step === 3 && connectedData && (
          <div style={{ textAlign: 'center', padding: '12px 4px' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: '#dcfce7',
                color: '#16a34a',
                fontSize: 32,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
                boxShadow: '0 4px 14px rgba(22, 163, 74, 0.25)',
              }}
            >
              ✓
            </div>

            <h2 style={{ fontSize: 23, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>
              {connectedData.shopify_store?.name || connectedData.shop?.name} is Connected!
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-dim)', maxWidth: 520, margin: '0 auto 24px', lineHeight: 1.5 }}>
              {connectedData.message || 'Your Shopify store is now officially integrated with Cedar Delivery.'}
            </p>

            {/* Connection Credentials Card */}
            <div
              style={{
                background: 'var(--bg-subtle, rgba(0,0,0,0.03))',
                border: '1px solid var(--line)',
                borderRadius: 14,
                padding: '18px 20px',
                textAlign: 'left',
                marginBottom: 24,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Store Domain:</span>
                <b style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'monospace' }}>
                  {connectedData.shop?.shopify_domain}
                </b>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Webhook Status:</span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    color: connectedData.webhook_installed ? '#16a34a' : '#d97706',
                    background: connectedData.webhook_installed ? '#dcfce7' : '#fef3c7',
                    padding: '2px 8px',
                    borderRadius: 999,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: connectedData.webhook_installed ? '#16a34a' : '#d97706',
                    }}
                  />
                  {connectedData.webhook_installed ? 'Installed & Active' : 'Manual Setup Required'}
                </span>
              </div>

              {!connectedData.webhook_installed && connectedData.webhook_url && (
                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                    Your Webhook URL (Paste into Shopify Notifications):
                  </label>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 4,
                      background: 'var(--surface)',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--line)',
                    }}
                  >
                    <input
                      type="text"
                      readOnly
                      value={connectedData.webhook_url}
                      style={{
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text)',
                        fontSize: 12,
                        fontFamily: 'monospace',
                        outline: 'none',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(connectedData.webhook_url)
                        alert('Webhook URL copied to clipboard!')
                      }}
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: 11 }}
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Test Order Simulator Alert */}
            {testOrderSuccess && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 10,
                  background: '#dcfce7',
                  border: '1px solid #bbf7d0',
                  color: '#15803d',
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 20,
                  textAlign: 'left',
                }}
              >
                {testOrderSuccess}
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleSendTestOrder}
                disabled={testOrderLoading}
                className="btn btn-secondary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '12px 20px',
                  fontSize: 14,
                  fontWeight: 700,
                  borderColor: 'rgba(150, 191, 54, 0.4)',
                }}
              >
                <span>⚡</span>
                <span>{testOrderLoading ? 'Simulating order…' : 'Send Test Shopify Order'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  router.push('/portal')
                  router.refresh()
                }}
                className="btn btn-primary"
                style={{ padding: '12px 26px', fontSize: 14, fontWeight: 700 }}
              >
                Go to Merchant Portal Dashboard →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Feature Highlights Footer ─── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 20,
          marginTop: 40,
        }}
      >
        <div style={{ textAlign: 'center', padding: '16px' }}>
          <div style={{ fontSize: 26, marginBottom: 8 }}>🚚</div>
          <b style={{ fontSize: 14, display: 'block', marginBottom: 4, color: 'var(--text)' }}>
            All-Lebanon Coverage
          </b>
          <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0, lineHeight: 1.5 }}>
            Beirut, Metn, Keserwan, North, South & Bekaa with automated courier dispatch.
          </p>
        </div>

        <div style={{ textAlign: 'center', padding: '16px' }}>
          <div style={{ fontSize: 26, marginBottom: 8 }}>💵</div>
          <b style={{ fontSize: 14, display: 'block', marginBottom: 4, color: 'var(--text)' }}>
            Dual-Currency COD
          </b>
          <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0, lineHeight: 1.5 }}>
            Collect Cash on Delivery in USD or LBP with live market exchange rate settlements.
          </p>
        </div>

        <div style={{ textAlign: 'center', padding: '16px' }}>
          <div style={{ fontSize: 26, marginBottom: 8 }}>🏷️</div>
          <b style={{ fontSize: 14, display: 'block', marginBottom: 4, color: 'var(--text)' }}>
            Instant Barcode Waybills
          </b>
          <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0, lineHeight: 1.5 }}>
            Generate thermal stickers & standard waybills ready to stick on customer parcels.
          </p>
        </div>
      </div>
    </div>
  )
}
