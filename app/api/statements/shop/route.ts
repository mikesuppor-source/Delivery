import { NextResponse } from 'next/server'
import { api, ApiError, checked } from '@/lib/api'
import { id, z } from '@/lib/validation'
import { shopAccess } from '@/lib/access'
import { rateLimit } from '@/lib/rate-limit'
import type { ShopStatement } from '@/lib/finance'
import { loadLogo, renderStatementPdf } from '@/lib/statement-pdf'

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')
const StatementQuery = z.object({
  shopId: id,
  from: Day,
  to: Day,
  format: z.enum(['pdf', 'json']).default('pdf'),
})

/**
 * GET /api/statements/shop?shopId&from&to&format=pdf|json   (dates as YYYY-MM-DD, UTC, inclusive)
 * A shop's account statement: opening balance, every delivered or returned order, the payouts made
 * and the closing balance, built from the money ledger. The shop's own owner, or an owner or
 * manager of the company, may download it. It never includes courier pay or company profit.
 */
export const GET = api(async req => {
  const params = new URL(req.url).searchParams
  const query = StatementQuery.safeParse({
    shopId: params.get('shopId'),
    from: params.get('from'),
    to: params.get('to'),
    format: params.get('format') ?? undefined,
  })
  if (!query.success) throw new ApiError(400, query.error.issues[0]?.message ?? 'Invalid query parameters')

  const { user, shop, db } = await shopAccess(query.data.shopId)
  if (query.data.format === 'pdf') await rateLimit('statement:' + user.id, 20)

  const statement = checked(await db.rpc('shop_statement', {
    p_workspace: shop.workspace_id, p_shop: shop.id, p_from: query.data.from, p_to: query.data.to,
  })) as unknown as ShopStatement
  if (query.data.format === 'json') return NextResponse.json({ statement })

  const company = checked(await db.from('workspaces').select('name, logo_url').eq('id', shop.workspace_id).single())
  const pdf = await renderStatementPdf(statement, { name: company.name, logo: await loadLogo(company.logo_url) })
  const fileName = `statement-${shop.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'shop'}-${query.data.from}-to-${query.data.to}.pdf`
  return new NextResponse(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${fileName}"` },
  })
})
