import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The middleware lets a request with ANY value in the courier cookie reach these routes (it cannot check the signature on the edge).
// So each route must check the courier session or the sign-in itself, before it uses the all-access database client.
// The browser tests in tests/e2e/courier-routes-access.spec.ts prove the behaviour; this keeps a check from being removed by accident.
const ROUTES: Record<string, RegExp> = {
  'app/api/orders/attempts/route.ts': /orderCourierAccess\(/,
  'app/api/orders/route/route.ts': /driverAccess\(/,
  'app/api/pickups/route.ts': /callerOf\(|driverAccess\(|shopAccess\(|workspaceAccess\(/,
  'app/api/orders/returns-handover/route.ts': /callerOf\(|shopAccess\(|workspaceAccess\(/,
}

test('every route the courier cookie opens checks who is calling', () => {
  const middleware = readFileSync('middleware.ts', 'utf8')
  for (const route of ['/api/pickups', '/api/orders/attempts', '/api/orders/route', '/api/orders/returns-handover']) {
    assert.ok(middleware.includes(`'${route}'`), `${route} is no longer in the middleware's courier list: update this test`)
  }
  for (const [file, check] of Object.entries(ROUTES)) {
    const source = readFileSync(file, 'utf8')
    assert.match(source, check, `${file} must check the caller before using the database`)
    assert.doesNotMatch(source, /createServiceClient\(\)/, `${file} must get its database client from a caller check, not create its own`)
  }
})

test('the courier session is verified, never just looked for', () => {
  const access = readFileSync('lib/access.ts', 'utf8')
  assert.match(access, /verifyDriverSession\(/, 'sessionDriverId must verify the signature')
  assert.match(access, /session_version/, 'a courier session must be checked against the current version')
  const middleware = readFileSync('middleware.ts', 'utf8')
  assert.match(middleware, /hasDriverSession/, 'the middleware cookie check exists, which is why the routes must verify it')
})
