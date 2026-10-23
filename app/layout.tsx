import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Cedar Delivery Desk',
  description: 'Every order. Every dollar. All accounted for.',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
