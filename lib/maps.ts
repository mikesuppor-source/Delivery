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

/**
 * Haversine formula to compute great-circle distance between two GPS coordinates in kilometers.
 */
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c * 10) / 10
}

/**
 * Format distance cleanly for mobile courier UI
 */
export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)}m away`
  }
  return `${km.toFixed(1)} km away`
}

/**
 * Known centroid coordinates for Lebanese governorates and major delivery areas.
 * Used as a fallback when orders have text-only area/city without GPS coordinates.
 */
export const LEBANON_REGION_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  // Beirut & Suburbs
  beirut: { lat: 33.8938, lng: 35.5018 },
  achrafieh: { lat: 33.8886, lng: 35.5161 },
  hamra: { lat: 33.8967, lng: 35.4828 },
  verdun: { lat: 33.8872, lng: 35.4856 },
  'ras beirut': { lat: 33.8975, lng: 35.4744 },
  'mar mikhael': { lat: 33.8983, lng: 35.5256 },
  gemmayze: { lat: 33.8961, lng: 35.5133 },
  badaro: { lat: 33.8744, lng: 35.5167 },

  // Mount Lebanon / Metn / Baabda / Keserwan / Chouf / Aley
  metn: { lat: 33.8860, lng: 35.5683 },
  'sin el fil': { lat: 33.8767, lng: 35.5333 },
  dekwaneh: { lat: 33.8867, lng: 35.5417 },
  bourj_hammoud: { lat: 33.8944, lng: 35.5389 },
  'bourj hammoud': { lat: 33.8944, lng: 35.5389 },
  antelias: { lat: 33.9167, lng: 35.5833 },
  dbayeh: { lat: 33.9500, lng: 35.5900 },
  zalqa: { lat: 33.9050, lng: 35.5700 },
  baabda: { lat: 33.8333, lng: 35.5333 },
  hadath: { lat: 33.8444, lng: 35.5278 },
  hazmieh: { lat: 33.8611, lng: 35.5389 },
  choueifat: { lat: 33.8083, lng: 35.5167 },
  aley: { lat: 33.8058, lng: 35.6025 },
  bhamdoun: { lat: 33.8089, lng: 35.6569 },
  jounieh: { lat: 33.9808, lng: 35.6178 },
  kaslik: { lat: 33.9789, lng: 35.6144 },
  sarba: { lat: 33.9867, lng: 35.6200 },
  jbeil: { lat: 34.1226, lng: 35.6517 },
  byblos: { lat: 34.1226, lng: 35.6517 },
  chouf: { lat: 33.6958, lng: 35.5800 },
  damour: { lat: 33.7333, lng: 35.4500 },

  // North Lebanon & Akkar
  tripoli: { lat: 34.4367, lng: 35.8497 },
  'el mina': { lat: 34.4444, lng: 35.8222 },
  batroun: { lat: 34.2553, lng: 35.6581 },
  koura: { lat: 34.3389, lng: 35.8089 },
  zgharta: { lat: 34.3989, lng: 35.8947 },
  bcharre: { lat: 34.2500, lng: 36.0111 },
  akkar: { lat: 34.5458, lng: 36.0786 },
  halba: { lat: 34.5428, lng: 36.0800 },

  // South Lebanon & Nabatieh
  saida: { lat: 33.5631, lng: 35.3689 },
  sidon: { lat: 33.5631, lng: 35.3689 },
  sour: { lat: 33.2733, lng: 35.1939 },
  tyre: { lat: 33.2733, lng: 35.1939 },
  nabatieh: { lat: 33.3789, lng: 35.4839 },
  jezzen: { lat: 33.5417, lng: 35.5833 },
  jezzine: { lat: 33.5417, lng: 35.5833 },
  marjayoun: { lat: 33.3600, lng: 35.5900 },
  bint_jbeil: { lat: 33.1250, lng: 35.4333 },
  'bint jbeil': { lat: 33.1250, lng: 35.4333 },

  // Bekaa & Baalbek
  zahle: { lat: 33.8463, lng: 35.9020 },
  zahlé: { lat: 33.8463, lng: 35.9020 },
  chtoura: { lat: 33.8167, lng: 35.8500 },
  baalbek: { lat: 34.0058, lng: 36.2181 },
  hermel: { lat: 34.3944, lng: 36.3847 },
  west_bekaa: { lat: 33.6167, lng: 35.7833 },
  'west bekaa': { lat: 33.6167, lng: 35.7833 },
  rashaya: { lat: 33.5000, lng: 35.8500 },
}

export function getLebanonAreaCoordinates(areaOrAddress?: string | null): { lat: number; lng: number } | null {
  if (!areaOrAddress || !areaOrAddress.trim()) return null
  const clean = areaOrAddress.toLowerCase().trim()
  for (const [key, coords] of Object.entries(LEBANON_REGION_CENTROIDS)) {
    if (clean.includes(key)) {
      return coords
    }
  }
  return null
}


