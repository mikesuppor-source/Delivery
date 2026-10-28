import { defineConfig, devices } from 'playwright/test'

// Browser tests run against a LOCAL Supabase seeded by scripts/seed-local.mjs:
//   npx supabase start && node scripts/seed-local.mjs && npm run test:e2e
// Locally they reuse a running `npm run dev`; CI builds and starts the app.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  // PLAYWRIGHT_CHANNEL=chrome uses the installed Google Chrome instead of Playwright's own Chromium
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL || undefined } }],
  webServer: {
    command: process.env.CI ? 'npm run build && npm run start' : 'npm run dev',
    url: 'http://localhost:3000/login',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
})
