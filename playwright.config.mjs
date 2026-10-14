import { defineConfig, devices } from '@playwright/test'

// Browser tests (RFC 0002 §5, story browser-tests). They run only through
// `npm run test:browser`; `npm test` stays install-free under node --test.
// Vite gets its own port so these never meet a dev server left running on 5173.
const PORT = 5174
const BASE = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './test/browser',
  testMatch: '**/*.spec.mjs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Under node_modules so git ignores traces and the report without a .gitignore entry.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'node_modules/.playwright/report' }]] : 'list',
  outputDir: 'node_modules/.playwright/results',
  use: {
    baseURL: BASE,
    // Traces are kept for a failure only: the suite is large and a green run needs none.
    trace: 'retain-on-failure',
    // Motion off, so a lifted tile or a sliding toast has settled when it is read.
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  },
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `${BASE}/test/browser/fixtures/widgets.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
})
