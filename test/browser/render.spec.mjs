// Every registered widget, at every size it supports, in both themes: the box
// the design promises, no errors, and the same box whatever the data does.
import { test, expect } from '@playwright/test'
import { WIDGETS, SIZES } from '../../src/core/index.js'

// Which tags the library defines, found by importing the entry against a
// stand-in registry. The core lists finance widgets whose elements are not
// built yet (their tags are in WIDGETS, but nothing defines them), and those
// have nothing to render, so the specs follow the registrations, not the list.
const defined = new Set()
globalThis.customElements = { get: () => undefined, define: (tag) => defined.add(tag) }
await import('../../src/elements/index.js')
delete globalThis.customElements

const KEYS = Object.entries(WIDGETS).filter(([, spec]) => defined.has(spec.tag)).map(([key]) => key)
const THEMES = ['light', 'dark']
const PAGE = '/test/browser/fixtures/widgets.html'

// Network off: anything that is not the dev server is refused, and a refused
// request is logged as an error, so a stray font or script fails the spec.
function guard(page, errors) {
  page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (error) => errors.push(error.message))
}

async function open(page, theme, query = '') {
  await page.goto(`${PAGE}?theme=${theme}${query}`)
  await page.waitForFunction(() => window.__ready === true)
  await page.evaluate(() => window.__fx.nextFrame())
}

// The pixel height a size must have: rows x --ts-row plus the gaps between rows.
async function expectedHeights(page) {
  return page.evaluate(({ sizes }) => {
    const root = getComputedStyle(document.querySelector('main'))
    const row = parseFloat(root.getPropertyValue('--ts-row'))
    const gap = parseFloat(root.getPropertyValue('--ts-gap'))
    return Object.fromEntries(Object.entries(sizes).map(([name, s]) => [name, s.rows * row + (s.rows - 1) * gap]))
  }, { sizes: SIZES })
}

test.describe('every widget, every size', () => {
  test('the registrations include the generic widgets', () => {
    expect(KEYS).toEqual(expect.arrayContaining(['card', 'metric', 'chart']))
  })

  for (const key of KEYS) {
    for (const theme of THEMES) {
      test(`${key} in ${theme}: box equals rows x row + gaps, no errors`, async ({ page }) => {
        const errors = []
        guard(page, errors)
        await open(page, theme)
        const heights = await expectedHeights(page)
        const tiles = await page.evaluate((k) => {
          const e = window.__fx.entries.find((x) => x.key === k)
          return e.sizes.map((size) => ({ size, ...window.__fx.box(window.__fx.tiles.get(`${k}:${size}`)) }))
        }, key)
        expect(tiles.length).toBeGreaterThan(0)
        for (const tile of tiles) {
          expect(Math.abs(tile.h - heights[tile.size]), `${key} ${tile.size} is ${tile.h}px tall, wanted ${heights[tile.size]}`).toBeLessThanOrEqual(0.5)
          expect(tile.w, `${key} ${tile.size} has a width`).toBeGreaterThan(0)
        }
        expect(errors).toEqual([])
      })
    }
  }
})

test.describe('the box never depends on the data', () => {
  for (const key of KEYS) {
    test(`${key}: 100 data sets from 0 to +-1e12 leave every box alone`, async ({ page }) => {
      const errors = []
      guard(page, errors)
      await open(page, 'light')
      const result = await page.evaluate(async (k) => {
        const fx = window.__fx
        const entry = fx.entries.find((e) => e.key === k)
        const tiles = entry.sizes.map((size) => fx.tiles.get(`${k}:${size}`))
        const before = tiles.map((el) => fx.box(el))
        // A seeded walk over magnitudes, so the values span 0 to 1e12 in both signs.
        let a = 12345
        const rng = () => {
          a = (a + 0x6d2b79f5) | 0
          let t = Math.imul(a ^ (a >>> 15), 1 | a)
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        }
        const values = [0, 1e12, -1e12]
        while (values.length < 100) values.push((rng() < 0.5 ? -1 : 1) * Math.pow(10, rng() * 12))
        const moved = []
        // What each set drew, to show the data reached the tile and the test isn't comparing a blank.
        const drawn = new Set()
        for (const scale of values) {
          for (const el of tiles) fx.setMode(el, 'data', scale)
          await fx.nextFrame()
          drawn.add(tiles[0].shadowRoot.textContent + tiles[0].shadowRoot.innerHTML.length)
          tiles.forEach((el, i) => {
            const now = fx.box(el)
            if (Math.abs(now.w - before[i].w) > 0.01 || Math.abs(now.h - before[i].h) > 0.01) moved.push({ size: entry.sizes[i], scale, before: before[i], now })
          })
        }
        return { moved, count: values.length, drawn: drawn.size }
      }, key)
      expect(result.count).toBe(100)
      expect(result.moved).toEqual([])
      // The card and the clock show nothing of the figures they are given.
      if (!['card', 'sessionClock'].includes(key)) expect(result.drawn).toBeGreaterThan(10)
      expect(errors).toEqual([])
    })

    test(`${key}: skeleton, empty and error views keep the box`, async ({ page }) => {
      const errors = []
      guard(page, errors)
      await open(page, 'dark')
      const moved = await page.evaluate(async (k) => {
        const fx = window.__fx
        const entry = fx.entries.find((e) => e.key === k)
        const tiles = entry.sizes.map((size) => fx.tiles.get(`${k}:${size}`))
        const before = tiles.map((el) => fx.box(el))
        const out = []
        for (const mode of ['loading', 'empty', 'error', 'data']) {
          for (const el of tiles) fx.setMode(el, mode)
          await fx.nextFrame()
          tiles.forEach((el, i) => {
            const now = fx.box(el)
            if (Math.abs(now.w - before[i].w) > 0.01 || Math.abs(now.h - before[i].h) > 0.01) out.push({ size: entry.sizes[i], mode, before: before[i], now })
          })
        }
        return out
      }, key)
      expect(moved).toEqual([])
      expect(errors).toEqual([])
    })
  }
})

