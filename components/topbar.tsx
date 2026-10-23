import { formatLBP } from '@/lib/utils'

interface TopbarProps {
  usdToLbp: number
  workspaceId: string
}

export function Topbar({ usdToLbp }: TopbarProps) {
  const today = new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Asia/Beirut',
  })

  return (
    <div className="topbar">
      <span style={{ marginRight: 'auto', fontSize: 12, color: 'var(--muted)' }}>
        {today.toUpperCase()}
      </span>
      <div className="rate-pill">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="1" x2="12" y2="23"/>
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
        1 USD = {formatLBP(usdToLbp)}
      </div>
    </div>
  )
}
