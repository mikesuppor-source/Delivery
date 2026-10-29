'use client'

import React from 'react'
import type { DriverProfileClientProps } from './driver-profile/types'
import { DriverProfileProvider } from './driver-profile/context'
import { DriverProfileView } from './driver-profile/driver-profile-view'

export function DriverProfileClient(props: DriverProfileClientProps) {
  return (
    <DriverProfileProvider {...props}>
      <DriverProfileView />
    </DriverProfileProvider>
  )
}
