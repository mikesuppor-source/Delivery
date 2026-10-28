'use client'

import { BarcodeScannerModal } from '@/components/barcode-scanner-modal'
import { useOrderList } from '../context'

export function ScannerModal() {
  const { drivers, isScannerOpen, orders, setIsScannerOpen, setOrders, workspaceId } = useOrderList()
  return (
    <>
      {/* ─── MODAL: WAREHOUSE BARCODE & QR SCANNER ─── */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        orders={orders}
        drivers={drivers}
        workspaceId={workspaceId}
        onOrderUpdated={updated => {
          setOrders(prev => prev.map(o => (o.id === updated.id ? { ...o, ...updated } : o)))
        }}
      />
    </>
  )
}
