import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/health
 * For an uptime monitor: answers {"status":"ok"} when the site is up and its database answers, and 503 when the database does not.
 * It shows no data and no secrets, only whether things work and which version is running.
 */
export async function GET() {
  const started = Date.now()
  const dbOk = await (async () => {
    try {
      const { error } = await createServiceClient().from('workspaces').select('id').limit(1)
      return !error
    } catch { return false }
  })()
  return NextResponse.json(
    { status: dbOk ? 'ok' : 'down', database: dbOk ? 'ok' : 'down', ms: Date.now() - started, version: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev').slice(0, 7) },
    { status: dbOk ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  )
}
