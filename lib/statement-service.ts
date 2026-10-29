import { checked } from './api'
import type { createServiceClient } from './supabase/server'
import type { ShopStatement } from './finance'
import { loadLogo, renderStatementPdf } from './statement-pdf'
import type { StatementLang } from './statement-labels'

type Db = ReturnType<typeof createServiceClient>

/** A shop's statement for a period, built from the money ledger. */
export async function loadStatement(db: Db, shop: { id: string; workspace_id: string }, from: string, to: string): Promise<ShopStatement> {
  return checked(await db.rpc('shop_statement', { p_workspace: shop.workspace_id, p_shop: shop.id, p_from: from, p_to: to })) as unknown as ShopStatement
}

/** The name a downloaded or attached statement is saved under. */
export function statementFileName(shopName: string, from: string, to: string, lang: StatementLang): string {
  const slug = shopName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'shop'
  return `statement-${slug}-${from}-to-${to}${lang === 'ar' ? '-ar' : ''}.pdf`
}

/** The statement as a PDF with the company's name and logo, ready to download or attach to an email. */
export async function renderShopStatement(
  db: Db,
  shop: { id: string; name: string; workspace_id: string },
  statement: ShopStatement,
  lang: StatementLang,
) {
  const company = checked(await db.from('workspaces').select('name, logo_url').eq('id', shop.workspace_id).single())
  const pdf = await renderStatementPdf(statement, { name: company.name, logo: await loadLogo(company.logo_url) }, lang)
  return { company, pdf, fileName: statementFileName(shop.name, statement.from, statement.to, lang) }
}
