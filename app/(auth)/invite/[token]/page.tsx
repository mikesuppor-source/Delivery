'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'

export default function InvitePage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const token = params.token as string

  const [invitation, setInvitation] = useState<{
    email: string; role: string; workspace_id: string
  } | null>(null)
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    async function fetchInvite() {
      const { data } = await supabase
        .from('invitations')
        .select('email, role, workspace_id, expires_at, accepted_at')
        .eq('token', token)
        .single()

      const inv = data as {
        email: string
        role: string
        workspace_id: string
        expires_at: string
        accepted_at: string | null
      } | null

      if (!inv) {
        setError('This invitation link is invalid or has expired.')
      } else if (inv.accepted_at) {
        setError('This invitation has already been accepted.')
      } else if (new Date(inv.expires_at) < new Date()) {
        setError('This invitation link has expired. Please ask your owner to send a new one.')
      } else {
        setInvitation(inv)
      }
      setFetching(false)
    }
    fetchInvite()
  }, [token]) // eslint-disable-line

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault()
    if (!invitation) return
    setError('')
    setLoading(true)

    // The user was invited via Supabase Auth — they have a pending user.
    // They need to set their password via updateUser after the magic link flow.
    // For simplicity, we sign them up and then mark the invitation accepted.
    const { error: signUpError } = await supabase.auth.signUp({
      email: invitation.email,
      password,
      options: {
        data: { display_name: name },
      },
    })

    if (signUpError) {
      // If user already exists, try signing in instead
      if (signUpError.message.includes('already registered')) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: invitation.email,
          password,
        })
        if (signInError) {
          setError('Wrong password for existing account.')
          setLoading(false)
          return
        }
      } else {
        setError(signUpError.message)
        setLoading(false)
        return
      }
    }

    // Mark invitation as accepted via API
    await fetch('/api/invite/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, displayName: name }),
    })

    router.push('/')
    router.refresh()
  }

  if (fetching) {
    return (
      <div className="welcome">
        <p>Loading invitation…</p>
      </div>
    )
  }

  if (!invitation) {
    return (
      <div className="welcome">
        <div className="brand-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h1>Invalid link</h1>
        <p className="error-msg" style={{ marginTop: 8 }}>{error}</p>
      </div>
    )
  }

  return (
    <div className="welcome">
      <div className="brand-icon">
        <img src="/logo.png" alt="Cedar Delivery Desk" />
      </div>
      <h1>Join Cedar</h1>
      <p>
        You&apos;ve been invited as <strong>{invitation.role}</strong>.
        Create your account to get started.
      </p>

      <form onSubmit={handleAccept}>
        <div className="field">
          <label>Email address</label>
          <input type="email" value={invitation.email} disabled />
        </div>
        <div className="field">
          <label htmlFor="name">Your name</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Full name"
            required
            autoFocus
          />
        </div>
        <div className="field">
          <label htmlFor="inv-password">Choose a password</label>
          <input
            id="inv-password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Min. 8 characters"
            minLength={8}
            required
          />
        </div>
        {error && <p className="error-msg">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Setting up…' : 'Create account & join'}
        </button>
      </form>
    </div>
  )
}
