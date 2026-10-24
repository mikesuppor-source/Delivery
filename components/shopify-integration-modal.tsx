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
  const [apiKey, setApiKey] = useState(shop.api_key || '')
  const [domain, setDomain] = useState(shop.shopify_domain || '')
  const [copied, setCopied] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isSavingDomain, setIsSavingDomain] = useState(false)
  const [domainSaved, setDomainSaved] = useState(false)

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

  async function handleSaveDomain(e: React.FormEvent) {
    e.preventDefault()
    setIsSavingDomain(true)
    setDomainSaved(false)
    try {
      const res = await fetch('/api/shops/shopify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: shop.id,
          shopifyDomain: domain.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save domain')
      setDomainSaved(true)
      setTimeout(() => setDomainSaved(false), 3000)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error updating shopify domain')
    } finally {
      setIsSavingDomain(false)
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
      payment_gateway_names: ['Cash on Delivery (COD)'],
      shipping_address: {
        name: 'Ahmad Kanso (Test Customer)',
        phone: '70123456',
        address1: 'Hamra Main Street, Makdisi Bldg, 3rd Floor',
        city: 'Beirut',
        province: 'Beirut',
        country: 'Lebanon',
      },
      line_items: [
        { title: 'Lebanese Cedar Hoodie', quantity: 1, variant_title: 'Black / L' },
        { title: 'Beirut Street T-Shirt', quantity: 1, variant_title: 'White / M' },
      ],
      note: 'Please call before arriving, customer has $50 note.',
    }

    try {
      const res = await fetch(`/api/webhooks/shopify?shop_key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Topic': 'orders/create',
        },
        body: JSON.stringify(testPayload),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Test order webhook failed')
      }

      setTestResult({
        type: 'success',
        message: `✓ Success! Created order #${data.order?.code || randomNum} ($${data.order?.collection_usd}) in Cedar Delivery.`,
      })

      if (onOrderCreated && data.order) {
        onOrderCreated(data.order)
      }
    } catch (err: unknown) {
      setTestResult({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error testing webhook',
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
                Every customer order placed on your Shopify store automatically appears in Cedar Delivery with a printable barcode waybill and assigned driver.
              </p>
            </div>
          </div>
        </div>

        {/* Webhook URL Box */}
        <div style={{ background: 'var(--bg)', border: '1.5px solid var(--line)', borderRadius: 10, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text)' }}>
              🔗 Your Cedar Shopify Webhook URL
            </label>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              Secret API Key: <code style={{ color: 'var(--brand)', fontWeight: 700 }}>{apiKey ? `${apiKey.slice(0, 14)}…` : 'Generating…'}</code>
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
          <small style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, display: 'block' }}>
            🔒 Keep this URL private. It allows Shopify to safely deliver customer orders directly into your account.
          </small>
        </div>

        {/* Step-by-Step Setup Guide */}
        <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}>
          <h4 style={{ fontSize: 13.5, fontWeight: 800, margin: '0 0 10px', color: 'var(--text)' }}>
            Quick 4-Step Setup in Shopify Admin:
          </h4>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, lineHeight: 1.6, color: 'var(--text)' }}>
            <li>
              Log in to your <strong>Shopify Admin</strong> dashboard (e.g. <code>your-store.myshopify.com/admin</code>).
            </li>
            <li>
              Click on <strong>Settings</strong> (bottom-left gear icon) ➔ <strong>Notifications</strong>.
            </li>
            <li>
              Scroll all the way down to the <strong>Webhooks</strong> section and click <strong>Create webhook</strong>.
            </li>
            <li>
              Configure the webhook with:
              <div
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--line)',
                  borderRadius: 6,
                  padding: '8px 12px',
                  margin: '6px 0',
                  fontSize: 12,
                }}
              >
                <div>• <strong>Event:</strong> <code>Order creation</code> (or <code>Order payment</code>)</div>
                <div>• <strong>Format:</strong> <code>JSON</code></div>
                <div>• <strong>URL:</strong> Paste your copied Cedar Webhook URL above</div>
                <div>• <strong>Webhook API version:</strong> Latest (default)</div>
              </div>
            </li>
            <li>
              Click <strong>Save</strong>! You&apos;re all set — any new order will arrive in Cedar Delivery within 1 second.
            </li>
          </ol>
        </div>

        {/* Optional: Store Domain */}
        <form onSubmit={handleSaveDomain} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
              Shopify Store Domain (Optional, e.g. <code>beirut-boutique.myshopify.com</code>)
            </label>
            <input
              type="text"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="e.g. your-store.myshopify.com"
              style={{ width: '100%', fontSize: 12, padding: '7px 10px' }}
            />
          </div>
          <button
            type="submit"
            disabled={isSavingDomain}
            className="btn btn-secondary btn-sm"
            style={{ alignSelf: 'flex-end', height: 34, fontSize: 12 }}
          >
            {isSavingDomain ? 'Saving…' : domainSaved ? '✓ Saved!' : 'Save Domain'}
          </button>
        </form>

        {/* Test Webhook Button */}
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
            className="btn btn-primary btn-sm"
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

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Done
          </button>
        </div>
      </div>
    </Modal>
  )
}