test.describe('<ts-card> body', () => {
  test('a height: 100% child fills the body at every size and after a resize', async ({ page }) => {
    const errors = []
    guard(page, errors)
    await open(page, 'light', '&fill=1')
    const problems = await page.evaluate(async () => {
      const fx = window.__fx
      const card = fx.entries.find((e) => e.key === 'card')
      const out = []
      const check = (el, when) => {
        const body = el.shadowRoot.querySelector('.body').getBoundingClientRect()
        const fill = el.querySelector('.fill').getBoundingClientRect()
        if (body.height < 20) out.push({ when, why: 'the body has no height', body: body.height })
        if (Math.abs(fill.height - body.height) > 0.5 || Math.abs(fill.width - body.width) > 0.5) out.push({ when, fill: [fill.width, fill.height], body: [body.width, body.height] })
      }
      for (const size of card.sizes) check(fx.tiles.get(`card:${size}`), `${size} at first`)
      // Resize every card through every size, then narrower, and read it again.
      for (const to of card.sizes) {
        for (const size of card.sizes) fx.tiles.get(`card:${size}`).setAttribute('size', to)
        await fx.nextFrame()
        for (const size of card.sizes) check(fx.tiles.get(`card:${size}`), `${size} resized to ${to}`)
      }
      for (const size of card.sizes) fx.tiles.get(`card:${size}`).style.width = '260px'
      await fx.nextFrame()
      for (const size of card.sizes) check(fx.tiles.get(`card:${size}`), `${size} narrowed`)
      return out
    })
    expect(problems).toEqual([])
    expect(errors).toEqual([])
  })
})

test.describe('theme islands', () => {
  test('a light island in a dark page and a dark island in a light page take the island theme', async ({ page }) => {
    const errors = []
    guard(page, errors)
    await page.goto('/test/browser/fixtures/islands.html')
    await page.waitForFunction(() => window.__ready === true)
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    // What a tile resolves for its surface and ink, and the colour it paints.
    const look = await page.evaluate(() => {
      const of = (selector) => {
        const el = document.querySelector(selector)
        const style = getComputedStyle(el)
        const section = el.shadowRoot.querySelector('.tile')
        return {
          surface: style.getPropertyValue('--ts-surface').trim(),
          ink: style.getPropertyValue('--ts-ink').trim(),
          painted: getComputedStyle(section).backgroundColor,
        }
      }
      return {
        lightPlain: of('#light-card'),
        darkPlain: of('#dark-card'),
        darkInLight: of('#dark-island ts-card'),
        darkMetricInLight: of('#dark-metric'),
        lightInDark: of('#light-island ts-card'),
        lightMetricInDark: of('#light-metric'),
      }
    })
    expect(look.lightPlain.painted, 'the tile paints a surface').not.toBe('rgba(0, 0, 0, 0)')
    expect(look.lightPlain.surface).not.toBe(look.darkPlain.surface)
    expect(look.lightPlain.painted).not.toBe(look.darkPlain.painted)
    expect(look.darkInLight).toEqual(look.darkPlain)
    expect(look.darkMetricInLight).toEqual(look.darkPlain)
    expect(look.lightInDark).toEqual(look.lightPlain)
    expect(look.lightMetricInDark).toEqual(look.lightPlain)
    expect(errors).toEqual([])
  })
})
