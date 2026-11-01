import type { ReactNode } from 'react'

/** The page frame for the public privacy and terms pages: readable on a phone, no sign-in, no menus. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main style={{ maxWidth: 760, width: '100%', margin: '0 auto', padding: '32px 20px 64px', lineHeight: 1.65, color: 'var(--text)' }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--brand)' }}>Cedar Delivery Desk</p>
      <h1 style={{ margin: '4px 0 4px', fontSize: 30 }}>{title}</h1>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--muted)' }}>Last updated {updated}</p>
      {children}
    </main>
  )
}

export const legalHeading = { margin: '28px 0 8px', fontSize: 19 } as const
export const contactLine = (email?: string) =>
  email ? `You can contact us at ${email}.` : 'You can contact the delivery company that sent you the parcel, using the details in your delivery message.'
