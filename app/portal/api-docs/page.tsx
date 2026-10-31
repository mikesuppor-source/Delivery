import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PortalHeader } from '@/components/portal-header'
import { getShopForUser } from '@/lib/shop-auth'
import { openApiDocument } from '@/lib/openapi'

export const metadata = {
  title: 'API Documentation — Cedar Delivery Portal',
  description: 'How to create and track Cedar orders from your own website or system, and how to check webhook messages.',
}

const BASE = '<your Cedar address>/api/v1'

const CREATE = `curl -X POST ${BASE}/orders \\
  -H "Authorization: Bearer cdr_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "reference": "WEB-10045",
    "zoneId": "<id from GET /zones>",
    "recipient": { "name": "Rita Haddad", "phone": "+961 3 123 456", "address": "Hamra, Bliss Street, building 12" },
    "codUsd": 35,
    "notes": "Call before arriving"
  }'`

const VERIFY = `// Node.js: check a webhook message before you trust it
import { createHmac, timingSafeEqual } from 'node:crypto'

function isFromCedar(secret, rawBody, header) {
  const m = /^t=(\\d+),v1=([0-9a-f]{64})$/.exec(header ?? '')
  if (!m) return false
  if (Math.abs(Date.now() / 1000 - Number(m[1])) > 300) return false   // older than 5 minutes
  const expected = createHmac('sha256', secret).update(m[1] + '.' + rawBody).digest()
  return timingSafeEqual(expected, Buffer.from(m[2], 'hex'))
}
// Use the raw request text exactly as received, not a re-written copy of the parsed JSON.`

const code: React.CSSProperties = { display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: 12, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12.5, lineHeight: 1.5 }

export default async function ApiDocsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/portal/login')
  const shop = await getShopForUser(createServiceClient(), user)
  if (!shop) redirect('/portal/signup')

  const endpoints = Object.entries(openApiDocument.paths).flatMap(([path, methods]) =>
    Object.entries(methods).map(([method, op]) => ({ method: method.toUpperCase(), path, summary: (op as { summary: string }).summary, description: (op as { description?: string }).description })))

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <PortalHeader shopName={shop.name} shopPrefix={shop.prefix || user.user_metadata?.prefix || 'CD'} userEmail={user.email || ''} />
      <main style={{ flex: 1, padding: '24px 20px', maxWidth: 900, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>API documentation</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href="/api/v1/openapi.json" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>OpenAPI file (JSON)</a>
            <Link href="/portal/integrations" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>← Keys and webhook</Link>
          </div>
        </div>

        <section className="panel" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0, fontSize: 17 }}>Getting started</h2>
          <ol style={{ margin: 0, paddingInlineStart: 20, lineHeight: 1.7, fontSize: 14 }}>
            <li>Make a key under <Link href="/portal/integrations">Connect Store</Link>. Copy it when it appears: it is shown only once.</li>
            <li>Call <code>GET /api/v1/zones</code> to get the zone ids and your delivery prices.</li>
            <li>Call <code>POST /api/v1/orders</code> for each order. Send your own order number as <code>reference</code> so a repeated request never makes a second delivery.</li>
            <li>Optional: set a webhook address to hear about every status change instead of asking again and again.</li>
          </ol>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 0 }}>{openApiDocument.info.description}</p>
        </section>

        <section className="panel" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0, fontSize: 17 }}>Endpoints</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Method</th><th>Path</th><th>What it does</th></tr></thead>
              <tbody>
                {endpoints.map(e => (
                  <tr key={e.method + e.path}>
                    <td><code>{e.method}</code></td>
                    <td><code>/api/v1{e.path}</code></td>
                    <td><strong>{e.summary}</strong>{e.description && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{e.description}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0, fontSize: 17 }}>Example: create an order</h2>
          <code style={code}>{CREATE}</code>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 0 }}>
            The answer (status 201) holds the order with its Cedar <code>code</code> and a <code>trackingUrl</code> you can give your customer.
            Errors always look like <code>{'{ "error": { "code": "...", "message": "..." } }'}</code>: 401 for a wrong key, 400 for a bad request,
            409 for a repeated reference, 429 when you send more than 120 requests a minute.
          </p>
        </section>

        <section className="panel" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0, fontSize: 17 }}>Webhook messages</h2>
          <p style={{ fontSize: 14, marginTop: 0 }}>
            Cedar sends <code>order.status_changed</code> for every change, plus <code>order.delivered</code> and <code>order.returned</code>, and <code>payout.paid</code> when Cedar pays your shop (with <code>amountUsd</code>, <code>paidAt</code> and <code>payoutRunId</code>).
            Answer with any 2xx status within 10 seconds. If you do not, Cedar tries again after 1 minute, 5, 15, 60, 3 hours, 6, 12 and 24 hours.
            The same message can arrive twice: use its <code>id</code> to ignore repeats. Every message carries the header <code>X-Cedar-Signature: t=&lt;unix seconds&gt;,v1=&lt;hex&gt;</code>, where <code>v1</code> is the HMAC-SHA256 of <code>&lt;t&gt;.&lt;exact body&gt;</code> made with your webhook signing secret. Check it before you act on a message:
          </p>
          <code style={code}>{VERIFY}</code>
        </section>
      </main>
    </div>
  )
}
