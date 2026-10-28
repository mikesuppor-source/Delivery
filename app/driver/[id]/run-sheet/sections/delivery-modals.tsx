'use client'

import { DeliveryPodModal } from '../../delivery-pod-modal'
import { DeliveryFailModal } from '../../delivery-fail-modal'
import { DeliveryPodViewModal } from '../../delivery-pod-view-modal'
import { useRunSheet } from '../context'

export function DeliveryModals() {
  const { failModalOrder, handleUpdateStatus, podModalOrder, rate, setFailModalOrder, setPodModalOrder, setViewPodOrder, viewPodOrder } = useRunSheet()
  return (
    <>
      {/* ─── PROOF OF DELIVERY MODAL ─── */}
      {podModalOrder && (
        <DeliveryPodModal
          order={podModalOrder}
          rate={rate}
          onClose={() => setPodModalOrder(null)}
          onConfirm={async podData => {
            await handleUpdateStatus(podModalOrder.id, 'delivered', podData)
          }}
        />
      )}

      {/* ─── DELIVERY FAILURE / POSTPONE MODAL ─── */}
      {failModalOrder && (
        <DeliveryFailModal
          order={failModalOrder}
          onClose={() => setFailModalOrder(null)}
          onConfirm={async failData => {
            await handleUpdateStatus(failModalOrder.id, failData.status, {
              failureReason: failData.failureReason,
              notes: failData.notes,
            })
          }}
        />
      )}

      {/* ─── DIGITAL POD VIEWER MODAL ─── */}
      {viewPodOrder && (
        <DeliveryPodViewModal
          order={viewPodOrder}
          onClose={() => setViewPodOrder(null)}
        />
      )}
    </>
  )
}
