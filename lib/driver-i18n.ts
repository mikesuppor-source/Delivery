/**
 * lib/driver-i18n.ts
 * Backward-compatibility wrapper pointing to the unified lib/i18n module.
 */

import { useDriverTranslation as useUnifiedDriverTranslation, DRIVER_STRINGS as UNIFIED_STRINGS, type Locale } from './i18n'

export type DriverLang = Locale

export const DRIVER_STRINGS = UNIFIED_STRINGS

export function useDriverTranslation(lang: DriverLang) {
  return useUnifiedDriverTranslation(lang)
}
