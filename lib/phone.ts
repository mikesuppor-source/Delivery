/**
 * Lebanese Phone Number Validator & Formatter
 * Supports Lebanese mobile operators (Alfa, Touch) and landlines
 */

export function cleanPhone(raw: string): string {
  return raw.replace(/[^0-9+]/g, '').trim()
}

export function isValidLebanesePhone(phone: string): boolean {
  if (!phone) return false
  const cleaned = cleanPhone(phone)

  // Remove leading + or 00
  let digits = cleaned.replace(/^\+/, '').replace(/^00/, '')

  // If starts with 961 country code, strip it
  if (digits.startsWith('961')) {
    digits = digits.slice(3)
  }

  // Remove leading 0 if present (e.g. 03 -> 3, 070 -> 70)
  if (digits.startsWith('0')) {
    digits = digits.slice(1)
  }

  // Lebanese mobile numbers:
  // 3 (7 digits total: 3XXXXXX)
  // 70, 71, 76, 78, 79, 81 (8 digits total: 70XXXXXX)
  // Landlines: 1, 4, 5, 7, 8, 9 (7 digits total)
  if (/^3\d{6}$/.test(digits)) return true
  if (/^(70|71|76|78|79|81)\d{6}$/.test(digits)) return true
  if (/^[145789]\d{6}$/.test(digits)) return true

  // Fallback for general international numbers (at least 7 to 15 digits)
  return digits.length >= 7 && digits.length <= 15
}

export function formatLebanesePhone(phone: string): string {
  if (!phone) return ''
  const cleaned = cleanPhone(phone)
  let digits = cleaned.replace(/^\+/, '').replace(/^00/, '')

  const countryCode = '+961'
  if (digits.startsWith('961')) {
    digits = digits.slice(3)
  }
  if (digits.startsWith('0')) {
    digits = digits.slice(1)
  }

  if (digits.length === 7 && digits.startsWith('3')) {
    return `${countryCode} 3 ${digits.slice(1, 4)} ${digits.slice(4)}`
  }
  if (digits.length === 8 && /^(70|71|76|78|79|81)/.test(digits)) {
    return `${countryCode} ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`
  }

  return cleaned.startsWith('+') ? cleaned : `+961 ${digits}`
}
