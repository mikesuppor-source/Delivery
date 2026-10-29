'use client'

import React, { type ReactNode } from 'react'

export interface KpiCardProps {
  title: ReactNode
  value: ReactNode
  subtext?: ReactNode
  icon?: ReactNode
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger'
  onClick?: () => void
  className?: string
}

export function KpiCard({
  title,
  value,
  subtext,
  icon,
  tone = 'default',
  onClick,
  className = '',
}: KpiCardProps) {
  const isClickable = Boolean(onClick)
  const toneClass = tone !== 'default' ? `ui-kpi-card--${tone}` : ''

  return (
    <article
      className={`ui-kpi-card ${toneClass} ${isClickable ? 'ui-kpi-card--clickable' : ''} ${className}`.trim()}
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
    >
      <div className="ui-kpi-card__head">
        <span className="ui-kpi-card__title">{title}</span>
        {icon && <div className="ui-kpi-card__icon">{icon}</div>}
      </div>
      <div className="ui-kpi-card__value">{value}</div>
      {subtext && <div className="ui-kpi-card__subtext">{subtext}</div>}
    </article>
  )
}
