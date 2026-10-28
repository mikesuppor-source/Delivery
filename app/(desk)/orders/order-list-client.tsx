'use client'

import { OrderListProvider } from './order-list/context'
import { useOrderListState } from './order-list/use-order-list-state'
import type { OrderListClientProps } from './order-list/types'
import { OrdersHeader } from './order-list/sections/header'
import { StatusTabs } from './order-list/sections/status-tabs'
import { DateToolbar } from './order-list/sections/date-toolbar'
import { OrdersTable } from './order-list/sections/orders-table'
import { BulkActionsBar } from './order-list/sections/bulk-actions-bar'
import { ScannerModal } from './order-list/sections/scanner-modal'
import { DriverRequiredModal } from './order-list/sections/driver-required-modal'
import { EditOrderModal } from './order-list/sections/edit-order-modal'
import { ReceiptAndImportModals } from './order-list/sections/receipt-and-import'

// Desk order list. State lives in ./order-list/use-*.ts hooks; each part of the
// screen is a component in ./order-list/sections reading that state via context.
export function OrderListClient(props: OrderListClientProps) {
  const state = useOrderListState(props)

  return (
    <OrderListProvider value={state}>
      <OrdersHeader />
      <StatusTabs />
      <DateToolbar />
      <OrdersTable />
      <BulkActionsBar />
      <ScannerModal />
      <DriverRequiredModal />
      {state.editingOrder && (
        <EditOrderModal key={state.editingOrder.id} editingOrder={state.editingOrder} onClose={() => state.setEditingOrder(null)} />
      )}
      <ReceiptAndImportModals />
    </OrderListProvider>
  )
}
