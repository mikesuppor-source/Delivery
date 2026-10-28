'use client'

import { Toast } from '@/components/ui'
import { useRunSheet } from '../context'

export function RunSheetToast() {
  const { notification } = useRunSheet()
  return notification ? <Toast tone={notification.type}>{notification.message}</Toast> : null
}
