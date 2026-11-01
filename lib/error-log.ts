/** Hides what a server error message might leak: email addresses and long numbers (phones, ids, card-like digits). */
export function scrubErrorText(text: unknown): string {
  return String(text ?? '')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\+?\d[\d\s().-]{5,}\d/g, '[number]')
    .slice(0, 300)
}

export interface ServerError { method: string; path: string; status: number; message: unknown; requestId: string }

/**
 * Remembers a server error for the daily check. Never throws and never waits for the database to answer the visitor:
 * a failure to log must not make the original failure worse. The path has no query string, which can hold tokens.
 */
export function logServerError(error: ServerError): void {
  void (async () => {
    try {
      const { createServiceClient } = await import('./supabase/server')
      await createServiceClient().from('error_log').insert({
        method: error.method.slice(0, 10), path: error.path.slice(0, 200), status: error.status,
        message: scrubErrorText(error.message), request_id: error.requestId,
      })
    } catch { /* the original error is already in the server log */ }
  })()
}
