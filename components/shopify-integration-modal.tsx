'use client'

import React, { useState, useEffect } from 'react'
import { Modal } from '@/components/modal'
import { ShopifyIcon } from '@/components/shopify-icon'

interface ShopifyIntegrationModalProps {
  isOpen: boolean
  onClose: () => void
  shop: {
    id: string
    name: string
    api_key?: string | null
    shopify_domain?: string | null
  }
  onOrderCreated?: (newOrder: any) => void
}

export function ShopifyIntegrationModal({
  isOpen,
  onClose,
  shop,
  onOrderCreated,
}: ShopifyIntegrationModalProps) {
  const [activeTab, setActiveTab] = useState<'auto' | 'manual'>('auto')
  const [apiKey, setApiKey] = useState(shop.api_key || '')
  const [domain, setDomain] = useState(shop.shopify_domain || '')
  const [accessToken, setAccessToken] = useState('')
  const [isAutoConnecting, setIsAutoConnecting] = useState(false)
  const [autoConnectMessage, setAutoConnectMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showTokenHelp, setShowTokenHelp] = useState(false)

  const [copied, setCopied] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Construct dynamic webhook URL based on current browser origin
  const [origin, setOrigin] = useState('')
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin)
    }
  }, [])

  // If shop.api_key is empty or missing, fetch or generate one
  useEffect(() => {
    if (isOpen && (!apiKey || apiKey === '')) {
      fetch(`/api/shops/shopify?shopId=${shop.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.api_key) {
            setApiKey(data.api_key)
          }
          if (data.shopify_domain) {
            setDomain(data.shopify_domain)
          }
        })
        .catch(err => console.error('Error fetching shopify credentials:', err))
    }
  }, [isOpen, shop.id, apiKey])

  const webhookUrl = `${origin || 'https://delivery.cedar.local'}/api/webhooks/shopify?shop_key=${apiKey || 'loading...'}`

  function handleCopyWebhook() {
    navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  // 1-Click Auto Connect via Admin API Access Token
  async function handleAutoConnect(e: React.FormEvent) {
    e.preventDefault()
    setAutoConnectMessage(null)
    setIsAutoConnecting(true)

    try {
      const res = await fetch('/api/shops/shopify/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: shop.id,
          shopifyDomain: domain.trim(),
          accessToken: accessToken.trim(),
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to auto-connect Shopify store.')

      if (data.shop?.api_key) setApiKey(data.shop.api_key)
      if (data.shop?.shopify_domain) setDomain(data.shop.shopify_domain)

      setAutoConnectMessage({
        type: 'success',
        text: data.message || '🎉 Connected! Webhook installed automatically in your Shopify store.',
      })
    } catch (err: unknown) {
      setAutoConnectMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error connecting to Shopify',
      })
    } finally {
      setIsAutoConnecting(false)
    }
  }

  async function handleSendTestOrder() {
    setIsTesting(true)
    setTestResult(null)

    const randomNum = Math.floor(1000 + Math.random() * 9000)
    const testPayload = {
      id: `test_shopify_${Date.now()}`,
      order_number: randomNum,
      name: `#${randomNum}`,
      total_price: '35.00',
      financial_status: 'pending',
      currency: 'USD',
      customer: {
        first_name: 'Ziad',
        last_name: 'Haddad',
        phone: '+961 70 889900',
        email: 'ziad.haddad@example.com',
      },
      shipping_address: {
        name: 'Ziad Haddad',
        phone: '+961 70 889900',
        address1: 'Hamra Main Street, Makdessi Bldg, 4th Fl',
        city: 'Beirut',
        province: 'Beirut',
        country: 'Lebanon',
      },
      line_items: [
        { title: 'Cedar Wooden Watch', quantity: 1, price: '25.00' },
        { title: 'Express Delivery Envelope', quantity: 1, price: '10.00' },
      ],
      note: 'Please call on arrival, elevator available.',
    }

    try {
      const res = await fetch(`/api/webhooks/shopify?shop_key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Shop-Domain': domain || 'test.myshopify.com',
        },
        body: JSON.stringify(testPayload),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Simulation failed')

      setTestResult({
        type: 'success',
        message: `🎉 Simulated order #${randomNum} received! Waybill Code: ${result.order?.code || 'CED-SHOP-TEST'}`,
      })

      if (onOrderCreated && result.order) {
        onOrderCreated(result.order)
      }
    } catch (err: unknown) {
      setTestResult({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error sending simulation',
      })
    } finally {
      setIsTesting(false)
    }
  }

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Shopify Store Integration">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, color: 'var(--text)' }}>
        {/* Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(149, 191, 71, 0.12) 0%, rgba(94, 142, 62, 0.05) 100%)',
            border: '1.5px solid #95BF47',
            borderRadius: 12,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              }}
            >
              <ShopifyIcon size={26} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: 16, color: 'var(--text)' }}>
                  Automate Deliveries from {shop.name}
                </strong>
                <span
                  style={{
                    fontSize: 11,
                    background: '#95BF47',
                    color: '#ffffff',
                    padding: '1px 8px',
                    borderRadius: 99,
                    fontWeight: 800,
                  }}
                >
                  LIVE
                </span>
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '2px 0 0' }}>
                Every order placed on Shopify automatically enters Cedar Delivery with a barcode waybill and assigned courier.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            background: 'var(--bg-subtle, rgba(0,0,0,0.03))',
            padding: 4,
            borderRadius: 10,
            border: '1px solid var(--line)',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('auto')}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: 'none',
              background: activeTab === 'auto' ? 'var(--surface)' : 'transparent',
              color: activeTab === 'auto' ? 'var(--text)' : 'var(--text-dim)',
              fontWeight: activeTab === 'auto' ? 700 : 500,
              fontSize: 13,
              cursor: 'pointer',
              boxShadow: activeTab === 'auto' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <span>⚡ 1-Click Auto-Connect</span>
            <span style={{ fontSize: 9.5, background: '#16a34a', color: '#fff', padding: '1px 5px', borderRadius: 999 }}>
              No copy-paste
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: 'none',
              background: activeTab === 'manual' ? 'var(--surface)' : 'transparent',
              color: activeTab === 'manual' ? 'var(--text)' : 'var(--text-dim)',
              fontWeight: activeTab === 'manual' ? 700 : 500,
              fontSize: 13,
              cursor: 'pointer',
              boxShadow: activeTab === 'manual' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <span>📋 Manual Webhook URL</span>
          </button>
        </div>

        {/* ─── TAB 1: 1-Click Auto-Connect with Token ─── */}
        {activeTab === 'auto' && (
          <form onSubmit={handleAutoConnect} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                Shopify Store URL (e.g. <code>my-brand.myshopify.com</code>)
              </label>
              <input
                type="text"
                value={domain}
                onChange={e => setDomain(e.target.value)}
                placeholder="your-store.myshopify.com"
                required
                style={{
                  width: '100%',
                  fontSize: 13,
                  padding: '9px 12px',
                  borderRadius: 6,
                  border: '1.5px solid var(--line)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Shopify Admin API Access Token
                </label>
                <button
                  type="button"
                  onClick={() => setShowTokenHelp(!showTokenHelp)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--brand)',
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {showTokenHelp ? 'Hide guide ▲' : 'Where do I find this? ▼'}
                </button>
              </div>

              <input
                type="password"
                value={accessToken}
                onChange={e => setAccessToken(e.target.value)}
                placeholder="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                required
                style={{
                  width: '100%',
                  fontSize: 13,
                  padding: '9px 12px',
                  borderRadius: 6,
                  border: '1.5px solid var(--line)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  fontFamily: 'monospace',
                }}
              />

              {showTokenHelp && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 12,
                    borderRadius: 8,
                    background: 'rgba(2, 132, 199, 0.05)',
                    border: '1px solid rgba(2, 132, 199, 0.2)',
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  <b>3 steps in Shopify Admin:</b>
                  <ol style={{ paddingLeft: 16, margin: '4px 0 0' }}>
                    <li>Settings ➔ Apps and sales channels ➔ Develop apps ➔ Create an app (Cedar Delivery)</li>
                    <li>Configuration ➔ Check <code>read_orders</code> and <code>write_orders</code></li>
                    <li>Install app ➔ Reveal & copy the token starting with <code>shpat_</code></li>
                  </ol>
                </div>
              )}
            </div>

            {autoConnectMessage && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  fontSize: 12.5,
                  fontWeight: 600,
                  background: autoConnectMessage.type === 'success' ? '#dcfce7' : '#fee2e2',
                  border: `1px solid ${autoConnectMessage.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
                  color: autoConnectMessage.type === 'success' ? '#15803d' : '#b91c1c',
                }}
              >
                {autoConnectMessage.text}
              </div>
            )}

            <button
              type="submit"
              disabled={isAutoConnecting}
              className="btn btn-primary"
              style={{
                padding: '11px',
                fontSize: 13.5,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <ShopifyIcon size={16} />
              <span>{isAutoConnecting ? 'Connecting & Installing Webhook…' : '⚡ Connect Store & Auto-Install Webhooks'}</span>
            </button>
          </form>
        )}

        {/* ─── TAB 2: Manual Webhook URL ─── */}
        {activeTab === 'manual' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Webhook URL Box */}
            <div style={{ background: 'var(--bg)', border: '1.5px solid var(--line)', borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text)' }}>
                  🔗 Your Cedar Shopify Webhook URL
                </label>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                  Secret Key: <code style={{ color: 'var(--brand)', fontWeight: 700 }}>{apiKey ? `${apiKey.slice(0, 14)}…` : 'Generating…'}</code>
                </span>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                <input
                  type="text"
                  readOnly
                  value={webhookUrl}
                  style={{
                    flex: 1,
                    fontSize: 12.5,
                    fontFamily: 'monospace',
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: 6,
                    padding: '8px 12px',
                    color: 'var(--brand)',
                    fontWeight: 700,
                  }}
                />
                <button
                  type="button"
                  onClick={handleCopyWebhook}
                  className={`btn btn-sm ${copied ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: 12, fontWeight: 700, minWidth: 100 }}
                >
                  {copied ? '✓ Copied!' : '📋 Copy URL'}
                </button>
              </div>
            </div>

            {/* Step-by-Step Setup Guide */}
            <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
              <h4 style={{ fontSize: 13, fontWeight: 800, margin: '0 0 8px', color: 'var(--text)' }}>
                Paste into Shopify Admin:
              </h4>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.6, color: 'var(--text)' }}>
                <li>Shopify Admin ➔ <strong>Settings</strong> ➔ <strong>Notifications</strong>.</li>
                <li>Scroll down to <strong>Webhooks</strong> ➔ <strong>Create webhook</strong>.</li>
                <li>Event: <code>Order creation</code> · Format: <code>JSON</code> · URL: Paste the copied URL above.</li>
                <li>Click <strong>Save</strong>!</li>
              </ol>
            </div>
          </div>
        )}

        {/* Test Webhook Button (Always accessible) */}
        <div
          style={{
            background: 'var(--bg)',
            border: '1px dashed var(--line)',
            borderRadius: 10,
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <strong style={{ fontSize: 13, display: 'block', color: 'var(--text)' }}>
              Test Your Shopify Integration
            </strong>
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
              Simulates a live Shopify customer checkout with Hamra, Beirut address and $35 COD.
            </span>
          </div>

          <button
            type="button"
            disabled={isTesting || !apiKey}
            onClick={handleSendTestOrder}
            className="btn btn-secondary btn-sm"
            style={{
              fontSize: 12.5,
              fontWeight: 800,
              padding: '8px 16px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <ShopifyIcon size={16} />
            <span>{isTesting ? 'Sending Simulation…' : '⚡ Send Test Shopify Order'}</span>
          </button>
        </div>

        {/* Test Result Toast */}
        {testResult && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 12.5,
              fontWeight: 700,
              background: testResult.type === 'success' ? '#064e3b' : '#7f1d1d',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{testResult.message}</span>
            <button
              type="button"
              onClick={() => setTestResult(null)}
              style={{ background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer', fontSize: 14 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Public Onboarding Link Notice */}
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            fontSize: 12,
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span>
            💡 <b>Need to onboard a new Shopify client?</b> Share our self-service page:
          </span>
          <a
            href="/shopify"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#4f46e5', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            /shopify ↗
          </a>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Done
          </button>
        </div>
      </div>
    </Modal>
  )
}
