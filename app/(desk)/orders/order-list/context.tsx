'use client'

import { createContext, useContext } from 'react'
import type { OrderListState } from './use-order-list-state'

const OrderListContext = createContext<OrderListState | null>(null)

export const OrderListProvider = OrderListContext.Provider

/** Order list state for section components (provided by OrderListClient). */
export function useOrderList(): OrderListState {
  const state = useContext(OrderListContext)
  if (!state) throw new Error('useOrderList must be used inside OrderListClient')
  return state
}
