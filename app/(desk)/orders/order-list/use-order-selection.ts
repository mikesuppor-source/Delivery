'use client'

import { useState, type Dispatch, type SetStateAction } from 'react'
import type { OrderStatus } from '@/lib/roles'
import type { Driver, Order } from './types'

interface SelectionDeps {
  workspaceId: string
  drivers: Driver[]
  isOwner: boolean
  filteredOrders: Order[]
  setOrders: Dispatch<SetStateAction<Order[]>>
  editingOrder: Order | null
  setEditingOrder: (order: Order | null) => void
}

/** Row selection and the bulk actions applied to it (assign, status, delete). */
export function useOrderSelection({ workspaceId, drivers, isOwner, filteredOrders, setOrders, editingOrder, setEditingOrder }: SelectionDeps) {
  // Bulk Selection & Batch Actions
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([])
  const [bulkDriverId, setBulkDriverId] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkMessage, setBulkMessage] = useState('')

  function handleToggleSelectAll() {
    if (selectedOrderIds.length === filteredOrders.length && filteredOrders.length > 0) {
      setSelectedOrderIds([])
    } else {
      setSelectedOrderIds(filteredOrders.map(o => o.id))
    }
  }

  function handleToggleSelectOrder(id: string) {
    setSelectedOrderIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function handleBulkExecute(action: 'assign_driver' | 'update_status', payload: { driverId?: string; status?: OrderStatus }) {
    if (selectedOrderIds.length === 0) return
    setBulkLoading(true)
    setBulkMessage('')
    try {
      const res = await fetch('/api/orders/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          orderIds: selectedOrderIds,
          action,
          driverId: payload.driverId,
          status: payload.status,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to execute bulk operation')

      const updatedMap = new Map((data.orders as any[]).map(o => [o.id, o]))
      setOrders(prev =>
        prev.map(o => {
          const upd = updatedMap.get(o.id)
          if (!upd) return o
          return {
            ...o,
            ...upd,
            driver: payload.driverId
              ? drivers.find(d => d.id === payload.driverId) || o.driver
              : o.driver,
          }
        })
      )

      setBulkMessage(`Updated ${data.count} orders successfully!`)
      setSelectedOrderIds([])
      setBulkDriverId('')
      setTimeout(() => setBulkMessage(''), 4000)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Bulk update failed')
    } finally {
      setBulkLoading(false)
    }
  }

  async function handleDeleteOrders(targetIds: string[], codesLabel?: string) {
    if (targetIds.length === 0) return
    if (!isOwner) {
      alert('Only the workspace owner has permission to permanently delete order records.')
      return
    }
    const msg = targetIds.length === 1
      ? `Are you sure you want to permanently delete order ${codesLabel || ''}? This action is exclusive to the workspace owner and cannot be undone.`
      : `Are you sure you want to permanently delete these ${targetIds.length} order records? This action is exclusive to the workspace owner and cannot be undone.`

    if (!window.confirm(msg)) {
      return
    }

    setBulkLoading(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, orderIds: targetIds }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete orders')
      }

      // Remove permanently deleted records from UI state
      setOrders(prev => prev.filter(o => !targetIds.includes(o.id)))
      setSelectedOrderIds(prev => prev.filter(id => !targetIds.includes(id)))
      if (editingOrder && targetIds.includes(editingOrder.id)) {
        setEditingOrder(null)
      }
      setBulkMessage(data.message || `Deleted ${targetIds.length} order(s) permanently.`)
      setTimeout(() => setBulkMessage(''), 4000)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error deleting orders')
    } finally {
      setBulkLoading(false)
    }
  }

  return {
    selectedOrderIds,
    setSelectedOrderIds,
    bulkDriverId,
    setBulkDriverId,
    bulkLoading,
    bulkMessage,
    handleToggleSelectAll,
    handleToggleSelectOrder,
    handleBulkExecute,
    handleDeleteOrders,
  }
}
