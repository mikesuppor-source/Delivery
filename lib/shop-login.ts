import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from './api'
import { emailConfigured, sendEmail } from './email'

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Staff logins never get a shop password link: it would let a manager take over an owner account. */
const STAFF_ROLES = ['owner', 'manager', 'driver']

export async function refuseStaffLogin(db: SupabaseClient, userId: string) {
  const { data } = await db.from('workspace_members').select('role').eq('user_id', userId).in('role', STAFF_ROLES).limit(1)
  if (data?.length) throw new ApiError(403, 'That login belongs to staff, so it cannot be used for a shop.')
}

/** A one-time link where the shop chooses its password. It ends at /reset-password with the sign-in tokens in the address. */
export async function passwordLink(db: SupabaseClient, email: string, redirectTo: string): Promise<string> {
  const { data, error } = await db.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } })
  const link = data?.properties?.action_link
  if (error || !link) throw new ApiError(502, 'Could not make the password link. Try again in a moment.')
  return link
}

export function loginEmail(shopName: string, link: string): { subject: string; text: string } {
  return {
    subject: `Your ${shopName} delivery portal login`,
    text: [
      `Hello,`,
      ``,
      `${shopName} now has a login to the delivery portal. Open this link to choose your password:`,
      ``,
      link,
      ``,
      `The link works once and only for a short time. If it has expired, ask us for a new one.`,
    ].join('\n'),
  }
}

/** Tries to email the link. Never throws: the desk always shows the link too, so it can be sent by WhatsApp instead. */
export async function tryEmailLink(email: string, shopName: string, link: string): Promise<boolean> {
  if (!emailConfigured()) return false
  try {
    await sendEmail({ to: email, ...loginEmail(shopName, link) })
    return true
  } catch {
    return false
  }
}
