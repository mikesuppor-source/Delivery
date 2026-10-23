/** Format USD amount */
export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

/** Format LBP amount */
export function formatLBP(amount: number): string {
  return new Intl.NumberFormat('en-LB', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + ' LBP'
}

/** Convert USD to LBP using saved rate */
export function usdToLbp(usd: number, rate: number): number {
  return Math.round(usd * rate)
}

/** Format date for display */
export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Beirut',
  }).format(new Date(dateStr))
}

/** Format date only */
export function formatDateOnly(dateStr: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Beirut',
  }).format(new Date(dateStr))
}

/** Truncate text */
export function truncate(str: string, max = 40): string {
  return str.length > max ? str.slice(0, max) + '…' : str
}

/** Order status display */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  picked_up: 'Picked up',
  delivered: 'Delivered',
  failed: 'Failed',
  returned: 'Returned',
}

export const ORDER_STATUS_COLORS: Record<string, string> = {
  pending: '#b8860b',
  assigned: '#2e6da4',
  picked_up: '#5a6e2c',
  delivered: '#24634f',
  failed: '#c0392b',
  returned: '#777',
}

/** Role display */
export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  driver: 'Driver',
  readonly: 'Read-only',
}

/** Date filtering presets */
export type DateRangePreset = 'all' | 'today' | 'this_month' | 'last_month' | 'this_year' | 'last_year' | 'custom'

export function isDateInPreset(
  dateStr: string,
  preset: DateRangePreset,
  customStart?: string,
  customEnd?: string
): boolean {
  if (preset === 'all') return true
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return false

  const now = new Date()

  if (preset === 'today') {
    return d.toDateString() === now.toDateString()
  }

  if (preset === 'this_month') {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }

  if (preset === 'last_month') {
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return d.getFullYear() === prevMonth.getFullYear() && d.getMonth() === prevMonth.getMonth()
  }

  if (preset === 'this_year') {
    return d.getFullYear() === now.getFullYear()
  }

  if (preset === 'last_year') {
    return d.getFullYear() === now.getFullYear() - 1
  }

  if (preset === 'custom') {
    if (customStart && new Date(dateStr) < new Date(customStart)) return false
    if (customEnd) {
      const end = new Date(customEnd)
      end.setHours(23, 59, 59, 999)
      if (new Date(dateStr) > end) return false
    }
    return true
  }

  return true
}

export function getDateRangeLabel(preset: DateRangePreset, customStart?: string, customEnd?: string): string {
  const now = new Date()
  if (preset === 'today') return 'Today (' + now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ')'
  if (preset === 'this_month') return 'This Month (' + now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) + ')'
  if (preset === 'last_month') {
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return 'Last Month (' + prevMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) + ')'
  }
  if (preset === 'this_year') return 'This Year (' + now.getFullYear() + ')'
  if (preset === 'last_year') return 'Last Year (' + (now.getFullYear() - 1) + ')'
  if (preset === 'custom') {
    if (customStart && customEnd) return `${customStart} to ${customEnd}`
    return 'Custom Range'
  }
  return 'All Time'
}

