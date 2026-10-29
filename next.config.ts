import type { NextConfig } from 'next'

// The statement PDF reads its font from disk at run time, which Next's file tracing cannot see on its own.
// Every route that renders a statement lists the font folder, so the deployed function has it.
const STATEMENT_FONTS = ['./assets/fonts/**/*']

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    '/api/statements/shop': STATEMENT_FONTS,
    '/api/statements/shop/email': STATEMENT_FONTS,
  },
}

export default nextConfig
