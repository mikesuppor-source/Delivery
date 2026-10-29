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

/**
 * Photos from a phone are several MB and a receipt only has to be readable, so a large image is shrunk to fit
 * the upload limit before it is sent. PDFs and small files go as they are; if shrinking fails the original is
 * sent and the server decides.
 */
export async function prepareReceipt(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size <= 1_000_000) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    if (blob && blob.size < file.size) return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    // fall through to the original
  }
  return file
}

/** Attaches a receipt photo or PDF to an expense, or throws the route's error message. */
export async function uploadReceipt(workspaceId: string, expenseId: string, file: File): Promise<void> {
  const body = new FormData()
  body.set('workspaceId', workspaceId)
  body.set('expenseId', expenseId)
  body.set('file', await prepareReceipt(file))
  const res = await fetch('/api/finance/expenses/receipt', { method: 'POST', body })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || 'The receipt could not be uploaded.')
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
