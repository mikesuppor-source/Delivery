import nodemailer from 'nodemailer'
import { ApiError } from './api'

/**
 * Outgoing email goes over SMTP, so any provider works: Gmail, Outlook, Zoho, or Resend and SendGrid through
 * their SMTP service. Two settings are needed, both set in Vercel and never stored in the code:
 *   SMTP_URL    smtps://user:password@smtp.example.com:465   (special characters in the password are %-encoded)
 *   EMAIL_FROM  Cedar Express <statements@example.com>
 */
export function emailConfig(env: Record<string, string | undefined> = process.env): { url: string; from: string } | null {
  const url = env.SMTP_URL?.trim()
  const from = env.EMAIL_FROM?.trim()
  return url && from ? { url, from } : null
}

export const emailConfigured = () => emailConfig() !== null

export interface EmailMessage {
  to: string
  subject: string
  text: string
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>
}

type CreateTransport = (url: string, defaults: { connectionTimeout: number; greetingTimeout: number; socketTimeout: number }) => Pick<ReturnType<typeof nodemailer.createTransport>, 'sendMail' | 'close'>

export const EMAIL_NOT_SET_UP = 'Email is not set up yet. The account owner can add the SMTP settings in Vercel (see the README).'

/** Sends one message, or throws an error with wording that is safe to show on screen. */
export async function sendEmail(
  message: EmailMessage,
  config: { url: string; from: string } | null = emailConfig(),
  createTransport: CreateTransport = nodemailer.createTransport as CreateTransport,
): Promise<void> {
  if (!config) throw new ApiError(503, EMAIL_NOT_SET_UP)
  const transport = createTransport(config.url, { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 })
  try {
    await transport.sendMail({ from: config.from, to: message.to, subject: message.subject, text: message.text, attachments: message.attachments })
  } catch (error) {
    // The reason is for the server log only. The SMTP address holds the password, so it is never logged or shown.
    console.error('Email could not be sent:', (error as Error).message)
    throw new ApiError(502, 'The email could not be sent. Check the shop address and the email settings, then try again.')
  } finally {
    transport.close()
  }
}

/** m***@example.com: enough for the sender to recognise the address, not enough to read it off a screenshot. */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@')
  return at < 1 ? '***' : `${address[0]}***${address.slice(at)}`
}
