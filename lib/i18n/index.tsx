'use client'

import React, { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react'
import { en, type TranslationKey } from './en'
import { ar } from './ar'
import type { Locale, Direction } from './types'

export type { Locale, Direction, TranslationKey }
export { en, ar }

export const DICTIONARIES = { en, ar } as const

/**
 * Pure translation lookup function.
 * Safely falls back to English, then to the key itself.
 */
export function t(
  key: TranslationKey | string,
  locale: Locale = 'en',
  params?: Record<string, string | number>,
): string {
  const dict = DICTIONARIES[locale] || DICTIONARIES.en
  let text: string = (dict as Record<string, string>)[key] || (en as Record<string, string>)[key] || String(key)

  if (params) {
    for (const [pKey, pVal] of Object.entries(params)) {
      text = text.replace(new RegExp(`{${pKey}}`, 'g'), String(pVal))
    }
  }
  return text
}

interface I18nContextType {
  locale: Locale
  direction: Direction
  setLocale: (locale: Locale) => void
  toggleLocale: () => void
  t: (key: TranslationKey | string, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextType>({
  locale: 'en',
  direction: 'ltr',
  setLocale: () => {},
  toggleLocale: () => {},
  t: (key, params) => t(key, 'en', params),
})

const STORAGE_KEY = 'cedar_locale'
const COOKIE_KEY = 'NEXT_LOCALE'

export function I18nProvider({
  children,
  initialLocale = 'en',
}: {
  children: ReactNode
  initialLocale?: Locale
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  useEffect(() => {
    // Check localStorage or browser language on mount
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Locale | null
      if (saved === 'en' || saved === 'ar') {
        setLocaleState(saved)
      } else if (navigator.language?.startsWith('ar')) {
        setLocaleState('ar')
      }
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }, [])

  const direction: Direction = locale === 'ar' ? 'rtl' : 'ltr'

  // Apply dir and lang to <html> on document
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale
      document.documentElement.dir = direction
      document.documentElement.setAttribute('data-locale', locale)
    }
  }, [locale, direction])

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale)
    try {
      localStorage.setItem(STORAGE_KEY, newLocale)
      document.cookie = `${COOKIE_KEY}=${newLocale}; path=/; max-age=31536000; SameSite=Lax`
    } catch {
      // Ignore storage failures
    }
  }

  const toggleLocale = () => {
    setLocale(locale === 'en' ? 'ar' : 'en')
  }

  const translate = (key: TranslationKey | string, params?: Record<string, string | number>) => {
    return t(key, locale, params)
  }

  const value = useMemo(
    () => ({
      locale,
      direction,
      setLocale,
      toggleLocale,
      t: translate,
    }),
    [locale, direction],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}

/**
 * Backward compatibility wrapper for driver app components:
 * useDriverTranslation(lang) -> t(key)
 */
export function useDriverTranslation(lang: Locale) {
  return function driverT(key: keyof typeof en): string {
    return t(key, lang)
  }
}

export const DRIVER_STRINGS = {
  en,
  ar,
} as const
