import { test, expect } from 'playwright/test'
import { localDb } from './helpers'

const CRON = process.env.CRON_SECRET

test('the health address answers for uptime monitors and shows nothing private', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body).toMatchObject({ status: 'ok', database: 'ok' })
  expect(Object.keys(body).sort()).toEqual(['database', 'ms', 'status', 'version'])
})

test('the daily job is for the scheduler only, and it reports trouble without emailing when asked not to', async ({ request }) => {
  test.skip(!CRON, 'needs CRON_SECRET')
  expect((await request.get('/api/cron/daily')).status()).toBe(401)
  expect((await request.get('/api/cron/daily', { headers: { Authorization: 'Bearer wrong' } })).status()).toBe(401)

  const db = localDb()
  const marker = '/api/monitoring-test-' + Math.random().toString(36).slice(2, 7)
  // Every row names created_at: a bulk insert whose rows have different columns would turn the missing one into null
  const fresh = Array.from({ length: 21 }, () => ({ method: 'POST', path: marker, status: 500, message: 'test error', created_at: new Date().toISOString() }))
  const old = { method: 'GET', path: marker + '-old', status: 500, message: 'ancient', created_at: new Date(Date.now() - 40 * 86_400_000).toISOString() }
  try {
    expect((await db.from('error_log').insert([...fresh, old])).error).toBeNull()
    const res = await request.get('/api/cron/daily?send=0&github=0', { headers: { Authorization: 'Bearer ' + CRON } })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.health.ok).toBe(false)
    expect(body.health.emailed).toBe(false)
    expect(body.health.githubChecked).toBe(false)
    const errors = body.health.problems.find((p: { title: string }) => /server errors? in the last 24 hours/.test(p.title))
    expect(errors.level).toBe('critical')
    expect(errors.detail).toContain(marker + ' (21)')
    // Records older than 30 days are cleared by the same job
    expect((await db.from('error_log').select('id').eq('path', marker + '-old')).data).toHaveLength(0)
  } finally {
    await db.from('error_log').delete().like('path', marker + '%')
  }

  // Without those errors the same check is calm about errors
  const calm = await (await request.get('/api/cron/daily?send=0&github=0', { headers: { Authorization: 'Bearer ' + CRON } })).json()
  expect(calm.health.problems.some((p: { title: string }) => /server errors? in the last 24 hours/.test(p.title))).toBe(false)
})
