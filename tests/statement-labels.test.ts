/**
 * tests/statement-labels.test.ts
 * The statement PDF can be printed in English or Arabic. Every English line must have an Arabic one, and the
 * Arabic dates must still use the 0-9 digits people in Lebanon write.
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { STATEMENT_LABELS, isStatementLang, lineLabel, statementDay, textDirection } from '../lib/statement-labels.js'

const ARABIC = /\p{Script=Arabic}/u
const LATIN = /[A-Za-z]/

describe('statement wording', () => {
  it('has an Arabic line for every English one, in Arabic letters', () => {
    const english = STATEMENT_LABELS.en
    const arabic = STATEMENT_LABELS.ar
    assert.deepEqual(Object.keys(arabic).sort(), Object.keys(english).sort())
    for (const key of Object.keys(english) as Array<keyof typeof english>) {
      const [en, ar] = [english[key], arabic[key]]
      if (typeof en === 'function' && typeof ar === 'function') {
        const sample = (ar as (...args: Array<string | number>) => string)(...(key === 'page' ? [2, 5] : ['Cedar Express', '29 Oct 2026']))
        assert.match(sample, ARABIC, key)
      } else {
        assert.match(ar as string, ARABIC, key)
        assert.doesNotMatch(ar as string, LATIN, `${key} should be fully Arabic`)
      }
    }
  })

  it('puts every figure in the Arabic footer where it was in the English one', () => {
    assert.equal(STATEMENT_LABELS.en.page(2, 5), 'Page 2 of 5')
    assert.match(STATEMENT_LABELS.ar.page(2, 5), /2.*5/)
    assert.match(STATEMENT_LABELS.ar.generated('Cedar Express', '29 Oct 2026'), /Cedar Express.*29 Oct 2026/)
  })

  it('writes dates with Arabic month names and 0-9 digits', () => {
    const iso = '2026-10-29T10:00:00Z'
    assert.equal(statementDay(iso, 'en'), '29 Oct 2026')
    const arabic = statementDay(iso, 'ar')
    assert.match(arabic, ARABIC)
    assert.match(arabic, /29/)
    assert.match(arabic, /2026/)
    assert.doesNotMatch(arabic, /[٠-٩]/) // no Arabic-Indic digits
  })

  it('translates the lines the database writes, and leaves anything else as it was written', () => {
    assert.equal(lineLabel('Delivered', 'en'), 'Delivered')
    assert.match(lineLabel('Delivered', 'ar'), ARABIC)
    assert.match(lineLabel('Returned', 'ar'), ARABIC)
    assert.match(lineLabel('Payout', 'ar'), ARABIC)
    assert.match(lineLabel('Correction', 'ar'), ARABIC)
    assert.equal(lineLabel('Bonus for March', 'ar'), 'Bonus for March')
  })

  it('keeps dates short enough for a table column in Arabic', () => {
    assert.equal(statementDay('2026-10-29T10:00:00Z', 'ar', true), '29/10/2026')
    assert.equal(statementDay('2026-10-29T10:00:00Z', 'en', true), '29 Oct 2026') // English already fits
  })

  it('reads the direction of a name from its first letter', () => {
    assert.equal(textDirection('Cedar & Co.'), 'ltr')
    assert.equal(textDirection('متجر الأرز'), 'rtl')
    assert.equal(textDirection('متجر الأرز - Cedar Gifts'), 'rtl')
    assert.equal(textDirection('Cedar Gifts - متجر الأرز'), 'ltr')
    assert.equal(textDirection('123 - متجر'), 'rtl') // digits and punctuation do not decide
    assert.equal(textDirection('+961 3 555 666'), 'ltr')
    assert.equal(textDirection(''), 'ltr')
    assert.equal(textDirection('שלום'), 'rtl')
  })

  it('only accepts the two languages', () => {
    assert.equal(isStatementLang('ar'), true)
    assert.equal(isStatementLang('en'), true)
    assert.equal(isStatementLang('fr'), false)
    assert.equal(isStatementLang(undefined), false)
  })
})
