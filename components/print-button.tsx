'use client'

interface PrintButtonProps {
  label?: string
  className?: string
  style?: React.CSSProperties
}

export function PrintButton({ label = 'Print / Save PDF', className = 'btn btn-primary', style }: PrintButtonProps) {
  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={() => window.print()}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="6 9 6 2 18 2 18 9"/>
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
        <rect x="6" y="14" width="12" height="8"/>
      </svg>
      <span>{label}</span>
    </button>
  )
}
