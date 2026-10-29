import { join } from 'node:path'
import { Font } from '@react-pdf/renderer'

/**
 * The PDF font. Cairo (SIL Open Font License, see assets/fonts/OFL.txt) has Arabic and Latin letters in one
 * file, so a company, shop or address written in either script, or both, prints correctly. PDF's built-in
 * fonts have no Arabic at all.
 */
export const PDF_FONT = 'Cairo'

let registered = false

/** Registers the font once per server process. */
export function registerPdfFonts() {
  if (registered) return
  const dir = join(process.cwd(), 'assets', 'fonts')
  Font.register({
    family: PDF_FONT,
    fonts: [
      { src: join(dir, 'Cairo-Regular.ttf'), fontWeight: 400 },
      { src: join(dir, 'Cairo-Bold.ttf'), fontWeight: 700 },
    ],
  })
  // Names and addresses must never be split with a hyphen
  Font.registerHyphenationCallback(word => [word])
  registered = true
}
