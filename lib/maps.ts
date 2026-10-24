/**
 * Smart Navigation & Location Resolver for Lebanon & International Delivery Dispatch
 * Handles:
 *  - Direct Google Maps links (e.g. maps.app.goo.gl, goo.gl/maps, maps.google.com)
 *  - GPS Latitude / Longitude coordinates (e.g. 33.8938, 35.5018)
 *  - Textual addresses with automatic Lebanese geocoding disambiguation
 *  - 1-tap Google Maps Navigation & Waze Navigation links for couriers
 */

export interface ParsedLocation {
  isUrl: boolean
  isCoords: boolean
  lat?: number
  lng?: number
  url?: string
  cleanAddress: string
  navigationQuery: string
}

/**
 * Extract GPS coordinates or links from any freeform address input
 */
export function parseLocation(address?: string | null): ParsedLocation {
  if (!address || !address.trim()) {
    return {
      isUrl: false,
      isCoords: false,
      cleanAddress: '',
      navigationQuery: '',
    }
  }

  const raw = address.trim()

  // 1. Check for URL anywhere in the string
  const urlMatch = raw.match(/https?:\/\/[^\s]+/i)
  if (urlMatch) {
    const foundUrl = urlMatch[0]

    // Check if URL has coordinates in query param e.g. ?q=33.8938,35.5018 or @33.8938,35.5018
    const coordInUrl = foundUrl.match(/(?:[?&]q=|@|destination=)(-?\d{1,2}\.\d{3,8}),\s*(-?\d{1,3}\.\d{3,8})/i)
    if (coordInUrl) {
      const lat = parseFloat(coordInUrl[1])
      const lng = parseFloat(coordInUrl[2])
      return {
        isUrl: true,
        isCoords: true,
        lat,
        lng,
        url: foundUrl,
        cleanAddress: raw,
        navigationQuery: `${lat},${lng}`,
      }
    }

    return {
      isUrl: true,
      isCoords: false,
      url: foundUrl,
      cleanAddress: raw,
      navigationQuery: foundUrl,
    }
  }

  // 2. Check for explicit coordinates e.g. "33.8938, 35.5018" or "33.8938 35.5018"
  const coordsMatch = raw.match(/(-?\d{1,2}\.\d{3,8})[\s,]+(-?\d{1,3}\.\d{3,8})/)
  if (coordsMatch) {
    const lat = parseFloat(coordsMatch[1])
    const lng = parseFloat(coordsMatch[2])
    // Basic validity bounds for Lebanon & general Earth coords
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return {
        isUrl: false,
        isCoords: true,
        lat,
        lng,
        cleanAddress: raw,
        navigationQuery: `${lat},${lng}`,
      }
    }
  }

  // 3. Text address: Ensure Lebanon context so Google Maps doesn't locate a wrong country
  let query = raw
  const hasCountryContext = /lebanon|liban|beirut|beyrouth|لبنان|بيروت/i.test(raw)
  if (!hasCountryContext) {
    query = `${raw}, Lebanon`
  }

  return {
    isUrl: false,
    isCoords: false,
    cleanAddress: raw,
    navigationQuery: query,
  }
}

/**
 * Build 1-tap Google Maps Navigation / Directions URL
 */
export function getGoogleMapsDirectionsUrl(address?: string | null): string {
  if (!address || !address.trim()) return '#'
  const loc = parseLocation(address)

  if (loc.isCoords && loc.lat && loc.lng) {
    return `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`
  }

  if (loc.isUrl && loc.url) {
    // If it's already a direct Google Maps or shortlink, opening it directly opens Google Maps app with pin
    return loc.url
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(loc.navigationQuery)}`
}

/**
 * Build 1-tap Google Maps Search / Pin URL
 */
export function getGoogleMapsUrl(address?: string | null): string {
  if (!address || !address.trim()) return '#'
  const loc = parseLocation(address)

  if (loc.isCoords && loc.lat && loc.lng) {
    return `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`
  }

  if (loc.isUrl && loc.url) {
    return loc.url
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.navigationQuery)}`
}

/**
 * Build 1-tap Waze Navigation URL (Widely preferred by motorcycle couriers in Lebanon)
 */
export function getWazeDirectionsUrl(address?: string | null): string {
  if (!address || !address.trim()) return '#'
  const loc = parseLocation(address)

  if (loc.isCoords && loc.lat && loc.lng) {
    return `https://waze.com/ul?ll=${loc.lat},${loc.lng}&navigate=yes`
  }

  if (loc.isUrl && loc.url) {
    return loc.url
  }

  return `https://waze.com/ul?q=${encodeURIComponent(loc.navigationQuery)}&navigate=yes`
}

/**
 * Cleanly format address for display (hides raw messy URL tokens while keeping readability)
 */
export function formatDisplayAddress(address?: string | null): string {
  if (!address || !address.trim()) return 'No address provided'
  const raw = address.trim()
  if (/^https?:\/\//i.test(raw)) {
    return 'Google Maps Location Pin'
  }
  return raw
}
