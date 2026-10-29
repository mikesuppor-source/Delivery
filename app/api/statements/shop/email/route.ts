import { NextResponse } from 'next/server'
import { api, ApiError } from '@/lib/api'
import { id, parseBody, z } from '@/lib/validation'
import { shopAccess, workspaceAccess } from '@/lib/access'
import { writeAuditLog } from '@/lib/auth'
import { EMAIL_NOT_SET_UP, emailConfigured, maskEmail, sendEmail } from '@/lib/email'
import { rateLimit } from '@/lib/rate-limit'
import { statementEmail } from '@/lib/statement-labels'
import { loadStatement, renderShopStatement } from '@/lib/statement-service'
import { formatUSD } from '@/lib/utils'

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')
const SendStatement = z.object({ shopId: id, from: Day, to: Day, lang: z.enum(['en', 'ar']).default('en') })

/**
 * POST /api/statements/shop/email   { shopId, from, to, lang }
 * Emails the shop's statement as a PDF to the address saved on the shop. Only the company's owners and managers may
 * do this, and the address is never taken from the request, so this cannot be used to send mail to anyone else.
 */
export const POST = api(async req => {
  const body = await parseBody(req, SendStatement)
  const { user, shop, db } = await shopAccess(body.shopId)
  // A shop's own login may download its statement, but sending mail in the company's name is for staff
  await workspaceAccess(shop.workspace_id, ['owner', 'manager'], user)
  if (!emailConfigured()) throw new ApiError(503, EMAIL_NOT_SET_UP)
  if (!shop.contact_email) throw new ApiError(400, 'This shop has no email address. Add one under Edit Store.')
  await rateLimit('statement-email:' + user.id, 10)

  const statement = await loadStatement(db, shop, body.from, body.to)
  const { company, pdf, fileName } = await renderShopStatement(db, shop, statement, body.lang)
  const { subject, text } = statementEmail(body.lang, {
    company: company.name, shop: shop.name, from: body.from, to: body.to, closing: formatUSD(Number(statement.closing_usd)),
  })
  await sendEmail({ to: shop.contact_email, subject, text, attachments: [{ filename: fileName, content: pdf, contentType: 'application/pdf' }] })

  await writeAuditLog({
    workspaceId: shop.workspace_id, actorId: user.id, actorEmail: user.email ?? '', action: 'statement.emailed', entityType: 'shop', entityId: shop.id,
    diff: { from: body.from, to: body.to, lang: body.lang, sentTo: maskEmail(shop.contact_email) },
  })
  return NextResponse.json({ success: true, sentTo: maskEmail(shop.contact_email) })
})
