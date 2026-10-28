'use client'

import { Modal } from '@/components/modal'
import { OrderReceiptSlip } from '@/components/order-receipt-slip'
import { BulkOrderImportModal } from '@/components/bulk-order-import-modal'
import { useOrderList } from '../context'

export function ReceiptAndImportModals() {
  const { isBulkImportOpen, rate, receiptOrder, setIsBulkImportOpen, setReceiptOrder, shops, workspaceId } = useOrderList()
  return (
    <>
      {/* ─── MODAL: ORDER WAYBILL RECEIPT SLIP (BARCODE & QR CODE) ─── */}
      {receiptOrder && (
        <Modal
          isOpen={!!receiptOrder}
          onClose={() => setReceiptOrder(null)}
          title={`Waybill Receipt #${receiptOrder.code}`}
        >
          <div style={{ maxHeight: '82vh', overflowY: 'auto', padding: '6px 2px' }}>
            <OrderReceiptSlip
              order={receiptOrder}
              workspaceRate={rate}
              workspaceName="Cedar Delivery Desk"
            />
          </div>
        </Modal>
      )}

      {/* ─── MODAL: BULK CSV / SHOPIFY ORDER IMPORT ─── */}
      <BulkOrderImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        workspaceId={workspaceId}
        shops={shops}
        onImportComplete={() => window.location.reload()}
      />
    </>
  )
}
