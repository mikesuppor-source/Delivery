'use client'

import { formatUSD, formatLBP, usdToLbp } from '@/lib/utils'
import { Pill, StatCard, StatGrid } from '@/components/ui'
import { useRunSheet } from '../context'

export function MetricCards() {
  const { handleOpenShiftSummary, rate, stats, t } = useRunSheet()

  return (
    <StatGrid>
      <StatCard
        label={t('pendingDeliveries')}
        value={stats.toDeliver}
        suffix={'/ ' + stats.total}
        footnote={`${formatUSD(stats.pendingCashUsd)} ${t('codToCollect')}`}
        accentFootnote
      />
      {/* Opens the end-of-day cash handover summary */}
      <StatCard
        tone="success"
        label={t('cashInHand')}
        badge={<Pill tone="tag">{t('shiftHandoverBtn')} 📋</Pill>}
        value={formatUSD(stats.cashCollectedUsd)}
        footnote={'≈ ' + formatLBP(usdToLbp(stats.cashCollectedUsd, rate))}
        onClick={handleOpenShiftSummary}
      />
    </StatGrid>
  )
}
