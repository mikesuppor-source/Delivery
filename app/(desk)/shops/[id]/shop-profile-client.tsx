'use client'

import React from 'react'
import type { ShopProfileClientProps } from './shop-profile/types'
import { ShopProfileProvider } from './shop-profile/context'
import { ShopProfileView } from './shop-profile/shop-profile-view'

export function ShopProfileClient(props: ShopProfileClientProps) {
  return (
    <ShopProfileProvider {...props}>
      <ShopProfileView />
    </ShopProfileProvider>
  )
}
