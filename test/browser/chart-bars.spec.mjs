// <ts-chart> bars and categories (RFC 0003 §15) in real engines: bars drawn from the zero line with negatives below it,
// category labels that truncate and thin out without leaving the tile, six series colours, values as text, point selection
// with its roving tab stop on bars, and no overflow at phone widths, in light, dark, a monospace preset and with wide fonts.
import { test, expect } from '@playwright/test'

const PAGE = '/test/browser/fixtures/chart-bars.html'

test.beforeEach(async ({ page }) => {
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
})

async function open(page, query = '') {
  await page.goto(`${PAGE}?${query}`)
  await page.waitForFunction(() => window.__ready === true)
  await page.evaluate(() => window.__c.nextFrame())
}

const read = (page) =>
  page.evaluate(() => {
    const root = window.__c.el.shadowRoot
    const tile = window.__c.el.getBoundingClientRect()
    const cats = [...root.querySelectorAll('[data-k="cats"] span')]
    return {
      bars: [...root.querySelectorAll('.sb')].map((p) => p.getAttribute('d')),
      zero: root.querySelector('[data-k="zero"]').getAttribute('d'),
      cats: cats.map((c) => c.textContent),
      catBoxes: cats.map((c) => { const r = c.getBoundingClientRect(); return { l: r.left, r: r.right, w: r.width } }),
      catsOverflow: cats.map((c) => c.scrollWidth > c.clientWidth + 1),
      tile: { l: tile.left, r: tile.right },
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      scrollOverflow: window.__c.el.scrollWidth > window.__c.el.clientWidth + 1,
      vals: [...root.querySelectorAll('[data-k="vals"] li')].map((li) => li.textContent),
      valsHidden: root.querySelector('[data-k="vals"]').hasAttribute('hidden'),
      svgLabel: root.querySelector('[data-k="svg"]').getAttribute('aria-label'),
      sw: [...root.querySelectorAll('.legend .sw')].map((s) => s.getAttribute('class')),
      fills: [1, 2, 3].map((i) => getComputedStyle(root.querySelector(`[data-k="b${i}"]`)).fill),
    }
  })

test.describe('bars on a category axis', () => {
  test('are drawn from the zero line, and a loss goes below it', async ({ page }) => {
    await open(page, 'size=M&n=6')
    const r = await read(page)
    expect(r.cats).toEqual(['January', 'February', 'March', 'April', 'May', 'June'])
    const zeroY = Number(/M0 ([\d.]+)H/.exec(r.zero)[1])
    const tops = [...r.bars[0].matchAll(/V(-?[\d.]+)H/g)].map((m) => Number(m[1]))
    expect(tops).toHaveLength(6)
    expect(tops[0]).toBeLessThan(zeroY)
    expect(tops[1]).toBeGreaterThan(zeroY)
    expect(r.bars[1]).toMatch(/^M/)
  })

  test('carry their values as text, with a true minus', async ({ page }) => {
    await open(page, 'size=M&n=3')
    const r = await read(page)
    expect(r.valsHidden).toBe(false)
    expect(r.vals).toContain('Profit: February, −$410.00')
    expect(r.vals.length).toBe(6)
    expect(r.svgLabel).toContain('Profit, last')
  })

  test('are told from lines by swatch shape and by their own colour tokens', async ({ page }) => {
    await open(page, 'size=M&n=3')
    const r = await read(page)
    expect(r.sw[0]).toContain('bar')
    expect(r.sw[2]).not.toContain('bar')
    expect(new Set(r.fills.slice(0, 2)).size).toBe(2)
  })

  test('truncate long labels with an ellipsis and thin out when crowded, keeping the first and the last', async ({ page }) => {
    await open(page, 'size=M&n=12&long&width=340')
    const r = await read(page)
    expect(r.cats.length).toBeLessThan(12)
    expect(r.cats[0]).toContain('January')
    expect(r.cats[r.cats.length - 1]).toContain('quarter 12')
    for (const b of r.catBoxes) {
      expect(b.l).toBeGreaterThanOrEqual(r.tile.l - 1)
      expect(b.r).toBeLessThanOrEqual(r.tile.r + 1)
    }
    for (let i = 1; i < r.catBoxes.length; i++) expect(r.catBoxes[i].l).toBeGreaterThanOrEqual(r.catBoxes[i - 1].r - 1)
    expect(r.catsOverflow.some(Boolean)).toBe(true)
  })

  test('more data re-lays the labels, and a resize re-thins them', async ({ page }) => {
    await open(page, 'size=M&n=4&width=600')
    expect((await read(page)).cats).toHaveLength(4)
    await page.evaluate(() => window.__c.set(30))
    await page.evaluate(() => window.__c.nextFrame())
    const wide = (await read(page)).cats.length
    expect(wide).toBeLessThan(30)
    await page.evaluate(() => window.__c.width(300))
    await page.waitForTimeout(100)
    expect((await read(page)).cats.length).toBeLessThanOrEqual(wide)
  })
})

