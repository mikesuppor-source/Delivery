'use client'

import React from 'react'
import type { PortalClientProps } from './portal-view/types'
import { PortalProvider } from './portal-view/context'
import { PortalView } from './portal-view/portal-view'

export function PortalClient(props: PortalClientProps) {
  return (
    <PortalProvider {...props}>
      <PortalView />
    </PortalProvider>
  )
}
