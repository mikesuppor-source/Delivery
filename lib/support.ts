// Your dispatch team's WhatsApp number, set in Vercel as NEXT_PUBLIC_SUPPORT_PHONE
// (any format, e.g. +961 70 123 456). When it is not set, contact buttons are hidden
// rather than pointing customers and couriers at a number nobody answers.
export const SUPPORT_WHATSAPP = (process.env.NEXT_PUBLIC_SUPPORT_PHONE || '').replace(/\D/g, '')

/** wa.me link to dispatch with a pre-filled message, or null when no number is configured. */
export function supportWhatsAppUrl(message: string): string | null {
  return SUPPORT_WHATSAPP ? `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}` : null
}
