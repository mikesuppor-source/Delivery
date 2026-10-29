'use client'

import React from 'react'
import { HeaderSection } from './sections/header-section'
import { KpiSection } from './sections/kpi-section'
import { OrdersSection } from './sections/orders-section'
import { CreateOrderModal } from './sections/create-order-modal'
import { OrderModals } from './sections/order-modals'
import { CashoutModal } from './sections/cashout-modal'
import { IntegrationsModals } from './sections/integrations-modals'

export function PortalView() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <HeaderSection />
      <KpiSection />
      <OrdersSection />
      <CreateOrderModal />
      <OrderModals />
      <CashoutModal />
      <IntegrationsModals />
    </div>
  )
}
