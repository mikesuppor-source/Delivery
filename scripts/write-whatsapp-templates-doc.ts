// Writes docs/WHATSAPP_TEMPLATES.md from lib/whatsapp-templates.ts. Run: npx tsx scripts/write-whatsapp-templates-doc.ts
import { writeFileSync } from 'node:fs'
import { templatesDocument } from '../lib/whatsapp-templates'

writeFileSync('docs/WHATSAPP_TEMPLATES.md', templatesDocument() + '\n', 'utf8')
console.log('Wrote docs/WHATSAPP_TEMPLATES.md')
