import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer, type TextProps } from '@react-pdf/renderer'
import { statementTotals, type ShopStatement, type StatementLine } from './finance'
import { formatUSD } from './utils'

type Style = NonNullable<TextProps['style']>

// Shop statement PDF (build plan 6.1): opening balance, each delivered or returned order, the payouts
// made and the closing balance. Only figures a shop may see: never courier pay or company profit.

const GREEN = '#15803d'
const MUTED = '#64748b'
const LINE = '#e2e8f0'

const styles = StyleSheet.create({
  page: { padding: 36, paddingBottom: 56, fontSize: 9, fontFamily: 'Helvetica', color: '#0f172a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 44, height: 44, objectFit: 'contain' },
  company: { fontSize: 15, fontWeight: 700, color: GREEN },
  title: { fontSize: 15, fontWeight: 700, textAlign: 'right' },
  period: { fontSize: 9, color: MUTED, textAlign: 'right', marginTop: 3 },
  shop: { marginBottom: 14 },
  shopName: { fontSize: 12, fontWeight: 700 },
  muted: { color: MUTED },
  summary: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  box: { flexGrow: 1, flexBasis: 0, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 8 },
  boxLabel: { fontSize: 8, color: MUTED, marginBottom: 3 },
  boxValue: { fontSize: 12, fontWeight: 700 },
  tableHead: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 5 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 4 },
  cell: { paddingHorizontal: 4 },
  right: { textAlign: 'right' },
  bold: { fontWeight: 700 },
  negative: { color: '#dc2626' },
  empty: { paddingVertical: 14, textAlign: 'center', color: MUTED },
  footer: { position: 'absolute', left: 36, right: 36, bottom: 24, flexDirection: 'row', justifyContent: 'space-between', color: MUTED, fontSize: 8 },
})

// Column widths (percent of the table)
const COL = { date: '12%', ref: '17%', label: '23%', cod: '14%', fee: '10%', storage: '10%', net: '14%' }
// Everything left of the Net column, so a balance row's amount lines up with the Net amounts
const LEAD = '86%'

const usd = (value: number | null | undefined) => (value == null ? '' : formatUSD(Number(value)))
const day = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso))

function Amount({ value, style }: { value: number; style?: Style }) {
  return <Text style={[styles.cell, styles.right, { width: COL.net }, value < 0 ? styles.negative : {}, style ?? {}]}>{formatUSD(value)}</Text>
}

function LineRow({ line }: { line: StatementLine }) {
  const isOrder = line.kind === 'order'
  return (
    <View style={styles.row} wrap={false}>
      <Text style={[styles.cell, { width: COL.date }]}>{day(line.at)}</Text>
      <Text style={[styles.cell, { width: COL.ref }]}>{line.ref ?? ''}</Text>
      <Text style={[styles.cell, { width: COL.label }]}>{line.label}</Text>
      <Text style={[styles.cell, styles.right, { width: COL.cod }]}>{isOrder ? usd(line.cod_usd) : ''}</Text>
      <Text style={[styles.cell, styles.right, { width: COL.fee }]}>{isOrder ? usd(line.fee_usd) : ''}</Text>
      <Text style={[styles.cell, styles.right, { width: COL.storage }]}>{isOrder && Number(line.storage_usd) ? usd(line.storage_usd) : ''}</Text>
      <Amount value={Number(line.amount_usd)} />
    </View>
  )
}

export interface StatementCompany {
  name: string
  /** PNG or JPEG bytes, already fetched and checked. */
  logo: { data: Buffer; format: 'png' | 'jpg' } | null
}

export function StatementDocument({ statement, company, generatedAt }: { statement: ShopStatement; company: StatementCompany; generatedAt: Date }) {
  const totals = statementTotals(statement)
  return (
    <Document title={`Statement ${statement.shop.name} ${statement.from} to ${statement.to}`} author={company.name}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brand}>
            {company.logo && <Image src={company.logo} style={styles.logo} />}
            <Text style={styles.company}>{company.name}</Text>
          </View>
          <View>
            <Text style={styles.title}>Account statement</Text>
            <Text style={styles.period}>{day(statement.from + 'T00:00:00Z')} to {day(statement.to + 'T00:00:00Z')}</Text>
          </View>
        </View>

        <View style={styles.shop}>
          <Text style={styles.shopName}>{statement.shop.name}</Text>
          {statement.shop.phone ? <Text style={styles.muted}>{statement.shop.phone}</Text> : null}
          {statement.shop.address ? <Text style={styles.muted}>{statement.shop.address}</Text> : null}
        </View>

        <View style={styles.summary}>
          <View style={styles.box}><Text style={styles.boxLabel}>Opening balance</Text><Text style={styles.boxValue}>{formatUSD(statement.opening_usd)}</Text></View>
          <View style={styles.box}><Text style={styles.boxLabel}>Delivered and returned orders</Text><Text style={styles.boxValue}>{formatUSD(totals.orders)}</Text></View>
          <View style={styles.box}><Text style={styles.boxLabel}>Payouts</Text><Text style={styles.boxValue}>{formatUSD(totals.payouts)}</Text></View>
          {totals.adjustments !== 0 && (
            <View style={styles.box}><Text style={styles.boxLabel}>Adjustments</Text><Text style={styles.boxValue}>{formatUSD(totals.adjustments)}</Text></View>
          )}
          <View style={[styles.box, { borderColor: GREEN }]}><Text style={styles.boxLabel}>Closing balance</Text><Text style={[styles.boxValue, { color: GREEN }]}>{formatUSD(statement.closing_usd)}</Text></View>
        </View>

        <View style={styles.tableHead} fixed>
          <Text style={[styles.cell, styles.bold, { width: COL.date }]}>Date</Text>
          <Text style={[styles.cell, styles.bold, { width: COL.ref }]}>Reference</Text>
          <Text style={[styles.cell, styles.bold, { width: COL.label }]}>Description</Text>
          <Text style={[styles.cell, styles.bold, styles.right, { width: COL.cod }]}>COD collected</Text>
          <Text style={[styles.cell, styles.bold, styles.right, { width: COL.fee }]}>Delivery fee</Text>
          <Text style={[styles.cell, styles.bold, styles.right, { width: COL.storage }]}>Storage</Text>
          <Text style={[styles.cell, styles.bold, styles.right, { width: COL.net }]}>Net</Text>
        </View>

        <View style={styles.row} wrap={false}>
          <Text style={[styles.cell, styles.muted, { width: LEAD }]}>Opening balance</Text>
          <Amount value={Number(statement.opening_usd)} style={styles.bold} />
        </View>
        {statement.lines.length === 0 ? <Text style={styles.empty}>No movements in this period.</Text> : statement.lines.map((line, i) => <LineRow key={i} line={line} />)}
        <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: '#0f172a' }]} wrap={false}>
          <Text style={[styles.cell, styles.bold, { width: LEAD }]}>Closing balance</Text>
          <Amount value={Number(statement.closing_usd)} style={styles.bold} />
        </View>

        <Text style={[styles.muted, { marginTop: 10 }]}>
          Net is what the order adds to your balance: cash collected minus the delivery fee (and any storage fee). Payouts reduce the balance.
        </Text>

        <View style={styles.footer} fixed>
          <Text>{company.name} - generated {day(generatedAt.toISOString())}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

export async function renderStatementPdf(statement: ShopStatement, company: StatementCompany): Promise<Buffer> {
  return renderToBuffer(<StatementDocument statement={statement} company={company} generatedAt={new Date()} />)
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