test.describe('time and number axes take bars too', () => {
  for (const axis of ['time', 'number']) {
    test(`${axis}: bars at the positions given and no category row`, async ({ page }) => {
      await open(page, `size=L&n=8&axis=${axis}`)
      const r = await read(page)
      expect(r.cats).toEqual([])
      expect([...r.bars[0].matchAll(/M/g)]).toHaveLength(8)
    })
  }
})

test.describe('selection', () => {
  test('every bar is a button named with its value, one tab stop, and arrows move between them', async ({ page }) => {
    await open(page, 'size=M&n=3&select')
    const info = await page.evaluate(() => {
      const root = window.__c.el.shadowRoot
      return { labels: [...root.querySelectorAll('.pt')].map((b) => b.getAttribute('aria-label')), tabs: [...root.querySelectorAll('.pt')].map((b) => b.getAttribute('tabindex')), valsHidden: root.querySelector('[data-k="vals"]').hasAttribute('hidden') }
    })
    expect(info.labels).toContain('Profit: February, −$410.00')
    expect(info.tabs.filter((t) => t === '0')).toHaveLength(1)
    // The values are spoken by the buttons, so the list is not repeated beside them.
    expect(info.valsHidden).toBe(true)
    await page.evaluate(() => window.__c.el.shadowRoot.querySelector('.pt').focus())
    await page.keyboard.press('ArrowDown')
    expect(await page.evaluate(() => window.__c.el.shadowRoot.activeElement.getAttribute('aria-label'))).toContain('Costs: January')
    await page.keyboard.press('Enter')
    const ev = await page.evaluate(() => window.__c.events)
    expect(ev[0]).toMatchObject({ action: 'select', value: 'January', series: 'Costs', index: 0 })
    expect(ev[0].y).toBe(300)
  })

  test('the buttons come back after a size change', async ({ page }) => {
    await open(page, 'size=M&n=3&select')
    await page.evaluate(() => window.__c.el.setAttribute('size', 'L'))
    await page.evaluate(() => window.__c.nextFrame())
    expect(await page.evaluate(() => window.__c.el.shadowRoot.querySelectorAll('.pt').length)).toBe(9)
  })
})

test.describe('six series', () => {
  test('use --ts-series-1 to 6', async ({ page }) => {
    await open(page, 'size=M')
    const fills = await page.evaluate(() => {
      const root = window.__c.el.shadowRoot
      window.__c.el.data = { xType: 'number', series: Array.from({ length: 7 }, (_, i) => ({ name: `s${i}`, points: [{ x: 1, y: i }, { x: 2, y: i + 1 }] })) }
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve([1, 2, 3, 4, 5, 6].map((i) => getComputedStyle(root.querySelector(`[data-k="l${i}"]`)).stroke)))))
    })
    expect(new Set(fills).size).toBe(6)
    const shown = await page.evaluate(() => [...window.__c.el.shadowRoot.querySelectorAll('.legend .li')].filter((l) => !l.hasAttribute('hidden')).length)
    expect(shown).toBe(6)
  })
})

test.describe('layout', () => {
  for (const size of ['Wide', 'M', 'L', 'XL']) {
    for (const width of [300, 360, 640]) {
      for (const [theme, preset] of [['light', ''], ['dark', ''], ['light', 'terminal']]) {
        test(`${size} at ${width}px in ${theme}${preset ? ` with ${preset}` : ''}, with wide fonts: inside the tile, no sideways scroll`, async ({ page }) => {
          await open(page, `size=${size}&n=9&long&width=${width}&theme=${theme}&fit&wide${preset ? `&preset=${preset}` : ''}`)
          const r = await read(page)
          expect(r.pageOverflow).toBe(false)
          expect(r.scrollOverflow).toBe(false)
          for (const b of r.catBoxes) {
            expect(b.l).toBeGreaterThanOrEqual(r.tile.l - 1)
            expect(b.r).toBeLessThanOrEqual(r.tile.r + 1)
          }
        })
      }
    }
  }
})

// ── Review fixes: close x values, hit areas, forced-colours cues, reading order ─────────────────────────────────────

const pointer = async (page, x, y) => {
  // The mobile projects tap, the others click with a real mouse.
  if (test.info().project.use.hasTouch) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
}

// The middle of the nth bar button, in page coordinates.
const barCentre = (page, n) =>
  page.evaluate((i) => {
    const r = [...window.__c.el.shadowRoot.querySelectorAll('.pt.bar')][i].getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }
  }, n)

