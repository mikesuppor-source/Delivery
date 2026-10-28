'use client'

import { RunSheetProvider } from './run-sheet/context'
import { useRunSheetState } from './run-sheet/use-run-sheet'
import type { RunSheetProps } from './run-sheet/shared'
import { RunSheetHeader } from './run-sheet/sections/header'
import { OfflineBanner } from './run-sheet/sections/offline-banner'
import { RunSheetToast } from './run-sheet/sections/toast'
import { InAppBrowserWarning } from './run-sheet/sections/in-app-browser-warning'
import { InstallBar } from './run-sheet/sections/install-bar'
import { PushBanner } from './run-sheet/sections/push-banner'
import { MetricCards } from './run-sheet/sections/metric-cards'
import { SearchAndTabs } from './run-sheet/sections/search-and-tabs'
import { GpsPanel } from './run-sheet/sections/gps-panel'
import { OrderList } from './run-sheet/sections/order-list'
import { DeliveryModals } from './run-sheet/sections/delivery-modals'
import { InstallGuideModal } from './run-sheet/sections/install-guide-modal'
import { ShiftSummaryModal } from './run-sheet/sections/shift-summary-modal'
import { CityPickerModal } from './run-sheet/sections/city-picker-modal'
import { GpsHelpModal } from './run-sheet/sections/gps-help-modal'

export type { DriverRunSheetOrder, DriverInfo, OfflineSyncItem } from './run-sheet/shared'
export { LEBANON_QUICK_CITIES } from './run-sheet/shared'

// Courier run sheet. State lives in ./run-sheet/use-*.ts hooks; each part of the
// screen is a component in ./run-sheet/sections reading that state via context.
export function DriverRunSheetClient(props: RunSheetProps) {
  const state = useRunSheetState(props)

  return (
    <RunSheetProvider value={state}>
      <div
        dir={state.lang === 'ar' ? 'rtl' : 'ltr'}
        className="theme-courier"
        style={{
          minHeight: '100vh',
          background: '#0f172a',
          color: '#f8fafc',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          paddingBottom: 60,
        }}
      >
        <RunSheetHeader />
        <OfflineBanner />
        <RunSheetToast />

        <main style={{ maxWidth: 640, margin: '0 auto', padding: '16px' }}>
          <InAppBrowserWarning />
          <InstallBar />
          <PushBanner />
          <MetricCards />
          <SearchAndTabs />
          <GpsPanel />
          <OrderList />
        </main>

        <DeliveryModals />
        <InstallGuideModal />
        <ShiftSummaryModal />
        <CityPickerModal />
        <GpsHelpModal />
      </div>
    </RunSheetProvider>
  )
}
