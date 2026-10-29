'use client'

import React, { type ReactNode } from 'react'

export interface EmptyStateProps {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({
  icon = '📦',
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`ui-empty-state ${className}`}>
      <div className="ui-empty-state__icon" aria-hidden="true">
        {typeof icon === 'string' ? <span style={{ fontSize: 24 }}>{icon}</span> : icon}
      </div>
      <h3 className="ui-empty-state__title">{title}</h3>
      {description && <p className="ui-empty-state__desc">{description}</p>}
      {action && <div className="ui-empty-state__action">{action}</div>}
    </div>
  )
}
