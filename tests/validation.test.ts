import { test } from 'node:test'
import assert from 'node:assert/strict'
import { flag, id, idList, ilikeAny, money, optionalId, parseBody, searchTerm, serviceType, text, requiredText, weightKg, z } from '../lib/validation'

const ok = <S extends z.ZodType>(schema: S, value: unknown) => schema.parse(value)
const bad = (schema: z.ZodType, value: unknown) => assert.equal(schema.safeParse(value).success, false, JSON.stringify(value))

test('money accepts numbers and numeric strings, rounds to cents, and rejects the rest', () => {
  assert.equal(ok(money(), 12.345), 12.35)
  assert.equal(ok(money(), '7.5'), 7.5)
  assert.equal(ok(money(), ''), 0)
  assert.equal(ok(money(89500), undefined), 89500)
  for (const value of [-1, 'abc', 100000000, Infinity, {}]) bad(money(), value)
})

test('text trims and caps length; required text must not be blank', () => {
  assert.equal(ok(text(10), '  hi  '), 'hi')
  assert.equal(ok(text(5), null), '')
  bad(text(5), 'too long')
  assert.equal(ok(requiredText(10), ' x '), 'x')
  bad(requiredText(10), '   ')
  bad(requiredText(10), undefined)
})

test('ids, id lists and optional ids', () => {
  const a = '00000000-0000-4000-8000-000000000001'
  assert.equal(ok(id, a), a)
  bad(id, 'not-an-id')
  assert.deepEqual(ok(idList, [a, a]), [a])
  bad(idList, [])
  bad(idList, Array(201).fill(a))
  assert.equal(ok(optionalId, ''), null)
  assert.equal(ok(optionalId, undefined), null)
  bad(optionalId, 'x')
})

test('service type and weight fall back safely', () => {
  assert.equal(ok(serviceType, 'pickup'), 'pickup')
  assert.equal(ok(serviceType, 'anything'), 'delivery')
  assert.equal(ok(weightKg, ''), undefined)
  assert.equal(ok(weightKg, '-3'), 0)
  assert.equal(ok(weightKg, '2.5'), 2.5)
})

test('optional fields may be left out of the request entirely', () => {
  // Forms omit fields they do not show; a missing key must behave like an empty one
  const schema = z.object({ amount: money(), rate: money(89500), driverId: optionalId, note: text(10), type: serviceType, weight: weightKg, fragile: flag })
  const parsed = ok(schema, {})
  assert.equal(parsed.weight, undefined)
  assert.deepEqual({ ...parsed, weight: undefined }, { amount: 0, rate: 89500, driverId: null, note: '', type: 'delivery', weight: undefined, fragile: false })
})

test('search text keeps punctuation but is capped and tidied', () => {
  assert.equal(searchTerm('  Hamra,   Beirut  '), 'Hamra, Beirut')
  assert.equal(searchTerm(null), '')
  assert.equal(searchTerm('x'.repeat(500)).length, 100)
})

test('ilikeAny quotes the search so it cannot add filter conditions', () => {
  assert.equal(ilikeAny(['name'], 'Hamra, Beirut'), 'name.ilike."%Hamra, Beirut%"')
  assert.equal(ilikeAny(['a', 'b'], 'x'), 'a.ilike."%x%",b.ilike."%x%"')
  // Quotes and backslashes are escaped, so the value cannot close its quotes early
  assert.equal(ilikeAny(['name'], 'say "hi" \\ bye'), 'name.ilike."%say \\"hi\\" \\\\ bye%"')
  assert.equal(ilikeAny(['name'], 'x",status.eq.delivered,name.ilike."y'), 'name.ilike."%x\\",status.eq.delivered,name.ilike.\\"y%"')
})

test('parseBody turns the first problem into a 400 naming the field', async () => {
  const schema = z.object({ workspaceId: id, amountUsd: money() })
  const request = (body: unknown) => new Request('http://local/api', { method: 'POST', body: JSON.stringify(body) })
  assert.deepEqual(await parseBody(request({ workspaceId: '00000000-0000-4000-8000-000000000001', amountUsd: '5' }), schema), {
    workspaceId: '00000000-0000-4000-8000-000000000001',
    amountUsd: 5,
  })
  await assert.rejects(parseBody(request({ workspaceId: 'nope' }), schema), (error: { status: number; message: string }) => {
    assert.equal(error.status, 400)
    assert.equal(error.message, 'Invalid workspaceId')
    return true
  })
})
