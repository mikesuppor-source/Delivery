/**
 * tests/cron.test.ts
 * Scheduled jobs run with the service role, so they must only answer the scheduler, and every job named
 * in vercel.json must be a route that exists.
 */

import { strict as assert } from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { requireCron } from '../lib/cron.js'

const call = (authorization?: string) =>
  new Request('https://example.test/api/cron/bonuses', { headers: authorization === undefined ? {} : { authorization } })
const statusOf = (run: () => void) => {
  try {
    run()
    return 200
  } catch (error) {
    return (error as { status?: number }).status
  }
}

describe('scheduled jobs', () => {
  const original = process.env.CRON_SECRET
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = original
  })

  it('refuse every request while no secret is set', () => {
    delete process.env.CRON_SECRET
    assert.equal(statusOf(() => requireCron(call('Bearer anything'))), 401)
    assert.equal(statusOf(() => requireCron(call('Bearer '))), 401)
    assert.equal(statusOf(() => requireCron(call())), 401)
  })

  it('accept only the exact secret, sent as a bearer token', () => {
    process.env.CRON_SECRET = 'a-long-random-secret'
    assert.equal(statusOf(() => requireCron(call('Bearer a-long-random-secret'))), 200)
    assert.equal(statusOf(() => requireCron(call('Bearer a-long-random-secreT'))), 401)
    assert.equal(statusOf(() => requireCron(call('Bearer a-long-random-secret2'))), 401)
    assert.equal(statusOf(() => requireCron(call('a-long-random-secret'))), 401)
    assert.equal(statusOf(() => requireCron(call())), 401)
  })

  it('are scheduled in vercel.json, and each schedule points at a route that exists', () => {
    const { crons } = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons: Array<{ path: string; schedule: string }> }
    const bonuses = crons.find(job => job.path === '/api/cron/bonuses')
    assert.ok(bonuses, 'courier bonuses are not scheduled')
    assert.equal(bonuses.schedule, '0 3 * * 1', 'bonuses run on Monday at 03:00 UTC, after the week has ended')
    for (const job of crons) {
      assert.ok(existsSync(join('app', ...job.path.split('/').filter(Boolean), 'route.ts')), `${job.path} has no route`)
    }
  })
})
