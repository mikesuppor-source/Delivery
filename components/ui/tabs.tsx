'use client'

import React, { useState, type ReactNode } from 'react'

export interface TabItem {
  id: string
  label: ReactNode
  content: ReactNode
  badge?: ReactNode
  disabled?: boolean
}

export interface TabsProps {
  items: TabItem[]
  activeId?: string
  onChange?: (id: string) => void
  className?: string
}

export function Tabs({ items, activeId: controlledActiveId, onChange, className = '' }: TabsProps) {
  const [internalActiveId, setInternalActiveId] = useState<string>(items[0]?.id || '')
  const activeId = controlledActiveId !== undefined ? controlledActiveId : internalActiveId

  const handleSelect = (id: string) => {
    if (controlledActiveId === undefined) {
      setInternalActiveId(id)
    }
    onChange?.(id)
  }

  const activeItem = items.find(i => i.id === activeId) || items[0]

  return (
    <div className={`ui-tabs-wrapper ${className}`}>
      <div className="ui-tabs" role="tablist">
        {items.map(item => {
          const isSelected = item.id === activeId
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              disabled={item.disabled}
              className="ui-tab-btn"
              onClick={() => handleSelect(item.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>{item.label}</span>
              {item.badge && (
                <span
                  style={{
                    fontSize: 11,
                    padding: '1px 6px',
                    borderRadius: 9999,
                    background: isSelected ? 'var(--ui-primary-soft)' : 'var(--ui-surface-2)',
                    color: isSelected ? 'var(--ui-primary)' : 'var(--ui-text-muted)',
                  }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div role="tabpanel" className="ui-tab-content">
        {activeItem?.content}
      </div>
    </div>
  )
}
