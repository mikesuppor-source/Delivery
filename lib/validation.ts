import { z } from 'zod'
import { ApiError } from './api'

export { z }

// Shared request-body rules. They mirror textField/money/uuid in lib/api.ts so
// routes moved to schemas keep the same limits and the same "Invalid <field>" errors.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const id = z.string().regex(UUID)
// .optional() lets a key be left out entirely, not just sent as null/''
export const optionalId = z.union([id, z.literal(''), z.null()]).optional().transform(v => v || null)
export const idList = z.array(id).min(1).max(200).transform(list => [...new Set(list)])

/** Optional text: missing or null becomes '', otherwise trimmed and capped at max. */
export const text = (max: number) => z.string().max(max).nullish().transform(v => (v ?? '').trim())
/** Required text: must contain something after trimming. */
export const requiredText = (max: number) => z.string().max(max).trim().min(1)

/** Amount in USD/LBP: number or numeric string, 0–99,999,999, rounded to cents. Blank uses the fallback. */
export const money = (fallback = 0) =>
  z.union([z.number(), z.string(), z.null()]).optional().transform((value, ctx) => {
    const amount = value == null || value === '' ? fallback : Number(value)
    if (!Number.isFinite(amount) || amount < 0 || amount > 99999999) {
      ctx.addIssue({ code: 'custom', message: 'Invalid amount' })
      return z.NEVER
    }
    return Math.round(amount * 100) / 100
  })

export const serviceType = z
  .string()
  .nullish()
  .transform(v => (v === 'replacement' || v === 'pickup' ? v : 'delivery') as 'delivery' | 'replacement' | 'pickup')

export const weightKg = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform(v => (v == null || v === '' ? undefined : Math.max(0, Number(v) || 0)))

/** Checkbox-style flag: anything truthy is true, missing is false. */
export const flag = z.unknown().optional().transform(Boolean)

/** Search box text: capped and whitespace-tidied. Put it in a filter with ilikeAny(), never by hand. */
export function searchTerm(value: string | null, max = 100): string {
  return (value ?? '').slice(0, max).replace(/\s+/g, ' ').trim()
}

/**
 * PostgREST or() conditions matching `term` anywhere in each column. The value is
 * double-quoted, so commas, brackets and quotes in the search stay plain text and
 * cannot add filter conditions.
 */
export function ilikeAny(columns: string[], term: string): string {
  const quoted = '"%' + term.replace(/[\\"]/g, c => '\\' + c) + '%"'
  return columns.map(column => column + '.ilike.' + quoted).join(',')
}

/** Reads and validates a JSON body. Failures become a 400 naming the first bad field. */
export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  const result = schema.safeParse(await req.json())
  if (!result.success) {
    const issue = result.error.issues[0]
    const field = issue.path.length ? issue.path.join('.') : 'request'
    throw new ApiError(400, issue.code === 'custom' && !issue.path.length ? issue.message : 'Invalid ' + field)
  }
  return result.data
}
