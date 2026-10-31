/**
 * The WhatsApp templates Cedar sends. WhatsApp only lets a business start a conversation with a message template
 * that Meta approved in advance, so each template below must be created in Meta's WhatsApp Manager with exactly this
 * name, language and text (category: Utility). The same texts are listed in docs/WHATSAPP_TEMPLATES.md.
 *
 * Each template has numbered variables ({{1}}, {{2}}, ...). `params` says which Cedar value fills which number.
 * Meta's rules this file follows: a text never starts or ends with a variable, and variables are numbered 1, 2, 3
 * with no gaps.
 */
export type TemplateKey = 'order_created' | 'out_for_delivery' | 'delivered' | 'failed_attempt' | 'held'
export type TemplateLang = 'en' | 'ar'

export interface MetaTemplate {
  /** The name to give the template in Meta's WhatsApp Manager. */
  name: string
  /** The Cedar values for {{1}}, {{2}}, ... in order. */
  params: string[]
  en: string
  ar: string
}

export const META_TEMPLATES: Record<TemplateKey, MetaTemplate> = {
  order_created: {
    name: 'cedar_order_confirmed',
    params: ['code', 'shop', 'track_url'],
    en: 'Hello! Your order #{{1}} from {{2}} is confirmed. Track your package here: {{3}} . Thank you for choosing us.',
    ar: 'مرحباً! تم تأكيد طلبك #{{1}} من متجر {{2}}. يمكنك تتبع شحنتك من هنا: {{3}} . شكراً لاختيارك لنا.',
  },
  out_for_delivery: {
    name: 'cedar_out_for_delivery',
    params: ['code', 'courier', 'track_url'],
    en: 'Good news! Your order #{{1}} is out for delivery with our courier {{2}}. Live tracking: {{3}} . Please keep your phone nearby.',
    ar: 'أخبار سارة! طلبك #{{1}} في طريقه إليك الآن مع السائق {{2}}. التتبع المباشر: {{3}} . نرجو إبقاء هاتفك قريباً.',
  },
  delivered: {
    name: 'cedar_delivered',
    params: ['code', 'track_url'],
    en: 'Your order #{{1}} has been delivered. We would love your feedback: {{2}} . Thank you!',
    ar: 'تم تسليم طلبك #{{1}} بنجاح. يسعدنا تقييمك لخدمتنا: {{2}} . شكراً لك!',
  },
  failed_attempt: {
    name: 'cedar_delivery_failed',
    params: ['code', 'reason', 'track_url'],
    en: 'We could not deliver your order #{{1}} ({{2}}). We will reschedule soon. Track here: {{3}} . Thank you for your patience.',
    ar: 'تعذر تسليم طلبك #{{1}} بسبب ({{2}}). سنقوم بإعادة الجدولة قريباً. للتتبع: {{3}} . شكراً لصبرك.',
  },
  held: {
    name: 'cedar_order_held',
    params: ['code', 'date', 'track_url'],
    en: 'Your order #{{1}} is safely kept in our warehouse until {{2}}. Track here: {{3}} . We will contact you before delivery.',
    ar: 'طلبك #{{1}} محفوظ بأمان في مستودعنا حتى {{2}}. للتتبع: {{3}} . سنتواصل معك قبل التسليم.',
  },
}

/** The language code WhatsApp expects for a template translation. */
export const META_LANGUAGE_CODE: Record<TemplateLang, string> = { en: 'en', ar: 'ar' }

/** The body parameters to send for a template: the Cedar values in the order the numbered variables expect. */
export function templateParameters(template: TemplateKey, params: Record<string, string | number>): Array<{ type: 'text'; text: string }> {
  return META_TEMPLATES[template].params.map(key => ({
    type: 'text' as const,
    // WhatsApp refuses variables that are empty, or that hold line breaks, tabs or long runs of spaces
    text: String(params[key] ?? '').replace(/\s+/g, ' ').trim() || '-',
  }))
}

/** The full request body for the WhatsApp Cloud API. */
export function templateMessage(to: string, template: TemplateKey, lang: TemplateLang, params: Record<string, string | number>) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: META_TEMPLATES[template].name,
      language: { code: META_LANGUAGE_CODE[lang] },
      components: [{ type: 'body', parameters: templateParameters(template, params) }],
    },
  }
}

/** The list written in docs/WHATSAPP_TEMPLATES.md, so the document can never drift from the code. */
export function templatesDocument(): string {
  const lines = [
    '# WhatsApp message templates',
    '',
    'WhatsApp only lets a business start a conversation with a template that Meta approved in advance.',
    'Create each template below in Meta\'s WhatsApp Manager (Message templates, Create template) with exactly this name,',
    'category **Utility**, one translation per language, and the text shown. Keep the numbered variables ({{1}}, {{2}}, ...).',
    'Meta asks for an example value for each variable: use the ones listed.',
    '',
    'This file is checked by a test against `lib/whatsapp-templates.ts`. Change the code and this file together.',
    '',
  ]
  const examples: Record<string, string> = {
    code: 'CED-1042', shop: 'Beirut Boutique', track_url: 'https://delivery-five-roan.vercel.app/track/abc123', courier: 'Rami',
    reason: 'no answer', date: '5 Nov',
  }
  for (const key of Object.keys(META_TEMPLATES) as TemplateKey[]) {
    const t = META_TEMPLATES[key]
    lines.push(`## ${t.name}`, '', `Sent when: ${WHEN[key]}`, '', `Example values: ${t.params.map((p, i) => `{{${i + 1}}} = ${examples[p]}`).join(', ')}`, '', 'English (`en`):', '', '```', t.en, '```', '', 'Arabic (`ar`):', '', '```', t.ar, '```', '')
  }
  return lines.join('\n')
}

const WHEN: Record<TemplateKey, string> = {
  order_created: 'a new order is made for the customer.',
  out_for_delivery: 'the courier picks the parcel up and sets off.',
  delivered: 'the parcel is delivered.',
  failed_attempt: 'a delivery attempt fails.',
  held: 'the parcel is put in the warehouse.',
}
