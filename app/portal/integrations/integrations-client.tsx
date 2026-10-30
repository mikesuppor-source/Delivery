'use client'

import { useCallback, useEffect, useState } from 'react'

interface Key { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }
interface Delivery { id: string; event: string; status: 'pending' | 'delivered' | 'failed'; attempts: number; statusCode: number | null; error: string | null; createdAt: string; nextAttemptAt: string; orderCode: string | null }
interface Data { keys: Key[]; webhook: { url: string; enabled: boolean } | null; deliveries: Delivery[] }

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'never')
const STATE: Record<Delivery['status'], string> = { delivered: 'badge badge-delivered', pending: 'badge badge-pending', failed: 'badge badge-failed' }

export function IntegrationsClient({ shopId }: { shopId: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [keyName, setKeyName] = useState('')
  const [url, setUrl] = useState('')
  const [shown, setShown] = useState<{ title: string; value: string } | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/portal/integrations?shopId=' + shopId, { cache: 'no-store' })
    const body = await res.json()
    if (!res.ok) { setError(body.error || 'Could not load'); return }
    setData(body)
    setUrl(current => current || body.webhook?.url || '')
  }, [shopId])
  useEffect(() => { load() }, [load])

  async function act(payload: Record<string, unknown>, done?: (body: Record<string, string>) => void) {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/portal/integrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shopId, ...payload }) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Something went wrong')
      done?.(body)
      await load()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const activeKeys = data?.keys.filter(k => !k.revokedAt) ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && <div role="alert" data-testid="error" className="notice notice-error" style={{ padding: '10px 14px', borderRadius: 8, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>{error}</div>}

      {shown && (
        <div role="status" data-testid="secret-shown" className="panel" style={{ padding: 16, borderColor: '#047857' }}>
          <strong>{shown.title}</strong>
          <p style={{ margin: '6px 0', fontSize: 13, color: 'var(--muted)' }}>Copy it now and keep it safe. For your security it is shown only this once and cannot be shown again.</p>
          <code data-testid="secret-value" style={{ display: 'block', padding: 10, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 6, wordBreak: 'break-all', userSelect: 'all' }}>{shown.value}</code>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard?.writeText(shown.value)}>Copy</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShown(null)}>I have saved it</button>
          </div>
        </div>
      )}

      <section className="panel" style={{ padding: 18 }} aria-labelledby="keys-title">
        <h2 id="keys-title" style={{ margin: '0 0 4px', fontSize: 17 }}>API keys</h2>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted)' }}>A key lets your system create and track orders for this shop. Make one key for each system, so you can stop one without touching the others.</p>
        <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }} onSubmit={e => {
          e.preventDefault()
          act({ action: 'createKey', name: keyName.trim() || 'My store' }, b => { setShown({ title: 'Your new API key', value: b.key }); setKeyName('') })
        }}>
          <input aria-label="Key name" placeholder="Name, for example My website" value={keyName} onChange={e => setKeyName(e.target.value)} maxLength={80} style={{ flex: '1 1 240px' }} />
          <button type="submit" className="btn btn-primary" disabled={busy || activeKeys.length >= 5}>Create key</button>
        </form>
        {data && data.keys.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)' }}>No keys yet.</p>}
        {data && data.keys.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Key</th><th>Created</th><th>Last used</th><th /></tr></thead>
              <tbody>
                {data.keys.map(k => (
                  <tr key={k.id} data-testid="key-row" style={k.revokedAt ? { opacity: 0.55 } : undefined}>
                    <td>{k.name}</td>
                    <td><code>{k.prefix}…</code></td>
                    <td>{when(k.createdAt)}</td>
                    <td>{when(k.lastUsedAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {k.revokedAt
                        ? <span className="badge badge-failed">Revoked</span>
                        : <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { if (confirm(`Revoke the key "${k.name}"? Systems using it stop working at once.`)) act({ action: 'revokeKey', keyId: k.id }) }}>Revoke</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel" style={{ padding: 18 }} aria-labelledby="hook-title">
        <h2 id="hook-title" style={{ margin: '0 0 4px', fontSize: 17 }}>Webhook</h2>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted)' }}>Cedar sends a signed message to this address every time one of your orders changes status (including delivered and returned). The address must start with https://.</p>
        <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} onSubmit={e => {
          e.preventDefault()
          act({ action: 'saveWebhook', url: url.trim() }, b => { if (b.secret) setShown({ title: 'Your webhook signing secret', value: b.secret }) })
        }}>
          <input aria-label="Webhook address" placeholder="https://your-site.com/cedar-webhook" value={url} onChange={e => setUrl(e.target.value)} maxLength={500} style={{ flex: '1 1 320px' }} />
          <button type="submit" className="btn btn-primary" disabled={busy || !url.trim()}>{data?.webhook ? 'Save address' : 'Turn on webhook'}</button>
        </form>
        {data?.webhook && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
            <span className={data.webhook.enabled ? 'badge badge-delivered' : 'badge badge-returned'}>{data.webhook.enabled ? 'On' : 'Off'}</span>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act({ action: 'saveWebhook', url: data.webhook!.url, enabled: !data.webhook!.enabled })}>{data.webhook.enabled ? 'Turn off' : 'Turn on'}</button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { if (confirm('Make a new signing secret? Your system must be updated with it, or it will reject our messages.')) act({ action: 'rotateSecret' }, b => setShown({ title: 'Your new webhook signing secret', value: b.secret })) }}>New signing secret</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { if (confirm('Remove the webhook?')) act({ action: 'removeWebhook' }, () => setUrl('')) }}>Remove</button>
          </div>
        )}
      </section>

      <section className="panel" style={{ padding: 18 }} aria-labelledby="log-title">
        <h2 id="log-title" style={{ margin: '0 0 4px', fontSize: 17 }}>Recent webhook messages</h2>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted)' }}>A message that fails is tried again later, up to 8 times over about a day.</p>
        {data && data.deliveries.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Nothing sent yet.</p>}
        {data && data.deliveries.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>When</th><th>Event</th><th>Order</th><th>Result</th><th>Tries</th></tr></thead>
              <tbody>
                {data.deliveries.map(d => (
                  <tr key={d.id} data-testid="delivery-row">
                    <td>{when(d.createdAt)}</td>
                    <td><code>{d.event}</code></td>
                    <td>{d.orderCode ?? '—'}</td>
                    <td>
                      <span className={STATE[d.status]}>{d.status === 'pending' && d.attempts === 0 ? 'waiting' : d.status}</span>
                      {d.error && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{d.error}{d.status === 'pending' ? ` · next try ${when(d.nextAttemptAt)}` : ''}</div>}
                    </td>
                    <td>{d.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
