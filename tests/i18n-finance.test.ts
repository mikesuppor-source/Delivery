/**
 * tests/i18n-finance.test.ts
 * The finance screens ask for their Arabic by the English sentence: t('Pay selected ({amount})'). When a sentence
 * has no Arabic line the screen quietly stays in English, so this test finds every sentence a screen asks for and
 * checks there is an Arabic line for it, that the {placeholders} match, and that no line is left over.
 */

import { strict as assert } from 'node:assert'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { en } from '../lib/i18n/en'
import { arFinance } from '../lib/i18n/ar-finance'
import { t } from '../lib/i18n'
import { EXPENSE_CATEGORY_LABELS, PAYOUT_METHOD_LABELS, WEEKDAY_LABELS, describePayMode } from '../lib/finance'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' || name === 'e2e' ? [] : sourceFiles(path)
    return /\.(ts|tsx)$/.test(path) ? [path] : []
  })
}

/** The text of every t('...') or t("...") call that starts with a quoted sentence. */
function askedFor(source: string): string[] {
  const found: string[] = []
  const call = /(?<![\w.$])t\(\s*(['"])/g
  for (let match = call.exec(source); match; match = call.exec(source)) {
    const quote = match[1]
    let text = ''
    let index = match.index + match[0].length
    while (index < source.length && source[index] !== quote) {
      if (source[index] === '\\') index++
      text += source[index]
      index++
    }
    found.push(text)
  }
  return found
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()
/** Arabic output carries invisible direction marks around inserted values: drop them to compare the visible text */
const withoutMarks = (text: string) => text.replace(/\p{Cf}/gu, '')
const ARABIC = /\p{Script=Arabic}/u

const sources = ['app', 'components', 'lib'].flatMap(sourceFiles)
const allText = sources.map(file => readFileSync(file, 'utf8')).join('\n')
const asked = new Set(sources.flatMap(file => askedFor(readFileSync(file, 'utf8'))))
// Sentences that come from lists in the code rather than from a t('...') call
const fromLists = [...Object.values(PAYOUT_METHOD_LABELS), ...Object.values(WEEKDAY_LABELS), ...Object.values(EXPENSE_CATEGORY_LABELS)]

describe('Arabic for the finance screens', () => {
  it('has an Arabic line for every sentence the screens ask for', () => {
    const missing = [...asked].filter(phrase => !(phrase in en) && !(phrase in arFinance))
    assert.deepEqual(missing, [], 'Add these to lib/i18n/ar-finance.ts')
  })

  it('has an Arabic line for every payout method, weekday and expense category', () => {
    assert.deepEqual(fromLists.filter(label => !(label in arFinance) && label !== 'Whish' && label !== 'OMT'), [])
  })

  it('keeps the {placeholders} of the English sentence, and writes the line in Arabic', () => {
    for (const [phrase, arabic] of Object.entries(arFinance)) {
      assert.deepEqual(placeholders(arabic), placeholders(phrase), `placeholders differ in: ${phrase}`)
      assert.match(arabic, ARABIC, `no Arabic letters in the line for: ${phrase}`)
    }
  })

  it('has no line that no screen uses', () => {
    const unused = Object.keys(arFinance).filter(phrase => !asked.has(phrase) && !fromLists.includes(phrase) && !allText.includes(phrase))
    assert.deepEqual(unused, [], 'Remove these from lib/i18n/ar-finance.ts')
  })

  it('does not collide with the short keys of the main dictionary', () => {
    assert.deepEqual(Object.keys(arFinance).filter(phrase => phrase in en), [])
  })
})

describe('t() with the finance sentences', () => {
  it('translates, fills in placeholders, and falls back to the English sentence', () => {
    assert.equal(withoutMarks(t('Pay selected ({amount})', 'ar', { amount: '$50.00' })), 'دفع المحدد ($50.00)')
    assert.equal(t('Pay selected ({amount})', 'en', { amount: '$50.00' }), 'Pay selected ($50.00)')
    assert.equal(t('A sentence nobody translated', 'ar'), 'A sentence nobody translated')
    // Existing short keys keep working next to the sentences
    assert.equal(t('navPayouts', 'en'), 'Shop Payouts')
    assert.match(t('navPayouts', 'ar'), ARABIC)
  })

  it('describes how a courier is paid in either language', () => {
    assert.equal(describePayMode('percent', 25), '25% of the fee')
    assert.equal(describePayMode('fixed', null), 'Fixed rate per zone')
    assert.equal(withoutMarks(describePayMode('percent', 25, (phrase, params) => t(phrase, 'ar', params))), '25% من الرسوم')
    assert.match(describePayMode('fixed', null, phrase => t(phrase, 'ar')), ARABIC)
  })

  it('keeps an inserted amount in order inside Arabic words, and leaves English alone', () => {
    const arabic = t('Paid {shops}: {amount}', 'ar', { shops: '3 متاجر', amount: '$40.00' })
    // Each value sits between invisible isolate marks (category Cf), so the Arabic around it cannot re-order it
    assert.match(arabic, /\p{Cf}\$40\.00\p{Cf}/u)
    assert.equal(withoutMarks(arabic), 'تم دفع 3 متاجر: $40.00')
    assert.equal(t('Paid {shops}: {amount}', 'en', { shops: '3 shops', amount: '$40.00' }), 'Paid 3 shops: $40.00')
    // Special characters in a value are inserted as they are
    assert.equal(withoutMarks(t('Paid {shops}: {amount}', 'ar', { shops: 'x', amount: "$& $1 $'" })), "تم دفع x: $& $1 $'")
  })
})
