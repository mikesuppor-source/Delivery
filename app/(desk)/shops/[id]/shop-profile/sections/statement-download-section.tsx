'use client'

import React, { useEffect, useState } from 'react'
import { useShopProfile } from '../context'
import { useI18n } from '@/lib/i18n'
import { statementPeriod, statementTotals, type ShopStatement, type StatementPreset } from '@/lib/finance'
import { formatUSD } from '@/lib/utils'
import { getWhatsAppUrl } from '@/lib/whatsapp'

type Choice = StatementPreset | 'custom'
const CHOICES: Array<[Choice, string]> = [
  ['this_month', 'This month'],
  ['last_month', 'Last month'],
  ['last_30_days', 'Last 30 days'],
  ['this_year', 'This year'],
  ['custom', 'Custom dates'],
]

/** Download the shop's account statement as a PDF, email it, or send its figures by WhatsApp. */
export function StatementDownloadSection() {
  const { shop, workspace } = useShopProfile()
  const { t, locale } = useI18n()
  const [choice, setChoice] = useState<Choice>('last_month')
  const [custom, setCustom] = useState(() => statementPeriod('this_month'))
  const period = choice === 'custom' ? custom : statementPeriod(choice)
  const query = `shopId=${encodeURIComponent(shop.id)}&from=${period.from}&to=${period.to}`
  const validRange = period.from <= period.to

  // The PDF is offered in the language of the screen, and in the other one beside it
  const pdfLang = locale === 'ar' ? 'ar' : 'en'
  const pdfHref = (lang: 'en' | 'ar') => `/api/statements/shop?${query}&format=pdf${lang === 'ar' ? '&lang=ar' : ''}`

  const [statement, setStatement] = useState<ShopStatement | null>(null)
  const [error, setError] = useState('')

  const [emailLang, setEmailLang] = useState<'en' | 'ar' | null>(null)
  const [emailing, setEmailing] = useState(false)
  const [emailResult, setEmailResult] = useState<{ ok: boolean; text: string } | null>(null)

  async function emailStatement() {
    setEmailing(true)
    setEmailResult(null)
    try {
      const res = await fetch('/api/statements/shop/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopId: shop.id, from: period.from, to: period.to, lang: emailLang ?? pdfLang }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || t('The email could not be sent.'))
      setEmailResult({ ok: true, text: t('Statement sent to {address}', { address: data.sentTo }) })
    } catch (err) {
      setEmailResult({ ok: false, text: err instanceof Error ? err.message : t('The email could not be sent.') })
    } finally {
      setEmailing(false)
    }
  }

  useEffect(() => {
    if (!validRange) return
    let current = true
    setStatement(null)
    setError('')
    fetch(`/api/statements/shop?${query}&format=json`)
      .then(async res => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not load the statement')
        if (current) setStatement(data.statement)
      })
      .catch(err => current && setError(err instanceof Error ? err.message : 'Could not load the statement'))
    return () => { current = false }
  }, [query, validRange])

  const totals = statement ? statementTotals(statement) : null
  const whatsappMessage = statement && totals
    ? t('Hello {shop}, your {company} account statement for {from} to {to}: opening balance {opening}, orders {orders}, payouts {payouts}, closing balance {closing}. The full statement is in your merchant portal.', {
        shop: shop.name,
        company: workspace.name,
        from: period.from,
        to: period.to,
        opening: formatUSD(statement.opening_usd),
        orders: formatUSD(totals.orders),
        payouts: formatUSD(totals.payouts),
        closing: formatUSD(statement.closing_usd),
      })
    : ''

  return (
    <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--line)' }}>
      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{t('Account statement for {name}', { name: shop.name })}</h3>
      <p style={{ margin: '4px 0 16px', fontSize: 13, color: 'var(--muted)' }}>
        {t('Opening balance, every delivered or returned order, the payouts made, and the closing balance. Pick a period, then download the PDF.')}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        {CHOICES.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={choice === key}
            className={`btn btn-sm ${choice === key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setChoice(key)}
            style={{ fontSize: 12, padding: '4px 12px' }}
          >
            {t(label)}
          </button>
        ))}
        {choice === 'custom' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="date" aria-label={t('From')} value={custom.from} max={custom.to} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} style={{ fontSize: 12.5, padding: '4px 8px' }} />
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>{t('to')}</span>
            <input type="date" aria-label={t('To')} value={custom.to} min={custom.from} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} style={{ fontSize: 12.5, padding: '4px 8px' }} />
          </span>
        )}
      </div>

      {!validRange && <p role="alert" style={{ color: 'var(--danger, #b91c1c)', fontSize: 13 }}>{t('The end date must be on or after the start date.')}</p>}
      {error && <p role="alert" style={{ color: 'var(--danger, #b91c1c)', fontSize: 13 }}>{error === 'Could not load the statement' ? t(error) : error}</p>}

      {statement && totals && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
          {([
            ['Opening balance', statement.opening_usd],
            ['Orders', totals.orders],
            ['Payouts', totals.payouts],
            ...(totals.adjustments !== 0 ? [['Adjustments', totals.adjustments] as [string, number]] : []),
            ['Closing balance', statement.closing_usd],
          ] as Array<[string, number]>).map(([label, value]) => (
            <div key={label} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{t(label)}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: value < 0 ? '#b91c1c' : 'inherit' }}>{formatUSD(value)}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {validRange ? (
          <a className="btn btn-primary" href={pdfHref(pdfLang)} download>{t('Download PDF statement')}</a>
        ) : (
          <button type="button" className="btn btn-primary" disabled>{t('Download PDF statement')}</button>
        )}
        {validRange && (
          <a className="btn btn-secondary" href={pdfHref(pdfLang === 'ar' ? 'en' : 'ar')} download>
            {pdfLang === 'ar' ? t('Download in English') : t('Download in Arabic (عربي)')}
          </a>
        )}
        {shop.phone && whatsappMessage && (
          <a className="btn btn-secondary" href={getWhatsAppUrl(shop.phone, whatsappMessage)} target="_blank" rel="noopener noreferrer">
            {t('Send summary on WhatsApp')}
          </a>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <select aria-label={t('Email language')} value={emailLang ?? pdfLang} onChange={e => setEmailLang(e.target.value as 'en' | 'ar')} style={{ fontSize: 13, padding: '6px 10px', width: 'auto' }}>
          <option value="en">{t('English')}</option>
          <option value="ar">{t('Arabic (عربي)')}</option>
        </select>
        <button type="button" className="btn btn-secondary" disabled={!validRange || !shop.contact_email || emailing} onClick={emailStatement}>
          {emailing ? t('Sending...') : t('Email statement to shop')}
        </button>
        {!shop.contact_email && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t("Add the shop's email under Edit Store to send statements by email.")}</span>}
      </div>
      {emailResult && (
        <p role={emailResult.ok ? 'status' : 'alert'} style={{ margin: '10px 0 0', fontSize: 13, color: emailResult.ok ? 'var(--brand)' : 'var(--danger, #b91c1c)' }}>
          {emailResult.text}
        </p>
      )}
    </div>
  )
}
