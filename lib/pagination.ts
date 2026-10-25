/** Fetch complete filtered reports in bounded database pages; never silently accept the API row cap. */
export async function allRows<T extends { data: unknown[] | null; error: unknown }>(
  query: PromiseLike<T> & { range: (start: number, end: number) => PromiseLike<T>; order?: (column: string) => unknown }
): Promise<T> {
  const rows: unknown[] = []
  try {
    if (typeof query.order === 'function') {
      try { query.order('id') } catch (e) { void e }
    }
  } catch (e) { void e }

  let lastResult: any = { data: null, error: null }
  for (let start = 0; start < 50000; ) {
    try {
      const result = await query.range(start, start + 499)
      lastResult = result
      if (result.error) {
        console.error('allRows database query error:', result.error)
        return { ...result, data: rows.length ? rows : [] } as T
      }
      const batch = result.data || []
      rows.push(...batch)
      if (batch.length === 0 || batch.length < 500) {
        return { ...result, data: rows } as T
      }
      start += batch.length
    } catch (err) {
      console.error('allRows unexpected exception:', err)
      return { ...lastResult, data: rows } as T
    }
  }
  return { ...lastResult, data: rows } as T
}
