'use client'

import React from 'react'

export interface MoneyTextProps {
  amount: number | string | null | undefined
  currency?: 'USD' | 'LBP'
  highlightNegative?: boolean
  highlightPositive?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  showPlus?: boolean
}

export function MoneyText({
  amount,
  currency = 'USD',
  highlightNegative = true,
  highlightPositive = false,
  size = 'md',
  className = '',
  showPlus = false,
}: MoneyTextProps) {
  const num = typeof amount === 'number' ? amount : Number(amount) || 0
  const isNegative = num < 0
  const isPositive = num > 0

  let formatted: string
  if (currency === 'USD') {
    const absVal = Math.abs(num).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    formatted = `${isNegative ? '-' : ''}$${absVal}`
  } else {
    const absVal = Math.round(Math.abs(num)).toLocaleString('en-US')
    formatted = `${isNegative ? '-' : ''}${absVal} LBP`
  }

  if (showPlus && isPositive) {
    formatted = `+${formatted}`
  }

  const toneClass =
    isNegative && highlightNegative
      ? 'ui-money--negative'
      : isPositive && highlightPositive
      ? 'ui-money--positive'
      : ''

  return (
    <span
      className={`ui-money tabular-nums ui-money--${size} ${toneClass} ${className}`.trim()}
      dir="ltr"
    >
      {formatted}
    </span>
  )
}
