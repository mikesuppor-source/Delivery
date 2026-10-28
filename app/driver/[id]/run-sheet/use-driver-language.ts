'use client'

import { useEffect, useState } from 'react'
import { ORDER_STATUS_LABELS } from '@/lib/utils'
import { useDriverTranslation, type DriverLang } from '@/lib/driver-i18n'

/** English/Arabic choice for the courier app, remembered on the device. */
export function useDriverLanguage() {
  // Bilingual Arabic / English Support
  const [lang, setLang] = useState<DriverLang>('en')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('cedar_driver_lang') as DriverLang | null
      if (saved === 'ar' || saved === 'en') {
        setLang(saved)
      }
    } catch (_e) {
      void _e
    }
  }, [])

  const toggleLang = () => {
    const nextLang: DriverLang = lang === 'en' ? 'ar' : 'en'
    setLang(nextLang)
    try {
      localStorage.setItem('cedar_driver_lang', nextLang)
    } catch (_e) {
      void _e
    }
  }

  const t = useDriverTranslation(lang)

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return t('statusPending')
      case 'assigned': return t('statusAssigned')
      case 'picked_up': return t('statusPickedUp')
      case 'delivered': return t('statusDelivered')
      case 'failed': return t('statusFailed')
      case 'returned': return t('statusReturned')
      default: return ORDER_STATUS_LABELS[status] || status
    }
  }

  return { lang, toggleLang, t, getStatusLabel }
}
