'use client'

import { useState } from 'react'
import type { Order, OrderListClientProps } from './types'
import { useLiveOrders } from './use-live-orders'
import { useOrderFilters } from './use-order-filters'
import { useOrderSelection } from './use-order-selection'
import { useOrderUpdates } from './use-order-updates'
import { exportOrdersCsv } from './export-csv'

/** Everything the order list shows and does, composed from the focused hooks above. */
export function useOrderListState({ orders: initialOrders, shops, drivers, areas, workspaceId, userRole, rate }: OrderListClientProps) {
  const live = useLiveOrders({ initialOrders, shops, drivers, areas, workspaceId })
  const filters = useOrderFilters(live.orders)
  const canManage = userRole === 'owner' || userRole === 'manager'
  const isOwner = userRole === 'owner'
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null)
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false)
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [isReturnsHandoverOpen, setIsReturnsHandoverOpen] = useState(false)

  const selection = useOrderSelection({
    workspaceId,
    drivers,
    isOwner,
    filteredOrders: filters.filteredOrders,
    setOrders: live.setOrders,
    editingOrder,
    setEditingOrder,
  })
  const updates = useOrderUpdates({ workspaceId, drivers, setOrders: live.setOrders })

  return {
    shops,
    drivers,
    areas,
    workspaceId,
    userRole,
    rate,
    canManage,
    isOwner,
    ...live,
    ...filters,
    ...selection,
    ...updates,
    receiptOrder,
    setReceiptOrder,
    isBulkImportOpen,
    setIsBulkImportOpen,
    isScannerOpen,
    setIsScannerOpen,
    editingOrder,
    setEditingOrder,
    openEditOrderModal: setEditingOrder,
    isReturnsHandoverOpen,
    setIsReturnsHandoverOpen,
    handleExportCsv: () => exportOrdersCsv(filters.filteredOrders),
  }
}

export type OrderListState = ReturnType<typeof useOrderListState>
