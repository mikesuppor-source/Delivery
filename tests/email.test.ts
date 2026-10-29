/**
 * tests/email.test.ts
 * Statements are emailed over SMTP. These tests talk to a small SMTP server running inside the test, so the real
 * mail library, the attachment and the failure handling are all exercised without sending anything anywhere.
 */

import { strict as assert } from 'node:assert'
import net from 'node:net'
import { afterEach, describe, it } from 'node:test'
import { emailConfig, maskEmail, sendEmail } from '../lib/email.js'
import { statementEmail } from '../lib/statement-labels.js'

/** A pretend mail server that accepts everything and keeps the messages it was given. */
async function fakeSmtp() {
  const messages: string[] = []
  const server = net.createServer(socket => {
    socket.write('220 fake ESMTP\r\n')
    let buffer = ''
    let receiving = false
    socket.on('data', chunk => {
      buffer += chunk.toString('latin1')
      for (;;) {
        if (receiving) {
          const end = buffer.indexOf('\r\n.\r\n')
          if (end < 0) return
          messages.push(buffer.slice(0, end))
          buffer = buffer.slice(end + 5)
          receiving = false
          socket.write('250 queued\r\n')
          continue
        }
        const eol = buffer.indexOf('\r\n')
        if (eol < 0) return
        const command = buffer.slice(0, eol).slice(0, 4).toUpperCase()
        buffer = buffer.slice(eol + 2)
        if (command === 'EHLO' || command === 'HELO') socket.write('250-fake\r\n250 8BITMIME\r\n')
        else if (command === 'DATA') { receiving = true; socket.write('354 go ahead\r\n') }
        else if (command === 'QUIT') { socket.write('221 bye\r\n'); socket.end() }
        else socket.write('250 ok\r\n')
      }
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return {
    url: `smtp://127.0.0.1:${(server.address() as net.AddressInfo).port}`,
    messages,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  }
}

/** The bytes of the first attachment in a raw message. */
function attachmentBytes(raw: string): Buffer {
  const part = raw.split(/\r\n--[^\r\n]+/).find(chunk => /content-type: application\/pdf/i.test(chunk))
  assert.ok(part, 'no PDF attachment in the message')
  return Buffer.from(part.split('\r\n\r\n').slice(1).join('').replace(/\s+/g, ''), 'base64')
}

/** Header values may be written as =?UTF-8?B?...?= words when they hold Arabic. */
function header(raw: string, name: string): string {
  const line = new RegExp(`^${name}: (.*(?:\\r\\n[ \\t].*)*)`, 'im').exec(raw)?.[1].replace(/\r\n[ \t]+/g, '') ?? ''
  return line.replace(/=\?UTF-8\?B\?([^?]+)\?=/gi, (_all, data: string) => Buffer.from(data, 'base64').toString('utf8'))
}

describe('email settings', () => {
  it('need both the mail server and the sender, and are trimmed', () => {
    assert.equal(emailConfig({}), null)
    assert.equal(emailConfig({ SMTP_URL: 'smtp://example.test' }), null)
    assert.equal(emailConfig({ EMAIL_FROM: 'a@example.test' }), null)
    assert.equal(emailConfig({ SMTP_URL: '  ', EMAIL_FROM: 'a@example.test' }), null)
    assert.deepEqual(emailConfig({ SMTP_URL: ' smtp://example.test ', EMAIL_FROM: ' Cedar <a@example.test> ' }), { url: 'smtp://example.test', from: 'Cedar <a@example.test>' })
  })

  it('show an address without giving all of it away', () => {
    assert.equal(maskEmail('maya@example.com'), 'm***@example.com')
    assert.equal(maskEmail('a@b.co'), 'a***@b.co')
    assert.equal(maskEmail('no-at-sign'), '***')
    assert.equal(maskEmail(''), '***')
  })
})

describe('sending an email', () => {
  const original = console.error
  afterEach(() => { console.error = original })

  it('refuses with a clear message while email is not set up', async () => {
    await assert.rejects(sendEmail({ to: 'a@example.test', subject: 's', text: 't' }, null), (error: { status?: number; message: string }) => {
      assert.equal(error.status, 503)
      assert.match(error.message, /not set up/)
      return true
    })
  })

  it('delivers the message and its PDF unchanged', async () => {
    const server = await fakeSmtp()
    try {
      const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from(Array.from({ length: 4000 }, (_, i) => (i * 7) % 256)), Buffer.from('\n%%EOF\n')])
      await sendEmail(
        { to: 'maya@example.test', subject: 'Cedar: account statement', text: 'Hello Maya,\nYour statement is attached.', attachments: [{ filename: 'statement.pdf', content: pdf, contentType: 'application/pdf' }] },
        { url: server.url, from: 'Cedar Express <statements@example.test>' },
      )
      assert.equal(server.messages.length, 1)
      const raw = server.messages[0]
      assert.match(header(raw, 'From'), /Cedar Express <statements@example\.test>/)
      assert.match(header(raw, 'To'), /maya@example\.test/)
      assert.equal(header(raw, 'Subject'), 'Cedar: account statement')
      assert.match(raw, /filename="?statement\.pdf"?/)
      assert.ok(attachmentBytes(raw).equals(pdf), 'the attachment changed on the way')
    } finally {
      await server.close()
    }
  })

  it('keeps Arabic wording intact', async () => {
    const server = await fakeSmtp()
    try {
      const { subject, text } = statementEmail('ar', { company: 'سيدار للتوصيل', shop: 'متجر الأرز', from: '2026-10-01', to: '2026-10-31', closing: '$631.75' })
      await sendEmail({ to: 'maya@example.test', subject, text }, { url: server.url, from: 'statements@example.test' })
      const raw = server.messages[0]
      assert.equal(header(raw, 'Subject'), subject)
      // Arabic text goes out base64-encoded: decode the body and read it back
      assert.match(raw, /content-transfer-encoding: base64/i)
      const body = Buffer.from(raw.split('\r\n\r\n').slice(1).join('').replace(/\s+/g, ''), 'base64').toString('utf8')
      assert.equal(body, text)
    } finally {
      await server.close()
    }
  })

  it('reports a failure without showing the server address or password', async () => {
    const logged: string[] = []
    console.error = (...args: unknown[]) => { logged.push(args.join(' ')) }
    await assert.rejects(
      sendEmail({ to: 'maya@example.test', subject: 's', text: 't' }, { url: 'smtp://someone:s3cret-password@127.0.0.1:1', from: 'statements@example.test' }),
      (error: { status?: number; message: string }) => {
        assert.equal(error.status, 502)
        assert.doesNotMatch(error.message, /s3cret|127\.0\.0\.1|someone/)
        return true
      },
    )
    assert.ok(logged.length > 0, 'the reason should be logged for the server owner')
    assert.doesNotMatch(logged.join('\n'), /s3cret-password/)
  })
})

describe('the statement email', () => {
  it('names the company, the period and the closing balance, in English', () => {
    const { subject, text } = statementEmail('en', { company: 'Cedar Express', shop: 'Maya Boutique', from: '2026-10-01', to: '2026-10-31', closing: '$631.75' })
    assert.equal(subject, 'Cedar Express: account statement 01 Oct 2026 to 31 Oct 2026')
    assert.match(text, /^Hello Maya Boutique,/)
    assert.match(text, /Closing balance: \$631\.75/)
    assert.match(text, /attached as a PDF/)
  })

  it('is written in Arabic when asked', () => {
    const { subject, text } = statementEmail('ar', { company: 'Cedar Express', shop: 'Maya Boutique', from: '2026-10-01', to: '2026-10-31', closing: '$631.75' })
    assert.match(subject, /\p{Script=Arabic}/u)
    assert.match(subject, /Cedar Express/)
    assert.match(text, /\p{Script=Arabic}/u)
    assert.match(text, /\$631\.75/)
  })
})
