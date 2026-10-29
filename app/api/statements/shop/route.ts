import { NextResponse } from 'next/server'
import { api, ApiError } from '@/lib/api'
import { id, z } from '@/lib/validation'
import { shopAccess } from '@/lib/access'
import { rateLimit } from '@/lib/rate-limit'
import { loadStatement, renderShopStatement } from '@/lib/statement-service'

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')
const StatementQuery = z.object({
  shopId: id,
  from: Day,
  to: Day,
  format: z.enum(['pdf', 'json']).default('pdf'),
  lang: z.enum(['en', 'ar']).default('en'),
})

/**
 * GET /api/statements/shop?shopId&from&to&format=pdf|json&lang=en|ar   (dates as YYYY-MM-DD, UTC, inclusive)
 * A shop's account statement: opening balance, every delivered or returned order, the payouts made
 * and the closing balance, built from the money ledger. The shop's own owner, or an owner or
 * manager of the company, may download it. It never includes courier pay or company profit.
 * The PDF is in English unless lang=ar asks for the Arabic, right-to-left version.
 */
export const GET = api(async req => {
  const params = new URL(req.url).searchParams
  const query = StatementQuery.safeParse({
    shopId: params.get('shopId'),
    from: params.get('from'),
    to: params.get('to'),
    format: params.get('format') ?? undefined,
    lang: params.get('lang') ?? undefined,
  })
  if (!query.success) throw new ApiError(400, query.error.issues[0]?.message ?? 'Invalid query parameters')

  const { user, shop, db } = await shopAccess(query.data.shopId)
  if (query.data.format === 'pdf') await rateLimit('statement:' + user.id, 20)

  const statement = await loadStatement(db, shop, query.data.from, query.data.to)
  if (query.data.format === 'json') return NextResponse.json({ statement })

  const { pdf, fileName } = await renderShopStatement(db, shop, statement, query.data.lang)
  return new NextResponse(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${fileName}"` },
  })
})
