import test from 'node:test'
import assert from 'node:assert/strict'
import { alertEmail, checkGithub, findProblems, type Facts } from '../lib/watchdog'
import { logServerError, scrubErrorText } from '../lib/error-log'

const calm: Facts = {
  dbOk: true, webhooksBacklog: 0, webhooksFailed24h: 0, messagesBacklog: 0, messagesFailed24h: 0, errors24h: 0, errorPaths: [],
  github: { backup: { succeeded: true, stepsRan: true, ageHours: 12 }, senderAgeHours: 3 },
}
const titles = (f: Partial<Facts>) => findProblems({ ...calm, ...f }).map(p => p.title)

test('a calm system produces no problems and no email', () => {
  assert.deepEqual(findProblems(calm), [])
})

test('each kind of trouble is reported, and urgent ones are marked urgent', () => {
  assert.equal(findProblems({ ...calm, dbOk: false })[0].level, 'critical')
  const few = findProblems({ ...calm, errors24h: 3, errorPaths: [{ path: '/api/orders', count: 2 }, { path: '/api/send', count: 1 }] })
  assert.equal(few[0].level, 'warning'); assert.match(few[0].detail, /\/api\/orders \(2\)/)
  assert.equal(findProblems({ ...calm, errors24h: 20, errorPaths: [] })[0].level, 'critical')
  assert.match(titles({ messagesBacklog: 4 })[0], /4 customer messages are waiting/)
  assert.match(titles({ messagesFailed24h: 1 })[0], /1 customer message failed/)
  assert.match(titles({ webhooksBacklog: 1 })[0], /1 shop webhook message is waiting/)
  assert.deepEqual(titles({ webhooksFailed24h: 4 }), [], 'a few failed webhooks are a shop\'s own problem')
  assert.match(titles({ webhooksFailed24h: 5 })[0], /gave up/)
})

test('the backup is checked for failure, for skipped steps and for age', () => {
  const backup = (b: Facts['github']['backup']) => findProblems({ ...calm, github: { backup: b, senderAgeHours: 1 } })
  assert.match(backup({ succeeded: false, stepsRan: true, ageHours: 5 })[0].title, /failed/)
  assert.match(backup({ succeeded: true, stepsRan: false, ageHours: 5 })[0].title, /copied nothing/)
  assert.match(backup({ succeeded: true, stepsRan: true, ageHours: 40 })[0].title, /40 hours old/)
  assert.match(backup(null)[0].title, /never run/)
  assert.deepEqual(backup({ succeeded: true, stepsRan: true, ageHours: 30 }), [], 'a backup that is a day and a bit old is still fine')
  assert.match(findProblems({ ...calm, github: { backup: calm.github.backup, senderAgeHours: 30 } })[0].title, /message sender job has not run for 30 hours/)
  assert.deepEqual(findProblems({ ...calm, github: { unavailable: true } }), [], 'not being able to look at GitHub is not itself an alarm')
})

test('the alert email lists every problem and says when it is urgent', () => {
  const problems = findProblems({ ...calm, dbOk: false, messagesBacklog: 2 })
  const mail = alertEmail(problems, 'https://site.test')
  assert.match(mail.subject, /URGENT: 2 things need attention/)
  assert.match(mail.text, /URGENT: The database does not answer/)
  assert.match(mail.text, /Check: 2 customer messages are waiting/)
  assert.match(alertEmail(findProblems({ ...calm, messagesBacklog: 1 }), 'x').subject, /^Cedar check: 1 thing needs attention$|^Cedar check: 1 thing need attention$/)
})

const run = (id: number, conclusion: string, updatedHoursAgo: number, now: number) => ({ id, conclusion, updated_at: new Date(now - updatedHoursAgo * 3_600_000).toISOString() })
const github = (routes: Record<string, unknown>) => (async (url: string) => {
  const hit = Object.entries(routes).find(([path]) => url.includes(path))
  return hit ? { ok: true, status: 200, json: async () => hit[1] } : { ok: false, status: 404, json: async () => ({}) }
}) as unknown as typeof fetch

test('GitHub\'s answers are read into backup facts', async () => {
  const now = Date.parse('2026-11-01T12:00:00Z')
  const steps = (...names: string[]) => names.map(name => ({ name, conclusion: 'success' }))
  const good = github({
    'backup.yml/runs': { workflow_runs: [run(1, 'success', 11, now)] },
    'webhooks.yml/runs': { workflow_runs: [run(2, 'success', 2, now)] },
    'runs/1/jobs': { jobs: [{ name: 'backup', steps: steps('Dump and encrypt') }, { name: 'storage', steps: steps('Copy files and encrypt') }] },
  })
  const ok = await checkGithub({ repo: 'o/r', fetcher: good, now })
  assert.equal(ok.backup?.succeeded, true); assert.equal(ok.backup?.stepsRan, true); assert.equal(Math.round(ok.backup!.ageHours), 11); assert.equal(Math.round(ok.senderAgeHours!), 2)

  const skipped = github({
    'backup.yml/runs': { workflow_runs: [run(1, 'success', 11, now)] }, 'webhooks.yml/runs': { workflow_runs: [] },
    'runs/1/jobs': { jobs: [{ name: 'backup', steps: [{ name: 'Dump and encrypt', conclusion: 'skipped' }] }, { name: 'storage', steps: steps('Copy files and encrypt') }] },
  })
  const s = await checkGithub({ repo: 'o/r', fetcher: skipped, now })
  assert.equal(s.backup?.succeeded, true); assert.equal(s.backup?.stepsRan, false); assert.equal(s.senderAgeHours, null)

  assert.deepEqual(await checkGithub({ repo: 'o/r', fetcher: github({}), now }), { unavailable: true }, 'a GitHub error means "could not check", not "backup missing"')
  const none = await checkGithub({ repo: 'o/r', fetcher: github({ 'backup.yml/runs': { workflow_runs: [] }, 'webhooks.yml/runs': { workflow_runs: [] } }), now })
  assert.equal(none.backup, null)
})

test('error messages are cleaned before they are kept', () => {
  assert.equal(scrubErrorText('duplicate key for jad@example.com'), 'duplicate key for [email]')
  assert.equal(scrubErrorText('phone +961 71 123 456 not found'), 'phone [number] not found')
  assert.equal(scrubErrorText(undefined), '')
  assert.equal(scrubErrorText('x'.repeat(500)).length, 300)
})

test('logging an error never throws, even with no database to write to', async () => {
  assert.doesNotThrow(() => logServerError({ method: 'POST', path: '/api/x', status: 500, message: new Error('boom').message, requestId: 'r1' }))
  await new Promise(resolve => setTimeout(resolve, 50))
})
