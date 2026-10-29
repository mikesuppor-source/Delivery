import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer, type TextProps } from '@react-pdf/renderer'
import { statementTotals, type ShopStatement, type StatementLine } from './finance'
import { PDF_FONT, registerPdfFonts } from './pdf-fonts'
import { STATEMENT_LABELS, lineLabel, statementDay, textDirection, type StatementLabels, type StatementLang } from './statement-labels'
import { formatUSD } from './utils'

type Style = NonNullable<TextProps['style']>

// Shop statement PDF (build plan 6.1): opening balance, each delivered or returned order, the payouts
// made and the closing balance. Only figures a shop may see: never courier pay or company profit.
// It can be printed in English or in Arabic; the Arabic one is laid out right to left.

const GREEN = '#15803d'
const MUTED = '#64748b'
const LINE = '#e2e8f0'

/**
 * The styles for one language: only the direction of rows and the side that text hugs change.
 * react-pdf does not pass a text direction down from the page, so every text sets its own. Right-to-left text
 * must also have a text alignment (its own or inherited), or react-pdf does not draw it.
 */
function makeStyles(rtl: boolean) {
  const row = rtl ? 'row-reverse' : 'row'
  const dir = rtl ? 'rtl' : 'ltr'
  const start = rtl ? 'right' : 'left'
  const end = rtl ? 'left' : 'right'
  return StyleSheet.create({
    page: { padding: 36, paddingBottom: 56, fontSize: 9, fontFamily: PDF_FONT, color: '#0f172a' },
    /** Numbers, phone numbers and references always read left to right, so a minus or plus sign stays on the correct side */
    ltr: { direction: 'ltr' },
    /** The statement's own wording */
    base: { direction: dir, textAlign: start },
    header: { flexDirection: row, justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
    brand: { flexDirection: row, alignItems: 'center', gap: 10 },
    logo: { width: 44, height: 44, objectFit: 'contain' },
    company: { fontSize: 15, fontWeight: 700, color: GREEN, textAlign: start },
    title: { fontSize: 15, fontWeight: 700, textAlign: end, direction: dir },
    period: { fontSize: 9, color: MUTED, textAlign: end, marginTop: 3, direction: dir },
    shop: { marginBottom: 14, textAlign: start },
    shopName: { fontSize: 12, fontWeight: 700 },
    muted: { color: MUTED },
    summary: { flexDirection: row, gap: 8, marginBottom: 16 },
    box: { flexGrow: 1, flexBasis: 0, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 8, textAlign: start },
    boxLabel: { fontSize: 8, color: MUTED, marginBottom: 3, direction: dir },
    boxValue: { fontSize: 12, fontWeight: 700 },
    tableHead: { flexDirection: row, backgroundColor: '#f1f5f9', borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 5 },
    row: { flexDirection: row, borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 4 },
    cell: { paddingHorizontal: 4, textAlign: start, direction: dir },
    /** Amounts sit at the end of their column: the right in English, the left in Arabic */
    end: { textAlign: end },
    bold: { fontWeight: 700 },
    negative: { color: '#dc2626' },
    empty: { paddingVertical: 14, textAlign: 'center', color: MUTED, direction: dir },
    note: { marginTop: 10, color: MUTED, textAlign: start, direction: dir },
    footer: { position: 'absolute', left: 36, right: 36, bottom: 24, flexDirection: row, justifyContent: 'space-between', color: MUTED, fontSize: 8 },
  })
}

interface Ctx {
  lang: StatementLang
  labels: StatementLabels
  s: ReturnType<typeof makeStyles>
}

// Column widths (percent of the table)
const COL = { date: '13%', ref: '16%', label: '19%', cod: '14%', fee: '13%', storage: '10%', net: '15%' }
// Everything before the Net column, so a balance row's amount lines up with the Net amounts
const LEAD = '85%'

const usd = (value: number | null | undefined) => (value == null ? '' : formatUSD(Number(value)))

/** The text's own direction: names and descriptions are written by people, in either script. */
const own = (text: string): Style => ({ direction: textDirection(text) })

function Amount({ value, ctx, style }: { value: number; ctx: Ctx; style?: Style }) {
  const { s } = ctx
  return <Text style={[s.cell, s.end, s.ltr, { width: COL.net }, value < 0 ? s.negative : {}, style ?? {}]}>{formatUSD(value)}</Text>
}

function LineRow({ line, ctx }: { line: StatementLine; ctx: Ctx }) {
  const { s, lang } = ctx
  const isOrder = line.kind === 'order'
  const label = lineLabel(line.label, lang)
  return (
    <View style={s.row} wrap={false}>
      <Text style={[s.cell, s.ltr, { width: COL.date }]}>{statementDay(line.at, lang, true)}</Text>
      <Text style={[s.cell, s.ltr, { width: COL.ref }]}>{line.ref ?? ''}</Text>
      <Text style={[s.cell, own(label), { width: COL.label }]}>{label}</Text>
      <Text style={[s.cell, s.end, s.ltr, { width: COL.cod }]}>{isOrder ? usd(line.cod_usd) : ''}</Text>
      <Text style={[s.cell, s.end, s.ltr, { width: COL.fee }]}>{isOrder ? usd(line.fee_usd) : ''}</Text>
      <Text style={[s.cell, s.end, s.ltr, { width: COL.storage }]}>{isOrder && Number(line.storage_usd) ? usd(line.storage_usd) : ''}</Text>
      <Amount value={Number(line.amount_usd)} ctx={ctx} />
    </View>
  )
}

export interface StatementCompany {
  name: string
  /** PNG or JPEG bytes, already fetched and checked. */
  logo: { data: Buffer; format: 'png' | 'jpg' } | null
}

export function StatementDocument({ statement, company, generatedAt, lang = 'en' }: { statement: ShopStatement; company: StatementCompany; generatedAt: Date; lang?: StatementLang }) {
  const totals = statementTotals(statement)
  const ctx: Ctx = { lang, labels: STATEMENT_LABELS[lang], s: makeStyles(lang === 'ar') }
  const { labels: l, s } = ctx
  return (
    <Document title={`Statement ${statement.shop.name} ${statement.from} to ${statement.to}`} author={company.name}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={s.brand}>
            {company.logo && <Image src={company.logo} style={s.logo} />}
            <Text style={[s.company, own(company.name)]}>{company.name}</Text>
          </View>
          <View>
            <Text style={s.title}>{l.title}</Text>
            <Text style={s.period}>{statementDay(statement.from + 'T00:00:00Z', lang)} {l.to} {statementDay(statement.to + 'T00:00:00Z', lang)}</Text>
          </View>
        </View>

        <View style={s.shop}>
          <Text style={[s.shopName, own(statement.shop.name)]}>{statement.shop.name}</Text>
          {statement.shop.phone ? <Text style={[s.muted, s.ltr]}>{statement.shop.phone}</Text> : null}
          {statement.shop.address ? <Text style={[s.muted, own(statement.shop.address)]}>{statement.shop.address}</Text> : null}
        </View>

        <View style={s.summary}>
          <View style={s.box}><Text style={s.boxLabel}>{l.openingBalance}</Text><Text style={[s.boxValue, s.ltr]}>{formatUSD(statement.opening_usd)}</Text></View>
          <View style={s.box}><Text style={s.boxLabel}>{l.orders}</Text><Text style={[s.boxValue, s.ltr]}>{formatUSD(totals.orders)}</Text></View>
          <View style={s.box}><Text style={s.boxLabel}>{l.payouts}</Text><Text style={[s.boxValue, s.ltr]}>{formatUSD(totals.payouts)}</Text></View>
          {totals.adjustments !== 0 && (
            <View style={s.box}><Text style={s.boxLabel}>{l.adjustments}</Text><Text style={[s.boxValue, s.ltr]}>{formatUSD(totals.adjustments)}</Text></View>
          )}
          <View style={[s.box, { borderColor: GREEN }]}><Text style={s.boxLabel}>{l.closingBalance}</Text><Text style={[s.boxValue, s.ltr, { color: GREEN }]}>{formatUSD(statement.closing_usd)}</Text></View>
        </View>

        <View style={s.tableHead} fixed>
          <Text style={[s.cell, s.bold, { width: COL.date }]}>{l.date}</Text>
          <Text style={[s.cell, s.bold, { width: COL.ref }]}>{l.reference}</Text>
          <Text style={[s.cell, s.bold, { width: COL.label }]}>{l.description}</Text>
          <Text style={[s.cell, s.bold, s.end, { width: COL.cod }]}>{l.cod}</Text>
          <Text style={[s.cell, s.bold, s.end, { width: COL.fee }]}>{l.fee}</Text>
          <Text style={[s.cell, s.bold, s.end, { width: COL.storage }]}>{l.storage}</Text>
          <Text style={[s.cell, s.bold, s.end, { width: COL.net }]}>{l.net}</Text>
        </View>

        <View style={s.row} wrap={false}>
          <Text style={[s.cell, s.muted, { width: LEAD }]}>{l.openingBalance}</Text>
          <Amount value={Number(statement.opening_usd)} ctx={ctx} style={s.bold} />
        </View>
        {statement.lines.length === 0 ? <Text style={s.empty}>{l.empty}</Text> : statement.lines.map((line, i) => <LineRow key={i} line={line} ctx={ctx} />)}
        <View style={[s.row, { borderBottomWidth: 1, borderBottomColor: '#0f172a' }]} wrap={false}>
          <Text style={[s.cell, s.bold, { width: LEAD }]}>{l.closingBalance}</Text>
          <Amount value={Number(statement.closing_usd)} ctx={ctx} style={s.bold} />
        </View>

        <Text style={s.note}>{l.note}</Text>

        <View style={s.footer} fixed>
          <Text style={s.base}>{l.generated(company.name, statementDay(generatedAt.toISOString(), lang))}</Text>
          <Text style={[s.base, s.end]} render={({ pageNumber, totalPages }) => l.page(pageNumber, totalPages)} />
        </View>
      </Page>
    </Document>
  )
}

export async function renderStatementPdf(statement: ShopStatement, company: StatementCompany, lang: StatementLang = 'en'): Promise<Buffer> {
  registerPdfFonts()
  return renderToBuffer(<StatementDocument statement={statement} company={company} generatedAt={new Date()} lang={lang} />)
}

// ─── Company logo ───────────────────────────────────────────────────────────

/** True for names that point inside a network (localhost, private and link-local addresses, IPv6). */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return true
  if (host.includes(':') || host.startsWith('[')) return true // IPv6 literals
  const ip = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!ip) return false
  const [a, b] = [Number(ip[1]), Number(ip[2])]
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

/**
 * Fetches the workspace logo for the PDF. A statement must never fail because of a logo, and the
 * server must not be steered at internal addresses, so anything doubtful just means "no logo".
 */
export async function loadLogo(url: string | null | undefined): Promise<StatementCompany['logo']> {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || isPrivateHost(parsed.hostname)) return null
    const res = await fetch(parsed, { signal: AbortSignal.timeout(4000), redirect: 'error' })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    const format = type.startsWith('image/png') ? 'png' : type.startsWith('image/jpeg') ? 'jpg' : null
    const data = Buffer.from(await res.arrayBuffer())
    if (!format || data.length === 0 || data.length > 1_000_000) return null
    const isPng = data.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
    const isJpeg = data[0] === 255 && data[1] === 216
    return (format === 'png' ? isPng : isJpeg) ? { data, format } : null
  } catch {
    return null
  }
}
