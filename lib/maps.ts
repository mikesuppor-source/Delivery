/**
 * Google Maps URL builders for 1-tap navigation and directions
 */

export function getGoogleMapsUrl(address?: string | null): string {
  if (!address || !address.trim()) return '#'
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`
}

export function getGoogleMapsDirectionsUrl(address?: string | null): string {
  if (!address || !address.trim()) return '#'
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address.trim())}`
}
