'use client'

import { useCallback, useState } from 'react'

export interface RunSheetNotice {
  type: 'success' | 'error'
  message: string
}

/** Short-lived message shown at the top of the run sheet. */
export function useToast() {
  const [notification, setNotification] = useState<RunSheetNotice | null>(null)

  const showNotification = useCallback((type: RunSheetNotice['type'], message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 4000)
  }, [])

  return { notification, showNotification }
}
