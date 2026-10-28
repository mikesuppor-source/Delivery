'use client'

import { useState, type Dispatch, type SetStateAction } from 'react'
import type { OrderStatus } from '@/lib/roles'
import type { Driver, Order } from './types'

interface UpdateDeps {
  workspaceId: string
  drivers: Driver[]
  setOrders: Dispatch<SetStateAction<Order[]>>
}

/** Tells dispatch why the server refused a change (otherwise the row just snaps back). */
async function reportFailure(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}))
  alert(data.error || fallback)
}

/** Single-order changes from the table: courier, status (asking for a courier first when needed), auto-assign. */
export function useOrderUpdates({ workspaceId, drivers, setOrders }: UpdateDeps) {
  // Driver Required Alert Modal (when changing status without a driver)
  const [isDriverRequiredModalOpen, setIsDriverRequiredModalOpen] = useState(false)
  const [driverRequiredOrder, setDriverRequiredOrder] = useState<Order | null>(null)
  const [pendingTargetStatus, setPendingTargetStatus] = useState<OrderStatus>('assigned')
  const [promptDriverId, setPromptDriverId] = useState(drivers[0]?.id || '')
  const [promptSubmitting, setPromptSubmitting] = useState(false)

  const [autoAssigning, setAutoAssigning] = useState(false)

  async function handleAutoAssign() {
    setAutoAssigning(true)
    try {
      const res = await fetch('/api/orders/auto-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Auto-assign failed')
      alert(data.message)
      if (data.count > 0) {
        window.location.reload()
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error running auto-dispatch')
    } finally {
      setAutoAssigning(false)
    }
  }

  // Quick Inline Driver Change
  async function handleInlineDriverChange(orderId: string, newDriverId: string) {
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          workspaceId,
          driverId: newDriverId || null,
        }),
      })

      if (res.ok) {
        const selectedDriver = drivers.find(d => d.id === newDriverId) || null
        setOrders(prev =>
          prev.map(o => {
            if (o.id !== orderId) return o
            return {
              ...o,
              driver: selectedDriver,
              status: selectedDriver && o.status === 'pending' ? 'assigned' : o.status,
            }
          })
        )
      } else {
        await reportFailure(res, 'Could not change the courier')
      }
    } catch (err) {
      console.error('Failed to assign driver', err)
      alert('Could not change the courier. Check your connection and try again.')
    }
  }

  // Status Change with Driver Check
  function handleStatusSelect(order: Order, newStatus: OrderStatus) {
    // If order has no driver and user tries to move to assigned, picked_up, or delivered
    if (!order.driver && ['assigned', 'picked_up', 'delivered'].includes(newStatus)) {
      setDriverRequiredOrder(order)
      setPendingTargetStatus(newStatus)
      setPromptDriverId(drivers[0]?.id || '')
      setIsDriverRequiredModalOpen(true)
      return
    }

    handleStatusChange(order.id, newStatus)
  }

  async function handleStatusChange(orderId: string, newStatus: OrderStatus) {
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          workspaceId,
          status: newStatus,
        }),
      })

      const data = await res.json()
      if (res.ok && data.order) {
        setOrders(prev =>
          prev.map(o => (o.id === orderId ? { ...o, ...data.order } : o))
        )
      } else {
        alert(data.error || 'Could not change the status')
      }
    } catch (err) {
      console.error('Failed to update status', err)
      alert('Could not change the status. Check your connection and try again.')
    }
  }

  // Confirm Driver Assignment from Warning Modal
  async function handleConfirmDriverAndStatus(e: React.FormEvent) {
    e.preventDefault()
    if (!driverRequiredOrder) return
    setPromptSubmitting(true)

    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: driverRequiredOrder.id,
          workspaceId,
          driverId: promptDriverId || null,
          status: pendingTargetStatus,
        }),
      })

      if (res.ok) {
        const assignedDriver = drivers.find(d => d.id === promptDriverId) || null
        setOrders(prev =>
          prev.map(o =>
            o.id === driverRequiredOrder.id
              ? { ...o, driver: assignedDriver, status: pendingTargetStatus }
              : o
          )
        )
        setIsDriverRequiredModalOpen(false)
        setDriverRequiredOrder(null)
      } else {
        await reportFailure(res, 'Could not assign the courier')
      }
    } catch (err) {
      console.error('Failed to assign driver and status', err)
      alert('Could not assign the courier. Check your connection and try again.')
    } finally {
      setPromptSubmitting(false)
    }
  }

  return {
    isDriverRequiredModalOpen,
    setIsDriverRequiredModalOpen,
    driverRequiredOrder,
    setDriverRequiredOrder,
    pendingTargetStatus,
    promptDriverId,
    setPromptDriverId,
    promptSubmitting,
    autoAssigning,
    handleAutoAssign,
    handleInlineDriverChange,
    handleStatusSelect,
    handleConfirmDriverAndStatus,
  }
}
