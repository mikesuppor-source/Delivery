import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// This repository is public: a key written into the code is a key everyone can read.
// Keys, tokens and passwords belong in the hosting settings (see .env.local.example), never in a fallback.
const FOLDERS = ['app', 'lib', 'components', 'scripts', 'public']
const FILES = ['middleware.ts']
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs)$/
const RULES: Array<[string, RegExp]> = [
  ['a key, token or password written after || or ??', /(VAPID|SECRET|TOKEN|API_?KEY|PRIVATE|PASSWORD|PASSWD)[A-Z0-9_]*\s*(\|\||\?\?)\s*['"`][A-Za-z0-9_+/=.-]{20,}['"`]/],
  ['a private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['a Supabase secret key', /sb_secret_[A-Za-z0-9_-]{10,}/],
]

function codeFiles(folder: string): string[] {
  return readdirSync(folder).flatMap(name => {
    if (name === 'node_modules' || name === '.next') return []
    const path = join(folder, name)
    return statSync(path).isDirectory() ? codeFiles(path) : CODE.test(name) ? [path] : []
  })
}

test('no key, token or password is written into the code', () => {
  const files = [...FOLDERS.flatMap(codeFiles), ...FILES]
  assert.ok(files.length > 50, 'the scan found the source files')
  const found: string[] = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const [what, rule] of RULES) if (rule.test(text)) found.push(`${file}: ${what}`)
  }
  assert.deepEqual(found, [], 'Keep keys in the hosting settings only: this repository is public')
})

test('the scan really catches a built-in key', () => {
  const rule = RULES[0][1]
  assert.ok(rule.test("export const KEY = process.env.VAPID_PRIVATE_KEY || 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'"))
  assert.ok(rule.test("const token =\n  process.env.SOME_TOKEN ??\n  'abcdefghijklmnopqrstuvwxyz012345'"))
  assert.ok(!rule.test("const subject = process.env.VAPID_SUBJECT || 'mailto:dispatch@cedardelivery.com'"))
  assert.ok(!rule.test("const url = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'"))
})
