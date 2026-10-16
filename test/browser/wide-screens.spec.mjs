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

  test('an invalid set is ignored with one warning, and the defaults stay in force', async ({ page }) => {
    const warnings = []
    page.on('console', (msg) => msg.type() === 'warning' && warnings.push(msg.text()))
    await load(page, 1300)
    await page.evaluate(() => { document.getElementById('g').breakpoints = { desktop: 1600 } })
    await settle(page)
    expect(await columns(page)).toBe(3)
    await page.evaluate(() => {
      window.__colEvents = 0
      document.getElementById('g').addEventListener('ts-columns-change', () => window.__colEvents++)
      document.getElementById('g').breakpoints = { tablet: 2000, desktop: 1000 }
    })
    await settle(page)
    // The invalid set puts the defaults back: 3 columns to 4, one change event.
    expect(await columns(page)).toBe(4)
    expect(await page.evaluate(() => window.__colEvents)).toBe(1)
    expect(await page.evaluate(() => ({ ...document.getElementById('g').breakpoints }))).toEqual({ tablet: 700, desktop: 1200 })
    expect(warnings.filter((w) => w.includes('breakpoints'))).toHaveLength(1)
  })

  test('the setter keeps a copy: mutating the original later changes nothing', async ({ page }) => {
    await load(page, 1300)
    const result = await page.evaluate(async () => {
      const g = document.getElementById('g')
      const mine = { desktop: 1600 }
      g.breakpoints = mine
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      mine.desktop = 800
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      return { columns: g.columns, bp: { ...g.breakpoints }, same: g.breakpoints === mine }
    })
    expect(result).toEqual({ columns: 3, bp: { desktop: 1600 }, same: false })
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

// Parents that used to collapse the grid: its tiles are absolutely positioned,
// so it has no width of its own, and auto margins switch off flex and grid stretch.
test.describe('inside other layouts', () => {
  const PARENTS = {
    block: 'display: block',
    'flex column': 'display: flex; flex-direction: column',
    'flex row': 'display: flex; flex-direction: row',
    grid: 'display: grid',
  }
  for (const [name, css] of Object.entries(PARENTS)) {
    test(`a ${name} parent: full width by default, capped and centred with the token`, async ({ page }) => {
      await load(page, 1600)
      await page.evaluate((c) => { document.getElementById('wrap').style.cssText = `width: 1600px; ${c}` }, css)
      await settle(page)
      expect(await gridWidth(page)).toBeCloseTo(1600, 0)
      expect(await columns(page)).toBe(4)
      await page.evaluate(() => document.getElementById('g').style.setProperty('--ts-grid-max-width', '1000px'))
      await settle(page)
      expect(await gridWidth(page)).toBeCloseTo(1000, 0)
      const sides = await page.evaluate(() => {
        const g = document.getElementById('g').getBoundingClientRect()
        const w = document.getElementById('wrap').getBoundingClientRect()
        return [g.left - w.left, w.right - g.right]
      })
      expect(Math.abs(sides[0] - sides[1])).toBeLessThan(1)
      expect(sides[0]).toBeGreaterThan(250)
    })
  }

  test('right-to-left: a capped board is still centred', async ({ page }) => {
    await load(page, 1600)
    await page.evaluate(() => {
      document.documentElement.dir = 'rtl'
      document.getElementById('g').style.setProperty('--ts-grid-max-width', '1000px')
    })
    await settle(page)
    const sides = await page.evaluate(() => {
      const g = document.getElementById('g').getBoundingClientRect()
      const w = document.getElementById('wrap').getBoundingClientRect()
      return [g.left - w.left, w.right - g.right]
    })
    expect(Math.abs(sides[0] - sides[1])).toBeLessThan(1)
    // 1000px is under the 1200px desktop threshold.
    expect(await columns(page)).toBe(3)
  })

  test('max-inline-size set on the host beats the token', async ({ page }) => {
    await load(page, 1600)
    await page.evaluate(() => {
      const g = document.getElementById('g')
      g.style.setProperty('--ts-grid-max-width', '1000px')
      g.style.maxInlineSize = '800px'
    })
    await settle(page)
    expect(await gridWidth(page)).toBeCloseTo(800, 0)
  })
})

// A real 2560px viewport, with edit chrome, drag and resize on the capped board.
test.describe('a 2560px viewport, capped', () => {
  async function wide(page) {
    await page.setViewportSize({ width: 2560, height: 1000 })
    await page.goto(`${PAGE}?mode=explicit`)
    await page.waitForFunction(() => window.__ready === true && document.getElementById('g').columns > 0)
    await page.evaluate(() => {
      document.getElementById('g').style.setProperty('--ts-grid-max-width', '1400px')
      document.getElementById('g').editing = true
    })
    await settle(page)
  }
  const center = async (locator) => {
    const b = await locator.boundingBox()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }

  test('the board is 1400px wide, centred, with edit chrome inside it', async ({ page }) => {
    await wide(page)
    expect(await gridWidth(page)).toBeCloseTo(1400, 0)
    expect(await columns(page)).toBe(4)
    const box = await page.locator('#g').boundingBox()
    expect(Math.abs(box.x - (2560 - box.x - box.width))).toBeLessThan(20)
    const handle = await page.locator('ts-grid .chrome[data-id="tasks"] .handle').boundingBox()
    expect(handle.x).toBeGreaterThan(box.x)
    expect(handle.x + handle.width).toBeLessThanOrEqual(box.x + box.width)
  })

  test('dragging a tile moves it at the capped width', async ({ page }) => {
    await wide(page)
    const from = await center(page.locator('ts-grid .chrome[data-id="tasks"] .handle'))
    const to = await center(page.locator('#g > [item="notes"]'))
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x - 20, to.y, { steps: 12 })
    await page.waitForTimeout(300)
    await page.mouse.up()
    await settle(page)
    const moves = await page.evaluate(() => window.__events.filter((e) => e.type === 'ts-layout-change' && e.reason === 'move'))
    expect(moves).toHaveLength(1)
  })

  test('resizing a tile works at the capped width', async ({ page }) => {
    await wide(page)
    const resize = page.locator('ts-grid .chrome[data-id="notes"] .resize')
    const c = await center(resize)
    await page.mouse.move(c.x, c.y)
    await page.mouse.down()
    await page.mouse.move(c.x + 250, c.y, { steps: 10 })
    await page.waitForTimeout(200)
    await page.mouse.up()
    await settle(page)
    const resizes = await page.evaluate(() => window.__events.filter((e) => e.type === 'ts-layout-change' && e.reason === 'resize'))
    expect(resizes.length).toBeGreaterThan(0)
  })
})
