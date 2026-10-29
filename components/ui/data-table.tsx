'use client'

import React, { type ReactNode, useMemo } from 'react'
import { useI18n } from '@/lib/i18n'

export interface Column<T> {
  key: string
  header: ReactNode
  render?: (row: T, index: number) => ReactNode
  sortable?: boolean
  align?: 'start' | 'center' | 'end'
  width?: string | number
  className?: string
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyField: keyof T | ((row: T) => string)
  selectedKeys?: Set<string>
  onSelectionChange?: (selected: Set<string>) => void
  sortKey?: string
  sortDirection?: 'asc' | 'desc'
  onSort?: (key: string) => void
  loading?: boolean
  emptyMessage?: ReactNode
  bulkActions?: ReactNode
  stickyHeader?: boolean
  className?: string
  pagination?: {
    page: number
    pageSize: number
    total: number
    onPageChange: (page: number) => void
  }
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  keyField,
  selectedKeys,
  onSelectionChange,
  sortKey,
  sortDirection = 'asc',
  onSort,
  loading = false,
  emptyMessage,
  bulkActions,
  stickyHeader = false,
  className = '',
  pagination,
}: DataTableProps<T>) {
  const { t } = useI18n()
  const getRowKey = (row: T): string => {
    if (typeof keyField === 'function') return keyField(row)
    return String(row[keyField])
  }

  const allSelected = useMemo(() => {
    if (!data.length || !selectedKeys) return false
    return data.every(row => selectedKeys.has(getRowKey(row)))
  }, [data, selectedKeys])

  const someSelected = useMemo(() => {
    if (!data.length || !selectedKeys || allSelected) return false
    return data.some(row => selectedKeys.has(getRowKey(row)))
  }, [data, selectedKeys, allSelected])

  const toggleAll = () => {
    if (!onSelectionChange) return
    if (allSelected) {
      onSelectionChange(new Set())
    } else {
      const next = new Set(data.map(getRowKey))
      onSelectionChange(next)
    }
  }

  const toggleRow = (key: string) => {
    if (!onSelectionChange || !selectedKeys) return
    const next = new Set(selectedKeys)
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }
    onSelectionChange(next)
  }

  const hasSelection = Boolean(selectedKeys && onSelectionChange)
  const selectedCount = selectedKeys?.size || 0

  return (
    <div className={`ui-table-wrapper ${className}`}>
      {/* Bulk actions banner if any selected */}
      {hasSelection && selectedCount > 0 && (
        <div className="ui-bulk-bar" role="toolbar" aria-label={t('Bulk actions')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>
              <strong>{selectedCount}</strong> {t('selected')}
            </span>
            <button
              type="button"
              className="ui-btn ui-btn--subtle ui-btn--sm"
              onClick={() => onSelectionChange?.(new Set())}
            >
              {t('Deselect All')}
            </button>
          </div>
          {bulkActions && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{bulkActions}</div>}
        </div>
      )}

      <div className="ui-table-container">
        <table className={`ui-table ${stickyHeader ? 'ui-table--sticky-header' : ''}`}>
          <thead>
            <tr>
              {hasSelection && (
                <th style={{ width: 40, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={input => {
                      if (input) input.indeterminate = someSelected
                    }}
                    onChange={toggleAll}
                    aria-label={t('Select all rows')}
                    style={{ cursor: 'pointer', width: 'auto' }}
                  />
                </th>
              )}
              {columns.map(col => {
                const isSorted = sortKey === col.key
                const alignStyle = col.align === 'end' ? 'right' : col.align === 'center' ? 'center' : 'left'
                return (
                  <th
                    key={col.key}
                    className={`${col.sortable ? 'sortable' : ''} ${col.className || ''}`}
                    style={{ width: col.width, textAlign: alignStyle }}
                    onClick={col.sortable && onSort ? () => onSort(col.key) : undefined}
                    role={col.sortable ? 'button' : undefined}
                    tabIndex={col.sortable ? 0 : undefined}
                    onKeyDown={
                      col.sortable && onSort
                        ? e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              onSort(col.key)
                            }
                          }
                        : undefined
                    }
                  >
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        justifyContent: alignStyle === 'right' ? 'flex-end' : alignStyle === 'center' ? 'center' : 'flex-start',
                      }}
                    >
                      <span>{col.header}</span>
                      {col.sortable && (
                        <span style={{ fontSize: 11, opacity: isSorted ? 1 : 0.35 }}>
                          {isSorted ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      )}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length + (hasSelection ? 1 : 0)} style={{ textAlign: 'center', padding: '36px 16px' }}>
                  <div style={{ color: 'var(--ui-text-muted)', fontSize: 13, fontWeight: 600 }}>{t('Loading data...')}</div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (hasSelection ? 1 : 0)} style={{ textAlign: 'center', padding: '48px 16px' }}>
                  <div style={{ color: 'var(--ui-text-muted)', fontSize: 13 }}>{emptyMessage ?? t('No records found')}</div>
                </td>
              </tr>
            ) : (
              data.map((row, index) => {
                const rowKey = getRowKey(row)
                const isSelected = selectedKeys?.has(rowKey)
                return (
                  <tr key={rowKey} className={isSelected ? 'selected-row' : ''}>
                    {hasSelection && (
                      <td style={{ width: 40, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(rowKey)}
                          aria-label={t('Select row {key}', { key: rowKey })}
                          style={{ cursor: 'pointer', width: 'auto' }}
                        />
                      </td>
                    )}
                    {columns.map(col => {
                      const alignStyle = col.align === 'end' ? 'right' : col.align === 'center' ? 'center' : 'left'
                      return (
                        <td key={col.key} className={col.className || ''} style={{ textAlign: alignStyle }}>
                          {col.render ? col.render(row, index) : row[col.key]}
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {pagination && pagination.total > pagination.pageSize && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderTop: '1px solid var(--ui-border)',
            background: 'var(--ui-surface)',
            fontSize: 12,
            color: 'var(--ui-text-muted)',
          }}
        >
          <div>
            Showing {(pagination.page - 1) * pagination.pageSize + 1} to{' '}
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total} records
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="ui-btn ui-btn--neutral ui-btn--sm"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="ui-btn ui-btn--neutral ui-btn--sm"
              disabled={pagination.page * pagination.pageSize >= pagination.total}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
