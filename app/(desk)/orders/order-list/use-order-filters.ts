'use client'

import { useMemo, useState } from 'react'
import { isDateInPreset, type DateRangePreset } from '@/lib/utils'
import type { Order } from './types'

/** Status tab, timeframe and sort order for the list. */
export function useOrderFilters(orders: Order[]) {
  const [filter, setFilter] = useState<string>('all')
  const [datePreset, setDatePreset] = useState<DateRangePreset>('all')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'collection_high' | 'fee_high'>('newest')

  const filteredOrders = useMemo(() => {
    return orders
      .filter(o => {
        if (filter !== 'all') {
          if (filter === 'assigned') {
            if (o.status !== 'assigned' && o.status !== 'picked_up') return false
          } else if (filter === 'failed') {
            if (o.status !== 'failed' && o.status !== 'returned') return false
          } else if (o.status !== filter) {
            return false
          }
        }
        if (!isDateInPreset(o.created_at, datePreset, customStart, customEnd)) return false
        return true
      })
      .sort((a, b) => {
        if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        if (sortBy === 'collection_high') return (Number(b.collection_usd) || 0) - (Number(a.collection_usd) || 0)
        if (sortBy === 'fee_high') return (Number(b.delivery_fee_usd) || 0) - (Number(a.delivery_fee_usd) || 0)
        return 0
      })
  }, [orders, filter, datePreset, customStart, customEnd, sortBy])

  return {
    filter,
    setFilter,
    datePreset,
    setDatePreset,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    sortBy,
    setSortBy,
    filteredOrders,
  }
}
