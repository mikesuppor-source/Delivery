'use client'

import React, { type ReactNode } from 'react'
import Link from 'next/link'

export interface BreadcrumbItem {
  label: string
  href?: string
}

export interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  badge?: ReactNode
  breadcrumbs?: BreadcrumbItem[]
  actions?: ReactNode
  className?: string
}

export function PageHeader({
  title,
  subtitle,
  badge,
  breadcrumbs,
  actions,
  className = '',
}: PageHeaderProps) {
  return (
    <div
      className={`ui-page-header ${className}`}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        marginBottom: 24,
      }}
    >
      <div>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: 'var(--ui-text-muted)',
              marginBottom: 6,
            }}
          >
            {breadcrumbs.map((b, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span style={{ opacity: 0.5 }}>/</span>}
                {b.href ? (
                  <Link
                    href={b.href}
                    style={{
                      color: 'var(--ui-text-muted)',
                      textDecoration: 'none',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--ui-primary)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--ui-text-muted)')}
                  >
                    {b.label}
                  </Link>
                ) : (
                  <span style={{ color: 'var(--ui-text)', fontWeight: 600 }}>{b.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ui-text)', margin: 0 }}>
            {title}
          </h1>
          {badge}
        </div>

        {subtitle && (
          <p style={{ fontSize: 13, color: 'var(--ui-text-muted)', margin: '4px 0 0', lineHeight: 1.4 }}>
            {subtitle}
          </p>
        )}
      </div>

      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {actions}
        </div>
      )}
    </div>
  )
}
