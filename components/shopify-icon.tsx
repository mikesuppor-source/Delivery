import React from 'react'

interface ShopifyIconProps {
  size?: number
  className?: string
  style?: React.CSSProperties
}

export function ShopifyIcon({ size = 16, className, style }: ShopifyIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
    >
      <path
        d="M20.5 6.5L18.8 4.2C18.5 3.8 18 3.5 17.5 3.5H6.5C6 3.5 5.5 3.8 5.2 4.2L3.5 6.5C3.2 6.9 3 7.4 3 8V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V8C21 7.4 20.8 6.9 20.5 6.5Z"
        fill="#95BF47"
      />
      <path
        d="M16 10C16 12.2 14.2 14 12 14C9.8 14 8 12.2 8 10"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M3.5 6.5H20.5"
        stroke="#7A9D39"
        strokeWidth="1.5"
      />
    </svg>
  )
}
