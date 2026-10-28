import { createHash } from 'node:crypto'
import { createServiceClient } from './supabase/server'
import { ApiError, checked } from './api'
export async function rateLimit(key: string, max: number) {
 const allowed=checked(await createServiceClient().rpc('consume_limit',{p_key:createHash('sha256').update(key).digest('hex'),p_max:max}))
 if(!allowed) throw new ApiError(429,'Too many requests. Try again in a minute.')
}
export function clientIp(source: { headers: Headers }) {
 return source.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || source.headers.get('x-real-ip') || 'unknown'
}
