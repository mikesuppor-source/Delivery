/** Browser helpers for the finance screens. */

/** Sends JSON to an API route and returns its JSON, or throws the route's error message. */
export async function sendJson<T = Record<string, unknown>>(
  url: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body: unknown,
): Promise<T> {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Something went wrong. Please try again.')
  return data as T
}

/** Downloads text as a file (with a byte-order mark so Excel reads UTF-8 correctly). */
export function downloadCsv(fileName: string, lines: readonly string[]) {
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}

/** A new request ID for one "Pay selected" action: a retry of the same action reuses it. */
export const newRequestId = () => crypto.randomUUID()

export const errorMessage = (error: unknown, fallback = 'Something went wrong. Please try again.') =>
  error instanceof Error ? error.message : fallback
