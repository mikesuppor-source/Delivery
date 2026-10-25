'use client'

import { useState } from 'react'
import type { UserRole } from '@/lib/roles'
import { ROLE_LABELS } from '@/lib/utils'

interface PendingInvite {
  id: string
  email: string
  role: string
  expires_at: string
  created_at: string
}

interface InviteFormProps {
  workspaceId: string
  pendingInvites: PendingInvite[]
}

export function InviteForm({ workspaceId, pendingInvites }: InviteFormProps) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('manager')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [invites, setInvites] = useState(pendingInvites)

  const [createdInviteUrl, setCreatedInviteUrl] = useState('')
  const [copied, setCopied] = useState(false)

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setCreatedInviteUrl('')
    setCopied(false)
    setLoading(true)

    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role, workspaceId }),
    })

    const data = await res.json()
    if (res.ok) {
      setSuccess(data.message || `Invitation created for ${email}`)
      if (data.inviteUrl) {
        setCreatedInviteUrl(data.inviteUrl)
      }
      setEmail('')
      // Optimistically add to pending list
      setInvites(prev => [{
        id: data.invitationId,
        email,
        role,
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        created_at: new Date().toISOString(),
      }, ...prev])
    } else {
      setError(data.error ?? 'Failed to send invitation.')
    }

    setLoading(false)
  }

  async function revokeInvite(inviteId: string) {
    const res = await fetch('/api/invite', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteId, workspaceId }),
    })
    if (res.ok) {
      setInvites(prev => prev.filter(i => i.id !== inviteId))
    }
  }

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Invite form */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-title">
          <h2>+ Add staff administrator</h2>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <form onSubmit={sendInvite}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="inv-email">Email address</label>
                <input
                  id="inv-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="staff@example.com"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="inv-role">Role</label>
                <select
                  id="inv-role"
                  value={role}
                  onChange={e => setRole(e.target.value as UserRole)}
                >
                  <option value="manager">Manager — create orders, view statements</option>
                  <option value="driver">Driver — see own orders only</option>
                  <option value="readonly">Read-only — view access only</option>
                </select>
              </div>
            </div>
            {error && <p className="error-msg" style={{ marginTop: 10 }}>{error}</p>}
            {success && <p style={{ color: 'var(--brand)', fontSize: 12, marginTop: 10 }}>✓ {success}</p>}
            {createdInviteUrl && (
              <div
                style={{
                  marginTop: 12,
                  padding: '12px 16px',
                  background: 'var(--brand-light)',
                  border: '1.5px solid var(--brand)',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <small style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', display: 'block', textTransform: 'uppercase' }}>
                    Direct Invite Link (Share via WhatsApp / Email):
                  </small>
                  <code style={{ fontSize: 11, wordBreak: 'break-all', color: 'var(--text)', display: 'block', marginTop: 2 }}>
                    {createdInviteUrl}
                  </code>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(createdInviteUrl)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2500)
                  }}
                  className="btn btn-primary btn-sm"
                  style={{ fontSize: 12 }}
                >
                  {copied ? '✓ Copied!' : 'Copy Link'}
                </button>
              </div>
            )}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Sending…' : 'Send invite'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <div className="panel">
          <div className="panel-title">
            <h2>Pending invitations</h2>
            <small>{invites.length} pending</small>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Expires</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invites.map(invite => (
                  <tr key={invite.id}>
                    <td>{invite.email}</td>
                    <td><span className={`badge badge-${invite.role}`}>{ROLE_LABELS[invite.role]}</span></td>
                    <td><small>{new Date(invite.expires_at).toLocaleDateString('en-GB')}</small></td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => revokeInvite(invite.id)}
                        style={{ color: 'var(--danger)' }}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
