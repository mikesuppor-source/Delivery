'use client'

import React, { useState } from 'react'
import { usePortal } from '../context'
import { useI18n } from '@/lib/i18n'
import { statementPeriod, type StatementPreset } from '@/lib/finance'

const PERIODS: Array<[StatementPreset, string]> = [
  ['this_month', 'This month'],
  ['last_month', 'Last month'],
  ['last_30_days', 'Last 30 days'],
  ['this_year', 'This year'],
]

/** The shop's own account statement as a PDF: orders, fees, payouts and the balance. */
export function StatementSection() {
  const { shop } = usePortal()
  const { t, locale } = useI18n()
  const [period, setPeriod] = useState<StatementPreset>('last_month')
  const { from, to } = statementPeriod(period)
  const href = (lang: 'en' | 'ar') => `/api/statements/shop?shopId=${encodeURIComponent(shop.id)}&from=${from}&to=${to}&format=pdf${lang === 'ar' ? '&lang=ar' : ''}`
  const language = locale === 'ar' ? 'ar' : 'en'

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1.5px solid var(--line)',
        borderRadius: 14,
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 14,
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 800 }}>{t('Account statement')}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('Your orders, delivery fees, payouts and balance for a period, as a PDF.')}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <select aria-label={t('Statement period')} value={period} onChange={e => setPeriod(e.target.value as StatementPreset)} style={{ fontSize: 13, padding: '8px 10px' }}>
          {PERIODS.map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
        </select>
        <a className="btn btn-primary" href={href(language)} download>
          {t('Download PDF')}
        </a>
        <a className="btn btn-secondary" href={href(language === 'ar' ? 'en' : 'ar')} download>
          {language === 'ar' ? t('English PDF') : t('Arabic PDF (عربي)')}
        </a>
      </div>
    </div>
  )
}
