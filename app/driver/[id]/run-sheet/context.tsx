'use client'

import { createContext, useContext } from 'react'
import type { RunSheetState } from './use-run-sheet'

const RunSheetContext = createContext<RunSheetState | null>(null)

export const RunSheetProvider = RunSheetContext.Provider

/** Run sheet state for section components (provided by DriverRunSheetClient). */
export function useRunSheet(): RunSheetState {
  const state = useContext(RunSheetContext)
  if (!state) throw new Error('useRunSheet must be used inside DriverRunSheetClient')
  return state
}