test.describe('bars as targets', () => {
  test('a click or tap on the middle of a tall bar selects it', async ({ page }) => {
    await open(page, 'size=L&n=3&select&width=640')
    // Band-major order: 0 is Profit January, 1 is Costs January.
    const c = await barCentre(page, 0)
    expect(c.h).toBeGreaterThan(40)
    expect(c.w).toBeGreaterThanOrEqual(24)
    await pointer(page, c.x, c.y)
    const ev = await page.evaluate(() => window.__c.events)
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ action: 'select', series: 'Profit', value: 'January', index: 0 })
  })

  test('a thin bar among 150 resolves to the nearest bar, by click or tap', async ({ page }) => {
    await open(page, 'size=XL&n=150&select&width=700')
    const total = await page.evaluate(() => window.__c.el.shadowRoot.querySelectorAll('.pt.bar').length)
    expect(total).toBe(300)
    // Band-major: 2 * 75 is Profit in the 76th band.
    const c = await barCentre(page, 150)
    // Near the base, away from the target line's own dots.
    await pointer(page, c.x, c.y + c.h / 2 - 4)
    const ev = await page.evaluate(() => window.__c.events)
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ series: 'Profit', index: 75 })
  })
})

test.describe('close x values', () => {
  test('a point a minute after another does not collapse a daily chart', async ({ page }) => {
    await open(page, 'size=L&axis=time&n=3')
    const widths = await page.evaluate(() => {
      const day = 86400000
      const pts = Array.from({ length: 365 }, (_, i) => ({ x: Date.UTC(2026, 0, 1) + i * day, y: 100 + (i % 9) }))
      pts.push({ x: pts[1].x + 60000, y: 50 })
      window.__c.setData({ xType: 'time', series: [{ name: 'Sales', kind: 'bar', points: pts }] })
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
        const d = window.__c.el.shadowRoot.querySelector('.sb.c-1').getAttribute('d')
        resolve([...d.matchAll(/M(-?[\d.]+) -?[\d.]+V-?[\d.]+H(-?[\d.]+)V/g)].map((m) => Number(m[2]) - Number(m[1])))
      })))
    })
    expect(widths).toHaveLength(366)
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(1)
  })

  test('x values 0, 1e-9 and 1e9 on a number axis draw and do not throw', async ({ page }) => {
    await open(page, 'size=M&n=3')
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    const info = await page.evaluate(() => {
      window.__c.setData({ xType: 'number', series: [{ name: 'a', kind: 'bar', points: [{ x: 0, y: 1 }, { x: 1e-9, y: 2 }, { x: 1e9, y: 3 }] }] })
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
        const root = window.__c.el.shadowRoot
        resolve({ d: root.querySelector('.sb.c-1').getAttribute('d'), failed: !!root.querySelector('[part~="error"]') })
      })))
    })
    expect(errors).toEqual([])
    expect(info.failed).toBe(false)
    expect([...info.d.matchAll(/M/g)]).toHaveLength(3)
  })
})

test.describe('reading order', () => {
  test('grouped bars are walked band by band with the arrow keys', async ({ page, browserName }) => {
    test.skip(!!test.info().project.use.hasTouch, 'keyboard')
    await open(page, 'size=M&n=3&select')
    await page.evaluate(() => window.__c.el.shadowRoot.querySelector('.pt').focus())
    const seen = []
    for (let i = 0; i < 4; i++) {
      seen.push(await page.evaluate(() => window.__c.el.shadowRoot.activeElement.getAttribute('aria-label').split(',')[0]))
      await page.keyboard.press('ArrowDown')
    }
    expect(seen).toEqual(['Profit: January', 'Costs: January', 'Target: January', 'Profit: February'])
  })
})

test.describe('forced colours', () => {
  test('six grouped bars and their swatches keep distinguishable cues', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'forced-colors emulation is Chromium-only')
    await page.emulateMedia({ forcedColors: 'active' })
    await open(page, 'size=M&n=3')
    const cues = await page.evaluate(() => {
      window.__c.setData({ xType: 'category', series: Array.from({ length: 6 }, (_, i) => ({ name: `S${i + 1}`, kind: 'bar', points: [{ x: 'a', y: i + 1 }, { x: 'b', y: 2 }] })) })
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
        const root = window.__c.el.shadowRoot
        resolve({
          bars: [1, 2, 3, 4, 5, 6].map((n) => { const s = getComputedStyle(root.querySelector(`.sb.c-${n}`)); return `${s.strokeWidth}|${s.strokeDasharray}` }),
          swatches: [...root.querySelectorAll('.legend .sw')].map((el) => { const s = getComputedStyle(el); return `${s.borderTopWidth}|${s.borderTopStyle}` }),
        })
      })))
    })
    expect(new Set(cues.bars).size).toBe(6)
    expect(cues.swatches).toHaveLength(6)
    expect(new Set(cues.swatches).size).toBe(6)
  })
})
