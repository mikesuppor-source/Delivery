/**
 * lib/map.ts
 * Pure helpers for the live courier map: courier status, and the HTML drawn on map markers.
 *
 * Leaflet takes marker and popup content as HTML strings, and some of the text in them comes from
 * customers (the public parcel form accepts a recipient name and address, and a customer can pin
 * their own order on the map). Every value is escaped here, so text can never become markup.
 */

export type DriverStatus = 'active' | 'idle' | 'offline'

export interface PositionedDriver {
  last_seen_at?: string | null
  current_lat?: number | null
  current_lng?: number | null
}

/** Active within 15 minutes of the last GPS fix, idle within 45, otherwise (or with no fix) offline. */
export function driverStatus(driver: PositionedDriver, now: number = Date.now()): DriverStatus {
  if (!driver.last_seen_at || driver.current_lat == null || driver.current_lng == null) return 'offline'
  const minutes = (now - new Date(driver.last_seen_at).getTime()) / 60000
  if (minutes <= 15) return 'active'
  if (minutes <= 45) return 'idle'
  return 'offline'
}

export const STATUS_COLORS: Record<DriverStatus, string> = {
  active: '#059669',
  idle: '#d97706',
  offline: '#64748b',
}

/** Escapes text for use inside HTML, including inside quoted attributes. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string)
}

/**
 * The pill that marks a courier on the map: vehicle, name and a status dot. Leaflet gives the marker a fixed-size box,
 * so the pill is centred on the courier's position and sized to its own text, or a long name spills out of it.
 */
export function driverPinHtml(pin: { name: string; status: DriverStatus; selected: boolean; icon: string }): string {
  const color = STATUS_COLORS[pin.status]
  return (
    `<div style="position:absolute;left:50%;top:50%;width:max-content;display:flex;align-items:center;gap:4px;background:#fff;padding:3px 8px;border-radius:20px;` +
    `border:2.5px solid ${color};box-shadow:0 4px 12px rgba(0,0,0,0.25);font-family:inherit;cursor:pointer;` +
    `transform:translate(-50%,-50%) scale(${pin.selected ? 1.15 : 1});transition:transform 0.2s;white-space:nowrap;">` +
    `<span style="font-size:14px;">${escapeHtml(pin.icon)}</span>` +
    `<span style="font-size:11px;font-weight:800;color:#1e293b;">${escapeHtml(pin.name)}</span>` +
    `<span style="width:8px;height:8px;border-radius:50%;background:${color};margin-left:2px;"></span>` +
    `</div>`
  )
}

/** The numbered circle for a delivery stop. */
export function stopPinHtml(number: number): string {
  return (
    `<div style="background:#0284c7;color:#fff;font-size:11px;font-weight:900;width:24px;height:24px;border-radius:50%;` +
    `display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);">` +
    `${escapeHtml(Math.trunc(number))}</div>`
  )
}

/** The popup that opens on a stop. Recipient details are customer-supplied text. */
export function stopPopupHtml(stop: { number: number; code: string; recipientName?: string | null; recipientAddress?: string | null }): string {
  return (
    `<div style="font-family:inherit;font-size:12px;padding:4px;">` +
    `<b>Stop #${escapeHtml(Math.trunc(stop.number))}: ${escapeHtml(stop.code)}</b><br/>` +
    `<span>${escapeHtml(stop.recipientName || 'Customer')}</span><br/>` +
    `<small style="color:#64748b;">${escapeHtml(stop.recipientAddress || '')}</small>` +
    `</div>`
  )
}
