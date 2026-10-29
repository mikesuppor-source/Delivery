/**
 * tests/server-components.test.ts
 * Next.js renders every file under app/ on the server unless it starts with 'use client', and a server
 * component cannot carry an event handler: the page fails to render. This scan catches that early.
 * (The settlement voucher page once had onClick on a button and came up as an empty page.)
 */

import { strict as assert } from 'node:assert'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : tsxFiles(path)
    return path.endsWith('.tsx') ? [path] : []
  })
}

const HANDLER = /\son(Click|DoubleClick|Change|Input|Submit|KeyDown|KeyUp|Focus|Blur|MouseEnter|MouseLeave|MouseDown|MouseUp)=\{/
const isClientFile = (source: string) => /^(\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*['"]use client['"]/.test(source)

describe('server components', () => {
  it('never attach event handlers (those need a client component)', () => {
    const offenders = tsxFiles('app')
      .filter(file => {
        const source = readFileSync(file, 'utf8')
        return !isClientFile(source) && HANDLER.test(source)
      })
      .map(file => file.replace(/\\/g, '/'))
    assert.deepEqual(offenders, [], 'Move the handler into a client component and render that instead')
  })

  it('recognises a client file whose directive follows a comment', () => {
    assert.equal(isClientFile("'use client'\nimport x from 'y'"), true)
    assert.equal(isClientFile("// note\n'use client'\n"), true)
    assert.equal(isClientFile("/* note */\n\"use client\"\n"), true)
    assert.equal(isClientFile("import x from 'y'\n'use client'\n"), false)
  })
})
