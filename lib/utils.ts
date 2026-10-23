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
