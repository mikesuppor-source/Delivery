'use client'

import { useState } from 'react'
import type { UserRole } from '@/lib/roles'
import { ROLE_LABELS } from '@/lib/utils'

interface Member {
  id: string
  user_id: string
  role: string
  display_name: string | null
  joined_at: string | null
}

interface MemberListProps {
  members: Member[]
  currentUserId: string
  workspaceId: string
}

export function MemberList({ members, currentUserId, workspaceId }: MemberListProps) {
  const [localMembers, setLocalMembers] = useState(members)
  const [toast, setToast] = useState('')
  const [activeTab, setActiveTab] = useState<'staff'>('staff')

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function changeRole(memberId: string, newRole: UserRole) {
    const res = await fetch('/api/admin/member', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, role: newRole, workspaceId }),
    })
    if (res.ok) {
      setLocalMembers(prev =>
        prev.map(m => m.id === memberId ? { ...m, role: newRole } : m)
      )
      showToast('Role updated.')
    } else {
      showToast('Failed to update role.')
    }
  }

  async function removeMember(memberId: string, userId: string) {
    if (userId === currentUserId) return // Can't remove yourself
    if (!confirm('Remove this staff member? They will lose access immediately.')) return

    const res = await fetch('/api/admin/member', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, workspaceId }),
    })
    if (res.ok) {
      setLocalMembers(prev => prev.filter(m => m.id !== memberId))
      showToast('Staff member removed.')
    }
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <div className="admin-tabs">
        <button className="tab-btn active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          Staff
        </button>
      </div>

      <div className="panel">
        <div className="panel-title">
          <h2>Team members</h2>
          <small>{localMembers.length} member{localMembers.length !== 1 ? 's' : ''}</small>
        </div>

        {localMembers.map(member => {
          const isMe = member.user_id === currentUserId
          const isOwner = member.role === 'owner'
          const initial = (member.display_name ?? 'U')[0].toUpperCase()

          return (
            <div className="member-row" key={member.id}>
              <div className="member-avatar">{initial}</div>
              <div className="member-info">
                <span>{member.display_name ?? '(No name)'}{isMe ? ' · You' : ''}</span>
                <small>
                  {member.joined_at
                    ? `Joined ${new Date(member.joined_at).toLocaleDateString('en-GB')}`
                    : 'Pending'}
                </small>
              </div>
              <div className="member-actions">
                {isOwner || isMe ? (
                  <span className={`badge badge-${member.role}`}>{ROLE_LABELS[member.role]}</span>
                ) : (
                  <select
                    value={member.role}
                    onChange={e => changeRole(member.id, e.target.value as UserRole)}
                    style={{ width: 'auto', padding: '5px 8px', fontSize: 12 }}
                  >
                    <option value="manager">Manager</option>
                    <option value="driver">Driver</option>
                    <option value="readonly">Read-only</option>
                  </select>
                )}
                {!isOwner && !isMe && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => removeMember(member.id, member.user_id)}
                    style={{ color: 'var(--danger)' }}
                    title="Remove member"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      <path d="M10 11v6"/><path d="M14 11v6"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {toast && (
        <div className="toast">
          <span>{toast}</span>
          <button onClick={() => setToast('')}>✕</button>
        </div>
      )}
    </div>
  )
}
