'use client'

import React from 'react'
import { usePortal } from '../context'
import { ShopifyIntegrationModal } from '@/components/shopify-integration-modal'
import { BulkOrderImportModal } from '@/components/bulk-order-import-modal'

export function IntegrationsModals() {
  const {
    shop,
    setOrders,
    isShopifyModalOpen,
    setIsShopifyModalOpen,
    isBulkImportModalOpen,
    setIsBulkImportModalOpen,
  } = usePortal()

  return (
    <>
      {/* ─── SHOPIFY INTEGRATION MODAL ─── */}
      <ShopifyIntegrationModal
        isOpen={isShopifyModalOpen}
        onClose={() => setIsShopifyModalOpen(false)}
        shop={shop}
        onOrderCreated={newOrder => {
          setOrders(prev => [newOrder as any, ...prev])
        }}
      />

      {/* ─── BULK ORDER IMPORT MODAL (SHOPIFY / EXCEL CSV) ─── */}
      <BulkOrderImportModal
        isOpen={isBulkImportModalOpen}
        onClose={() => setIsBulkImportModalOpen(false)}
        workspaceId={shop.workspace_id || ''}
        shopId={shop.id}
        shopName={shop.name}
        onImportComplete={() => {
          window.location.reload()
        }}
      />
    </>
  )
}
