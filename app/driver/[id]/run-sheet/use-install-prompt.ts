'use client'

import { useEffect, useState } from 'react'

/** Home-screen install prompt, installed (standalone) mode and in-app browser detection. */
export function useInstallPrompt() {
  // PWA App Install, In-App Browser & Modals State
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null)
  const [isStandaloneApp, setIsStandaloneApp] = useState<boolean>(false)
  const [showIosInstallModal, setShowIosInstallModal] = useState<boolean>(false)
  const [isInAppBrowser, setIsInAppBrowser] = useState<boolean>(false)

  const handleInstallApp = async () => {
    if (deferredInstallPrompt) {
      try {
        deferredInstallPrompt.prompt()
        const choice = await deferredInstallPrompt.userChoice
        if (choice.outcome === 'accepted') {
          setIsStandaloneApp(true)
          setDeferredInstallPrompt(null)
        }
      } catch (_e) {
        void _e
      }
    } else {
      setShowIosInstallModal(true)
    }
  }

  // Detect In-App Browser (WhatsApp, Instagram, etc.) & PWA Standalone State
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ua = navigator.userAgent || ''
      setIsInAppBrowser(/WhatsApp|FBAN|FBAV|Instagram|Line/i.test(ua))

      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true
      setIsStandaloneApp(isStandalone)

      const handleBeforeInstall = (e: Event) => {
        e.preventDefault()
        setDeferredInstallPrompt(e)
      }
      window.addEventListener('beforeinstallprompt', handleBeforeInstall)

      const handleInstalled = () => {
        setIsStandaloneApp(true)
        setDeferredInstallPrompt(null)
      }
      window.addEventListener('appinstalled', handleInstalled)

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
        window.removeEventListener('appinstalled', handleInstalled)
      }
    }
  }, [])

  return { isStandaloneApp, isInAppBrowser, showIosInstallModal, setShowIosInstallModal, handleInstallApp }
}
