// Wide screens (RFC 0003 §10): host breakpoints and --ts-grid-max-width on a
// 2560px board, in real engines. The fixture sizes the wrapper with ?w=.
import { test, expect } from '@playwright/test'

const PAGE = '/test/browser/fixtures/grid.html'

let errors
test.beforeEach(async ({ page }) => {
  errors = []
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => {
  expect(errors).toEqual([])
})

const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
async function load(page, width) {
  await page.goto(`${PAGE}?mode=explicit&w=${width}`)
  await page.waitForFunction(() => window.__ready === true && document.getElementById('g').columns > 0)
  await settle(page)
}
const columns = (page) => page.evaluate(() => document.getElementById('g').columns)
const gridWidth = (page) => page.evaluate(() => document.getElementById('g').getBoundingClientRect().width)
// The S tile's rendered width, which is what a wide monitor stretches.
const sWidth = (page) => page.evaluate(() => document.querySelector('#g > [item="notes"]').getBoundingClientRect().width)

test.describe('a 2560px board', () => {
  test('without a cap it has 4 columns and stretched S tiles', async ({ page }) => {
    await load(page, 2560)
    expect(await columns(page)).toBe(4)
    expect(await gridWidth(page)).toBeGreaterThan(2400)
    expect(await sWidth(page)).toBeGreaterThan(500)
  })

  test('--ts-grid-max-width caps the board and centres it with ordinary tiles', async ({ page }) => {
    await load(page, 2560)
    await page.evaluate(() => document.getElementById('g').style.setProperty('--ts-grid-max-width', '1400px'))
    await settle(page)
    expect(await gridWidth(page)).toBeCloseTo(1400, 0)
    expect(await columns(page)).toBe(4)
    expect(await sWidth(page)).toBeLessThan(350)
    const gaps = await page.evaluate(() => {
      const g = document.getElementById('g').getBoundingClientRect()
      const wrap = document.getElementById('wrap').getBoundingClientRect()
      return { start: g.left - wrap.left, end: wrap.right - g.right }
    })
    // Centred in its wrapper: the space either side matches.
    expect(Math.abs(gaps.start - gaps.end)).toBeLessThan(1)
    expect(gaps.start).toBeGreaterThan(500)
    const fits = await page.evaluate(() => {
      const g = document.getElementById('g').getBoundingClientRect()
      return [...document.querySelectorAll('#g > [item]')].every((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.left >= g.left - 0.5 && r.right <= g.right + 0.5
      })
    })
    expect(fits).toBe(true)
  })

  test('the default token is none: it adds no cap', async ({ page }) => {
    await load(page, 1800)
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('g')).maxWidth)).toBe('none')
  })
})

test.describe('breakpoints', () => {
  test('default to 700 and 1200 and re-measure when set', async ({ page }) => {
    await load(page, 1300)
    expect(await page.evaluate(() => ({ ...document.getElementById('g').breakpoints }))).toEqual({ tablet: 700, desktop: 1200 })
    expect(await columns(page)).toBe(4)
    await page.evaluate(() => { document.getElementById('g').breakpoints = { desktop: 1600 } })
    await settle(page)
    expect(await columns(page)).toBe(3)
    await page.evaluate(() => { document.getElementById('g').breakpoints = { tablet: 1400, desktop: 1600 } })
    await settle(page)
    expect(await columns(page)).toBe(2)
    await page.evaluate(() => { document.getElementById('g').breakpoints = undefined })
    await settle(page)
    expect(await columns(page)).toBe(4)
  })

  test('a changed count fires ts-columns-change with the matching device', async ({ page }) => {
    await load(page, 1300)
    const seen = page.evaluate(() => new Promise((resolve) => {
      document.getElementById('g').addEventListener('ts-columns-change', (e) => resolve(e.detail), { once: true })
    }))
    await page.evaluate(() => { document.getElementById('g').breakpoints = { tablet: 1400, desktop: 1600 } })
    const detail = await seen
    expect(detail.columns).toBe(2)
    expect(detail.device).toBe('phone')
  })

  test('an invalid set is ignored and the defaults stay in force', async ({ page }) => {
    await load(page, 1300)
    // The one development warning is a warn, not an error, so the afterEach holds.
    await page.evaluate(() => { document.getElementById('g').breakpoints = { tablet: 2000, desktop: 1000 } })
    await settle(page)
    expect(await columns(page)).toBe(4)
  })

  test('host breakpoints and the cap work together on a 2560px board', async ({ page }) => {
    await load(page, 2560)
    await page.evaluate(() => {
      const g = document.getElementById('g')
      g.style.setProperty('--ts-grid-max-width', '1400px')
      g.breakpoints = { desktop: 1600 }
    })
    await settle(page)
    // 1400px is under the host's 1600px desktop threshold, so 3 columns.
    expect(await columns(page)).toBe(3)
    expect(await gridWidth(page)).toBeCloseTo(1400, 0)
  })
})
