/** The wording of the shop statement PDF, in English and Arabic. Kept apart from the PDF code so it can be tested. */

export type StatementLang = 'en' | 'ar'
export const STATEMENT_LANGS: readonly StatementLang[] = ['en', 'ar']

export interface StatementLabels {
  title: string
  to: string
  openingBalance: string
  orders: string
  payouts: string
  adjustments: string
  closingBalance: string
  date: string
  reference: string
  description: string
  cod: string
  fee: string
  storage: string
  net: string
  empty: string
  note: string
  generated: (company: string, date: string) => string
  page: (number: number, total: number) => string
}

export const STATEMENT_LABELS: Record<StatementLang, StatementLabels> = {
  en: {
    title: 'Account statement',
    to: 'to',
    openingBalance: 'Opening balance',
    orders: 'Delivered and returned orders',
    payouts: 'Payouts',
    adjustments: 'Adjustments',
    closingBalance: 'Closing balance',
    date: 'Date',
    reference: 'Reference',
    description: 'Description',
    cod: 'COD collected',
    fee: 'Delivery fee',
    storage: 'Storage',
    net: 'Net',
    empty: 'No movements in this period.',
    note: 'Net is what the order adds to your balance: cash collected minus the delivery fee (and any storage fee). Payouts reduce the balance.',
    generated: (company, date) => `${company} - generated ${date}`,
    page: (number, total) => `Page ${number} of ${total}`,
  },
  ar: {
    title: 'كشف حساب',
    to: 'إلى',
    openingBalance: 'الرصيد الافتتاحي',
    orders: 'الطلبات المسلمة والمرتجعة',
    payouts: 'الدفعات المسددة',
    adjustments: 'التسويات',
    closingBalance: 'الرصيد الختامي',
    date: 'التاريخ',
    reference: 'المرجع',
    description: 'البيان',
    cod: 'المبلغ المحصل',
    fee: 'رسوم التوصيل',
    storage: 'التخزين',
    net: 'الصافي',
    empty: 'لا توجد حركات في هذه الفترة.',
    note: 'الصافي هو ما يضيفه الطلب إلى رصيدك: المبلغ المحصل ناقص رسوم التوصيل (وأي رسوم تخزين). الدفعات تخفض الرصيد.',
    generated: (company, date) => `${company} - أنشئ بتاريخ ${date}`,
    page: (number, total) => `صفحة ${number} من ${total}`,
  },
}

/** What the database calls each kind of line; the Arabic statement says them in Arabic. Anything else is shown as written. */
const LINE_LABELS_AR: Record<string, string> = {
  Delivered: 'تم التسليم',
  Returned: 'مرتجع',
  Correction: 'تصحيح',
  Payout: 'دفعة مسددة',
  'Collected from shop': 'تحصيل من المتجر',
}

export const lineLabel = (label: string, lang: StatementLang): string => (lang === 'ar' ? LINE_LABELS_AR[label] ?? label : label)

/**
 * A date for the statement. Months are written in the statement's language and digits are always 0-9, as in Lebanon.
 * Compact gives 29/10/2026 for Arabic, because Arabic month names are too long for a table column.
 */
export function statementDay(iso: string, lang: StatementLang, compact = false): string {
  if (lang === 'ar' && compact) {
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso))
  }
  const locale = lang === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB'
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso))
}

const RIGHT_TO_LEFT = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}]/u
const LEFT_TO_RIGHT = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}]/u
const FIRST_LETTER = new RegExp(RIGHT_TO_LEFT.source + '|' + LEFT_TO_RIGHT.source, 'u')

/**
 * Which way a piece of text runs, decided by its first letter, the way a browser does for dir="auto".
 * The PDF engine treats every paragraph as left to right unless told otherwise, which scrambles a name such as
 * "Cedar & Co." or a line that mixes Arabic words with numbers.
 */
export function textDirection(text: string): 'ltr' | 'rtl' {
  const first = text.match(FIRST_LETTER)?.[0]
  return first && RIGHT_TO_LEFT.test(first) ? 'rtl' : 'ltr'
}

export const isStatementLang = (value: unknown): value is StatementLang => value === 'en' || value === 'ar'

/** The email that carries a statement as a PDF attachment. `closing` is the closing balance, already formatted. */
export function statementEmail(
  lang: StatementLang,
  details: { company: string; shop: string; from: string; to: string; closing: string },
): { subject: string; text: string } {
  const from = statementDay(details.from + 'T00:00:00Z', lang)
  const to = statementDay(details.to + 'T00:00:00Z', lang)
  const { company, shop, closing } = details
  if (lang === 'ar') {
    return {
      subject: `${company}: كشف حساب من ${from} إلى ${to}`,
      text: `مرحبا ${shop}،\n\nنرفق لكم كشف حسابكم لدى ${company} عن الفترة من ${from} إلى ${to} بصيغة PDF.\nالرصيد الختامي: ${closing}\n\nمع التحية،\n${company}\n`,
    }
  }
  return {
    subject: `${company}: account statement ${from} to ${to}`,
    text: `Hello ${shop},\n\nYour ${company} account statement for ${from} to ${to} is attached as a PDF.\nClosing balance: ${closing}\n\nKind regards,\n${company}\n`,
  }
}
