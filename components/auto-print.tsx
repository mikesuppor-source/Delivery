'use client'

import { useEffect } from 'react'

/** Opens the browser's print dialog once the page has been drawn. Renders nothing. */
export function AutoPrint() {
  useEffect(() => {
    // A short wait lets the page finish painting before the print preview is taken
    const timer = window.setTimeout(() => window.print(), 400)
    return () => window.clearTimeout(timer)
  }, [])
  return null
}
