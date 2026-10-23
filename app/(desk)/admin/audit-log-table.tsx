interface AuditEntry {
  id: string
  action: string
  actor_email: string | null
  entity_type: string | null
  diff: unknown
  created_at: string
}

interface AuditLogTableProps {
  entries: AuditEntry[]
}

export function AuditLogTable({ entries }: AuditLogTableProps) {
  return (
    <div className="panel">
      <div className="panel-title">
        <h2>Activity log</h2>
        <small>Last 50 actions</small>
      </div>
      {entries.length === 0 ? (
        <div className="empty" style={{ padding: '40px 20px' }}>
          <h3>No activity yet</h3>
          <p>Actions taken by you and your staff will appear here.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Actor</th>
                <th>Entity</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id}>
                  <td>
                    <code style={{ fontSize: 12, background: 'var(--bg)', padding: '2px 6px', borderRadius: 4 }}>
                      {entry.action}
                    </code>
                  </td>
                  <td>{entry.actor_email ?? '—'}</td>
                  <td>{entry.entity_type ?? '—'}</td>
                  <td>
                    <small>{new Date(entry.created_at).toLocaleDateString('en-GB', {
                      day: '2-digit', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                      timeZone: 'Asia/Beirut',
                    })}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
