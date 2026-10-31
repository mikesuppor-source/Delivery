import test from 'node:test'
import assert from 'node:assert/strict'
import nextConfig from '../next.config'

// On Vercel each route ships only the files Next's tracing can see. The statement PDF loads its fonts by name at run time
// (the Cairo font from assets/fonts and pdfkit's built-in Helvetica), so both folders must be listed for both routes.
// Without the pdfkit folder every statement download and email failed on the live site with "Cannot find module ... Helvetica.cjs".
test('both statement routes ship the fonts the PDF loads at run time', () => {
  const includes = nextConfig.outputFileTracingIncludes ?? {}
  for (const route of ['/api/statements/shop', '/api/statements/shop/email']) {
    const globs = includes[route] ?? []
    assert.ok(globs.some(g => g.includes('assets/fonts')), route + ' must ship assets/fonts')
    assert.ok(globs.some(g => g.includes('node_modules/pdfkit/js')), route + ' must ship pdfkit\'s built-in fonts')
  }
})
