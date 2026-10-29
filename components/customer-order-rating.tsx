'use client'

import React, { useState } from 'react'

interface CustomerOrderRatingProps {
  trackingToken: string
  existingRating?: {
    rating: number
    comment?: string | null
  } | null
}

export function CustomerOrderRating({
  trackingToken,
  existingRating,
}: CustomerOrderRatingProps) {
  const [rating, setRating] = useState<number>(existingRating?.rating || 0)
  const [hoverRating, setHoverRating] = useState<number>(0)
  const [comment, setComment] = useState<string>(existingRating?.comment || '')
  const [submitted, setSubmitted] = useState<boolean>(Boolean(existingRating))
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const isReadOnly = submitted || Boolean(existingRating)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (rating < 1 || rating > 5) {
      setError('Please select a star rating from 1 to 5.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/orders/rating', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackingToken,
          rating,
          comment: comment.trim() || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit rating')
      }

      setSubmitted(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error submitting rating')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-6 text-center my-6">
        <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-xl mx-auto mb-2">
          ★
        </div>
        <h3 className="font-bold text-emerald-950 text-base">Thank You for Your Feedback!</h3>
        <p className="text-xs text-emerald-800 mt-1">
          You rated this delivery <strong>{rating} out of 5 stars</strong>.
        </p>
        <div className="flex items-center justify-center gap-1 mt-3">
          {[1, 2, 3, 4, 5].map(star => (
            <span
              key={star}
              className={`text-xl ${star <= rating ? 'text-amber-400' : 'text-slate-300'}`}
            >
              ★
            </span>
          ))}
        </div>
        {comment && (
          <p className="text-xs text-emerald-700 mt-3 italic bg-white/60 p-2 rounded-lg max-w-sm mx-auto">
            &ldquo;{comment}&rdquo;
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 my-6">
      <div className="text-center mb-4">
        <h3 className="font-bold text-slate-900 text-base">How was your delivery?</h3>
        <p className="text-xs text-slate-500 mt-1">
          Your feedback helps our couriers improve and maintain top service standards.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl text-center">
            {error}
          </div>
        )}

        {/* 5-STAR RATING BUTTONS */}
        <div className="flex items-center justify-center gap-2 py-2">
          {[1, 2, 3, 4, 5].map(star => {
            const active = (hoverRating || rating) >= star
            return (
              <button
                key={star}
                type="button"
                disabled={isReadOnly || submitting}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                aria-label={`${star} star`}
                className="p-1 text-3xl transition-transform hover:scale-125 focus:outline-none"
              >
                <span className={active ? 'text-amber-400' : 'text-slate-300'}>
                  ★
                </span>
              </button>
            )
          })}
        </div>

        {rating > 0 && (
          <div className="text-center text-xs font-semibold text-slate-700">
            {rating === 5 && 'Outstanding! 🌟'}
            {rating === 4 && 'Great service! 👍'}
            {rating === 3 && 'Average delivery 😐'}
            {rating === 2 && 'Needs improvement 👎'}
            {rating === 1 && 'Unsatisfactory ⚠️'}
          </div>
        )}

        {/* COMMENT AREA */}
        <div>
          <textarea
            rows={2}
            value={comment}
            onChange={e => setComment(e.target.value)}
            disabled={isReadOnly || submitting}
            placeholder="Optional comment about the driver or delivery timing..."
            className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="text-center">
          <button
            type="submit"
            disabled={rating === 0 || submitting}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition shadow-sm disabled:opacity-40"
          >
            {submitting ? 'Submitting...' : 'Submit Rating'}
          </button>
        </div>
      </form>
    </div>
  )
}
