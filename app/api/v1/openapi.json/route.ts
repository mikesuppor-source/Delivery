import { NextResponse } from 'next/server'
import { openApiDocument } from '@/lib/openapi'

/** GET /api/v1/openapi.json: the public description of the shop API. No key needed; it holds nothing private. */
export function GET() {
  return NextResponse.json(openApiDocument, { headers: { 'Cache-Control': 'public, max-age=300' } })
}
