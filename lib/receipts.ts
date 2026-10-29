/** Expense receipts: what may be uploaded and where it is kept. Used by the API route and the expenses screen. */

export const RECEIPT_BUCKET = 'expense-receipts'

/** The API refuses request bodies over 3 MB, and the upload form adds a little to the file itself. */
export const MAX_RECEIPT_BYTES = 2_500_000

export interface ReceiptKind {
  ext: 'jpg' | 'png' | 'webp' | 'pdf'
  mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'
}

/**
 * What a file really is, judged by its first bytes. The file name and the type the browser reports come from
 * the sender and prove nothing. Only photos and PDFs are accepted: an SVG or HTML file could carry script.
 */
export function sniffReceipt(bytes: Uint8Array): ReceiptKind | null {
  const startsWith = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte)
  if (startsWith(0xff, 0xd8, 0xff)) return { ext: 'jpg', mime: 'image/jpeg' }
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { ext: 'png', mime: 'image/png' }
  // WebP is "RIFF", four size bytes, then "WEBP"
  if (startsWith(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return { ext: 'webp', mime: 'image/webp' }
  if (startsWith(0x25, 0x50, 0x44, 0x46, 0x2d)) return { ext: 'pdf', mime: 'application/pdf' }
  return null
}

/** Where a receipt is stored. The database only accepts paths of this shape (see migration 029). */
export function receiptPath(workspaceId: string, expenseId: string, ext: string, token: string = crypto.randomUUID()): string {
  return `${workspaceId}/${expenseId}/${token}.${ext}`
}

/** The link that opens an expense's receipt for a signed-in owner or manager. */
export function receiptLink(workspaceId: string, expenseId: string): string {
  return `/api/finance/expenses/receipt?workspaceId=${encodeURIComponent(workspaceId)}&expenseId=${encodeURIComponent(expenseId)}`
}
