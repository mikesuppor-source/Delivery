'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { formatUSD, formatLBP } from '@/lib/utils'
import { WhatsAppIcon } from '@/components/whatsapp-icon'

interface AreaOption {
  id: string
  name: string
  fee_usd: number
  time_slots?: string[] | null
}

interface SendClientProps {
  workspaceId: string
  usdToLbp: number
  areas: AreaOption[]
}

export default function SendClient({
  workspaceId,
  usdToLbp,
  areas,
}: SendClientProps) {
  // Form State
  const [senderName, setSenderName] = useState('')
  const [senderPhone, setSenderPhone] = useState('')
  const [senderAddress, setSenderAddress] = useState('')

  const [recipientName, setRecipientName] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [recipientAddress, setRecipientAddress] = useState('')

  const [areaId, setAreaId] = useState(areas[0]?.id || '')
  const [timeSlot, setTimeSlot] = useState('')
  const [declaredValueUsd, setDeclaredValueUsd] = useState('')
  const [collectionUsd, setCollectionUsd] = useState('')
  const [notes, setNotes] = useState('')

  // Honeypot field (must stay empty)
  const [hpCheck, setHpCheck] = useState('')

  // UI state
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [createdOrder, setCreatedOrder] = useState<{
    code: string
    trackingToken: string
    trackingUrl: string
    deliveryFeeUsd: number
    collectionUsd: number
  } | null>(null)

  const selectedArea = areas.find(a => a.id === areaId) || areas[0]
  const currentFee = selectedArea ? Number(selectedArea.fee_usd) : 3
  const availableSlots =
    selectedArea?.time_slots && selectedArea.time_slots.length > 0
      ? selectedArea.time_slots
      : ['09:00 - 13:00', '13:00 - 17:00', '17:00 - 21:00']

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage(null)

    if (!senderName.trim() || !senderPhone.trim() || !senderAddress.trim()) {
      setErrorMessage('Please fill in all sender details.')
      return
    }

    if (!recipientName.trim() || !recipientPhone.trim() || !recipientAddress.trim()) {
      setErrorMessage('Please fill in all recipient details.')
      return
    }

    if (!areaId) {
      setErrorMessage('Please select a delivery zone.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          senderName,
          senderPhone,
          senderAddress,
          recipientName,
          recipientPhone,
          recipientAddress,
          areaId,
          timeSlot: timeSlot || null,
          declaredValueUsd: declaredValueUsd ? parseFloat(declaredValueUsd) : null,
          collectionUsd: collectionUsd ? parseFloat(collectionUsd) : 0,
          notes: notes.trim() || null,
          hp_website_check: hpCheck || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to book parcel')
      }

      setCreatedOrder(data.order)
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Booking request failed')
    } finally {
      setSubmitting(false)
    }
  }

  function handleReset() {
    setSenderName('')
    setSenderPhone('')
    setSenderAddress('')
    setRecipientName('')
    setRecipientPhone('')
    setRecipientAddress('')
    setDeclaredValueUsd('')
    setCollectionUsd('')
    setNotes('')
    setTimeSlot('')
    setCreatedOrder(null)
    setErrorMessage(null)
  }

  // Success Confirmation Screen
  if (createdOrder) {
    const waText = encodeURIComponent(
      `Hello Cedar Delivery! I just booked parcel #${createdOrder.code}. Please confirm pickup.`
    )
    const waUrl = `https://wa.me/?text=${waText}`

    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
          ✓
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Parcel Booked Successfully!</h2>
        <p className="text-sm text-slate-600 mt-2">
          Your delivery request has been registered. Our dispatch team will assign a courier for pickup shortly.
        </p>

        <div className="my-6 p-6 bg-slate-50 rounded-xl border border-slate-200 inline-block w-full max-w-md text-left">
          <div className="text-xs uppercase font-bold tracking-wider text-slate-500 mb-1">
            Tracking Code
          </div>
          <div className="text-2xl font-mono font-black text-slate-900 mb-4">
            {createdOrder.code}
          </div>

          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-200 text-xs">
            <div>
              <span className="text-slate-500">Delivery Fee:</span>
              <p className="font-semibold text-slate-900">
                {formatUSD(createdOrder.deliveryFeeUsd)} ({formatLBP(createdOrder.deliveryFeeUsd * usdToLbp)})
              </p>
            </div>
            <div>
              <span className="text-slate-500">Cash on Delivery:</span>
              <p className="font-semibold text-slate-900">
                {createdOrder.collectionUsd > 0 ? formatUSD(createdOrder.collectionUsd) : 'None ($0)'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-4">
          <Link
            href={createdOrder.trackingUrl}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm transition shadow-sm"
          >
            Track Parcel Live →
          </Link>

          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 font-semibold rounded-xl text-sm transition"
          >
            <WhatsAppIcon size={16} color="#059669" />
            WhatsApp Dispatch
          </a>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-100">
          <button
            onClick={handleReset}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline transition"
          >
            + Book another parcel
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Honeypot field — hidden from real users */}
      <div className="hidden" aria-hidden="true">
        <input
          type="text"
          name="hp_website_check"
          value={hpCheck}
          onChange={e => setHpCheck(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900 mb-1">Send a Parcel</h2>
        <p className="text-xs text-slate-500 mb-6">
          Schedule a courier to pick up from your doorstep and deliver to your recipient anywhere in Lebanon.
        </p>

        {errorMessage && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl">
            {errorMessage}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* SENDER COLUMN */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center">
                1
              </span>
              <h3 className="text-sm font-bold text-slate-800">Sender Details (Pickup)</h3>
            </div>

            <div>
              <label htmlFor="send-sender-name" className="block text-xs font-medium text-slate-700 mb-1">
                Your Full Name *
              </label>
              <input
                id="send-sender-name"
                data-testid="send-sender-name"
                type="text"
                required
                value={senderName}
                onChange={e => setSenderName(e.target.value)}
                placeholder="e.g. Zeina Khoury"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              />
            </div>

            <div>
              <label htmlFor="send-sender-phone" className="block text-xs font-medium text-slate-700 mb-1">
                Your Phone Number *
              </label>
              <input
                id="send-sender-phone"
                data-testid="send-sender-phone"
                type="tel"
                required
                value={senderPhone}
                onChange={e => setSenderPhone(e.target.value)}
                placeholder="e.g. 70 123 456"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              />
            </div>

            <div>
              <label htmlFor="send-sender-address" className="block text-xs font-medium text-slate-700 mb-1">
                Pickup Address *
              </label>
              <textarea
                id="send-sender-address"
                data-testid="send-sender-address"
                required
                rows={3}
                value={senderAddress}
                onChange={e => setSenderAddress(e.target.value)}
                placeholder="Building, street, floor, landmarks in Lebanon..."
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              />
            </div>
          </div>

          {/* RECIPIENT COLUMN */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">
                2
              </span>
              <h3 className="text-sm font-bold text-slate-800">Recipient Details (Drop-off)</h3>
            </div>

            <div>
              <label htmlFor="send-recipient-name" className="block text-xs font-medium text-slate-700 mb-1">
                Recipient Full Name *
              </label>
              <input
                id="send-recipient-name"
                data-testid="send-recipient-name"
                type="text"
                required
                value={recipientName}
                onChange={e => setRecipientName(e.target.value)}
                placeholder="e.g. Maya Salem"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              />
            </div>

            <div>
              <label htmlFor="send-recipient-phone" className="block text-xs font-medium text-slate-700 mb-1">
                Recipient Phone Number *
              </label>
              <input
                id="send-recipient-phone"
                data-testid="send-recipient-phone"
                type="tel"
                required
                value={recipientPhone}
                onChange={e => setRecipientPhone(e.target.value)}
                placeholder="e.g. 03 555 666"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              />
            </div>

            <div>
              <label htmlFor="send-recipient-address" className="block text-xs font-medium text-slate-700 mb-1">
                Delivery Address *
              </label>
              <textarea
                id="send-recipient-address"
                data-testid="send-recipient-address"
                required
                rows={3}
                value={recipientAddress}
                onChange={e => setRecipientAddress(e.target.value)}
                placeholder="City/town, street, building, apartment/floor..."
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              />
            </div>
          </div>
        </div>

        {/* SECTION 3: DELIVERY SETTINGS */}
        <div className="mt-8 pt-6 border-t border-slate-100">
          <div className="flex items-center gap-2 pb-4">
            <span className="w-5 h-5 rounded-full bg-slate-700 text-white text-xs font-bold flex items-center justify-center">
              3
            </span>
            <h3 className="text-sm font-bold text-slate-800">Delivery Options & Zone</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="send-area-select" className="block text-xs font-medium text-slate-700 mb-1">
                Destination Zone *
              </label>
              <select
                id="send-area-select"
                data-testid="send-area-select"
                value={areaId}
                onChange={e => setAreaId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              >
                {areas.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} — ${Number(a.fee_usd).toFixed(2)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="send-time-slot" className="block text-xs font-medium text-slate-700 mb-1">
                Preferred Time Slot
              </label>
              <select
                id="send-time-slot"
                data-testid="send-time-slot"
                value={timeSlot}
                onChange={e => setTimeSlot(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              >
                <option value="">Any time (Regular)</option>
                {availableSlots.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="send-collection-usd" className="block text-xs font-medium text-slate-700 mb-1">
                Cash on Delivery (COD) ($)
              </label>
              <input
                id="send-collection-usd"
                data-testid="send-collection-usd"
                type="number"
                min="0"
                step="0.01"
                value={collectionUsd}
                onChange={e => setCollectionUsd(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              />
              <span className="text-[10px] text-slate-400">Leave 0 if pre-paid</span>
            </div>

            <div className="sm:col-span-2 md:col-span-1">
              <label htmlFor="send-declared-value" className="block text-xs font-medium text-slate-700 mb-1">
                Declared Item Value ($)
              </label>
              <input
                id="send-declared-value"
                data-testid="send-declared-value"
                type="number"
                min="0"
                step="0.01"
                value={declaredValueUsd}
                onChange={e => setDeclaredValueUsd(e.target.value)}
                placeholder="e.g. 50"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              />
              <span className="text-[10px] text-slate-400">For parcel insurance</span>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="send-notes" className="block text-xs font-medium text-slate-700 mb-1">
                Special Delivery Notes
              </label>
              <input
                id="send-notes"
                data-testid="send-notes"
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Fragile, ring buzzer twice, call before arrival..."
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              />
            </div>
          </div>
        </div>

        {/* PRICE SUMMARY CARD */}
        <div className="mt-8 p-4 bg-emerald-50/60 rounded-xl border border-emerald-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span className="text-xs text-emerald-800 font-medium">Estimated Delivery Fee:</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-emerald-950">
                {formatUSD(currentFee)}
              </span>
              <span className="text-xs text-emerald-700 font-medium">
                ({formatLBP(currentFee * usdToLbp)})
              </span>
            </div>
          </div>

          <button
            id="send-submit-btn"
            data-testid="send-submit-btn"
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? 'Booking Parcel...' : 'Book Parcel Delivery →'}
          </button>
        </div>
      </div>
    </form>
  )
}
