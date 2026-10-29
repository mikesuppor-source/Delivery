/**
 * tests/map.test.ts
 * Unit tests for lib/map.ts: courier status on the live map, and escaping of the HTML drawn on markers.
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { driverPinHtml, driverStatus, escapeHtml, stopPinHtml, stopPopupHtml } from '../lib/map.js'

const NOW = Date.UTC(2026, 9, 29, 12, 0, 0)
const minutesAgo = (m: number) => new Date(NOW - m * 60000).toISOString()
const fix = (minutes: number) => ({ last_seen_at: minutesAgo(minutes), current_lat: 33.89, current_lng: 35.5 })

describe('courier status', () => {
  it('is active within 15 minutes of the last GPS fix', () => {
    assert.equal(driverStatus(fix(0), NOW), 'active')
    assert.equal(driverStatus(fix(15), NOW), 'active')
  })

  it('is idle between 15 and 45 minutes', () => {
    assert.equal(driverStatus(fix(16), NOW), 'idle')
    assert.equal(driverStatus(fix(45), NOW), 'idle')
  })

  it('is offline after 45 minutes', () => {
    assert.equal(driverStatus(fix(46), NOW), 'offline')
    assert.equal(driverStatus(fix(600), NOW), 'offline')
  })

  it('is offline without a GPS fix, whatever else is known', () => {
    assert.equal(driverStatus({}, NOW), 'offline')
    assert.equal(driverStatus({ last_seen_at: minutesAgo(1), current_lat: null, current_lng: 35.5 }, NOW), 'offline')
    assert.equal(driverStatus({ last_seen_at: null, current_lat: 33.89, current_lng: 35.5 }, NOW), 'offline')
  })
})

describe('escaping for map HTML', () => {
  it('escapes the characters that can open a tag or leave an attribute', () => {
    assert.equal(escapeHtml(`<a href="x" onclick='y'>&`), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;')
    assert.equal(escapeHtml(null), '')
    assert.equal(escapeHtml(42), '42')
  })

  it('keeps a hostile recipient name and address inert in the stop popup', () => {
    const html = stopPopupHtml({
      number: 2,
      code: 'CD-1234',
      recipientName: '<img src=x onerror=alert(1)>',
      recipientAddress: '"><script>fetch("/api/finance/payouts")</script>',
    })
    assert.ok(!/<img/i.test(html), 'no raw img tag')
    assert.ok(!/<script/i.test(html), 'no raw script tag')
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
    assert.ok(html.includes('&quot;&gt;&lt;script&gt;'))
    assert.ok(html.includes('Stop #2: CD-1234'))
  })

  it('keeps a hostile courier name inert in the courier pin', () => {
    const html = driverPinHtml({ name: '</span><img src=x onerror=alert(1)>', status: 'active', selected: false, icon: '🛵' })
    assert.ok(!/<img/i.test(html))
    assert.ok(html.includes('&lt;/span&gt;&lt;img'))
    assert.ok(html.includes('#059669'), 'active couriers are green')
  })

  it('falls back to "Customer" and an empty address', () => {
    const html = stopPopupHtml({ number: 1, code: 'CD-1' })
    assert.ok(html.includes('<span>Customer</span>'))
  })

  it('draws the selected courier larger and the stop number as plain text', () => {
    assert.ok(driverPinHtml({ name: 'A', status: 'idle', selected: true, icon: '🚗' }).includes('scale(1.15)'))
    assert.ok(driverPinHtml({ name: 'A', status: 'idle', selected: false, icon: '🚗' }).includes('scale(1)'))
    assert.ok(stopPinHtml(7).includes('>7</div>'))
  })
})
