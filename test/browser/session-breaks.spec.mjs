// The session clock during a lunch break (RFC 0004 §5.2), on a page under the strict policy:
//   Content-Security-Policy: default-src 'self'; style-src 'self'; script-src 'self'
// so the gap, built with the DOM and placed through element.style, must raise no violation.
import { test, expect } from '@playwright/test'

const PAGE = '/test/browser/fixtures/csp.html'
const STRICT = "default-src 'self'; style-src 'self'; script-src 'self'"
const SHOTS = process.env.TICKSLATE_SHOTS || ''

let violations
let errors

test.beforeEach(async ({ page }) => {
  violations = []
  errors = []
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    window.__violations = []
    document.addEventListener('securitypolicyviolation', (e) => window.__violations.push(`${e.violatedDirective} ${e.blockedURI}`))
  })
  await page.route('**/@vite/client', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export {}' }))
  await page.route('**/test/browser/fixtures/csp.html*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': STRICT } })
  })
})

test.afterEach(async ({ page }) => {
  violations = (await page.evaluate(() => window.__violations).catch(() => [])) || []
  expect(violations).toEqual([])
  expect(errors).toEqual([])
})

/** Puts a Tokyo S clock and a Banner (Tokyo and an always-open session) on the page, frozen at `hhmm` on Monday 26 Oct 2026. */
async function draw(page, hhmm, width = 1100) {
  await page.setViewportSize({ width, height: 700 })
  await page.goto(PAGE)
  await page.evaluate(
    async ({ hhmm }) => {
      const { createCalendar, presets, zonedTime } = await import('/src/core/index.js')
      await customElements.whenDefined('ts-session-clock')
      const calendar = createCalendar({
        sessions: [presets.tse(), { id: 'always', label: 'Crypto', timeZone: 'UTC', days: [1, 2, 3, 4, 5, 6, 7], open: '00:00', close: '00:00' }],
        now: Date.UTC(2026, 9, 26),
      })
      document.body.replaceChildren()
      const host = document.createElement('div')
      host.id = 'host'
      host.style.cssText = 'display:grid;gap:12px;padding:12px;grid-template-columns:240px 1fr;align-items:start'
      for (const [id, size, sessions] of [
        ['s', 'S', ['tse']],
        ['banner', 'Banner', ['tse', 'always']],
        ['s247', 'S', ['always']],
      ]) {
        const el = document.createElement('ts-session-clock')
        el.id = id
        el.setAttribute('size', size)
        el.setAttribute('label', 'Sessions')
        el.style.cssText = size === 'S' ? 'height:170px' : 'grid-column:2;height:150px'
        el.clock = () => zonedTime('2026-10-26', hhmm, 'Asia/Tokyo')
        el.data = { calendar, sessions, timeframes: [15, 60] }
        host.append(el)
      }
      document.body.append(host)
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    },
    { hhmm },
  )
}

const read = (page) =>
  page.evaluate(() => {
    const q = (id, sel) => document.getElementById(id).shadowRoot.querySelector(sel)
    const gaps = (id) => [...document.getElementById(id).shadowRoot.querySelectorAll('.gp')].map((g) => [g.style.getPropertyValue('inset-inline-start'), g.style.width])
    return {
      sTitle: q('s', '.tf').textContent,
      sMiddle: q('s', '.mf').textContent,
      sGaps: gaps('s'),
      sName: document.getElementById('s').shadowRoot.querySelector('[role="group"], .tile').getAttribute('aria-label'),
      bannerGaps: gaps('banner'),
      lane0: [...document.getElementById('banner').shadowRoot.querySelectorAll('.lane')][0].querySelector('.lr').textContent,
      lane0sub: [...document.getElementById('banner').shadowRoot.querySelectorAll('.lane')][0].querySelector('.lr2').textContent,
      lane1: [...document.getElementById('banner').shadowRoot.querySelectorAll('.lane')][1].querySelector('.lr').textContent,
      s247: document.getElementById('s247').shadowRoot.querySelector('.mf').textContent,
    }
  })

test('during the lunch break the clock reads Break and resumes, and the gap is drawn', async ({ page }) => {
  await draw(page, '12:00')
  const r = await read(page)
  expect(r.sTitle).toBe('Break')
  expect(r.sMiddle).toBe('resumes 12:30')
  expect(r.sGaps).toEqual([['38.462%', '15.385%']])
  expect(r.bannerGaps).toEqual([['38.462%', '15.385%'], ['', '']].slice(0, 1))
  expect(r.lane0).toBe('Break')
  expect(r.lane0sub).toBe('resumes 12:30')
  expect(r.lane1).toBe('Open 24/7')
  expect(r.s247).toBe('Open 24/7')
  expect(r.sName).toContain('on break')
  if (SHOTS) await page.locator('#host').screenshot({ path: `${SHOTS}/break-${test.info().project.name}.png` })
})

test('before the break the countdown is to the break, and after it to the close', async ({ page }) => {
  await draw(page, '10:30')
  expect((await read(page)).sMiddle).toBe('1h to break')
  expect((await read(page)).lane0sub).toBe('')
  await draw(page, '13:30')
  expect((await read(page)).sMiddle).toBe('2h to close')
})

test('the gap is a real gap: it hides the fill and the rail beneath it', async ({ page }) => {
  await draw(page, '14:00')
  const covered = await page.evaluate(() => {
    const root = document.getElementById('s').shadowRoot
    const gap = root.querySelector('.gp')
    const style = getComputedStyle(gap)
    const track = root.querySelector('.trk')
    const t = track.getBoundingClientRect()
    const g = gap.getBoundingClientRect()
    return { position: style.position, bg: style.backgroundColor !== 'rgba(0, 0, 0, 0)', inside: g.left >= t.left - 1 && g.right <= t.right + 1, width: g.width > 4 }
  })
  expect(covered).toEqual({ position: 'absolute', bg: true, inside: true, width: true })
})

// For looking at: TICKSLATE_SHOTS=<dir> writes a picture per width and theme.
test('pictures of the break, the countdown and a 24/7 session', async ({ page }) => {
  test.skip(!SHOTS, 'set TICKSLATE_SHOTS to a directory to write them')
  for (const width of [1100, 390]) {
    for (const theme of ['light', 'dark']) {
      for (const hhmm of ['10:30', '12:00', '14:00']) {
        await draw(page, hhmm, width)
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
        await page.evaluate(() => {
          document.getElementById('host').style.gridTemplateColumns = innerWidth < 600 ? '1fr' : '240px 1fr'
          for (const el of document.querySelectorAll('ts-session-clock[size="Banner"]')) el.style.gridColumn = innerWidth < 600 ? '1' : '2'
        })
        await page.waitForTimeout(150)
        await page.locator('#host').screenshot({ path: `${SHOTS}/clock-${width}-${theme}-${hhmm.replace(':', '')}.png` })
      }
    }
  }
})
