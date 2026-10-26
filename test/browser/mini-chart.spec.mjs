// <ts-mini-chart> with the real Emberwick (RFC 0004 §6): it draws at M, L and XL, an appended or changed last bar
// reaches Emberwick as one update or append and never a second setData, the theme is re-read when it changes, the
// canvas is hidden from assistive technology behind a labelled image, and the whole thing works under a strict CSP
// with Trusted Types. The pure parts and the fake-Emberwick cases are in test/mini-chart.test.mjs.
import { test, expect } from '@playwright/test'

const PAGE = '/test/browser/fixtures/mini-chart.html'

let errors
test.beforeEach(async ({ page }) => {
  errors = []
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => expect(errors).toEqual([]))

async function open(page, theme = 'light') {
  await page.goto(`${PAGE}?theme=${theme}`)
  await page.waitForFunction(() => window.__ready === true)
}

/** Gives the three tiles their data and waits until Emberwick has drawn. */
async function fill(page, mutate = '(d) => d') {
  await page.evaluate((src) => {
    const data = window.__mc.dataFor('ts-mini-chart')
    const edit = (0, eval)(src)
    for (const id of ['m', 'l', 'xl']) document.getElementById(id).data = edit(structuredClone(data))
  }, mutate)
  await page.waitForFunction(() => window.__mc.charts.size >= 4)
  await page.evaluate(() => window.__mc.nextFrame())
}

const canvases = (page, id) => page.evaluate((i) => [...document.getElementById(i).shadowRoot.querySelectorAll('canvas')].map((c) => ({ hidden: c.getAttribute('aria-hidden'), w: c.width, h: c.height })), id)

/** How many different colours a tile's canvases hold: a blank or failed chart has one. */
const colours = (page, id) =>
  page.evaluate((i) => {
    const seen = new Set()
    for (const c of document.getElementById(i).shadowRoot.querySelectorAll('canvas')) {
      const { data } = c.getContext('2d').getImageData(0, 0, c.width, c.height)
      for (let p = 0; p < data.length; p += 4 * 7) seen.add(`${data[p]},${data[p + 1]},${data[p + 2]},${data[p + 3]}`)
    }
    return seen.size
  }, id)

test.describe('draws with the real Emberwick', () => {
  for (const [id, charts] of [['m', 1], ['l', 1], ['xl', 2]]) {
    test(`${id}: ${charts} chart${charts > 1 ? 's' : ''}, with canvases that are hidden and not blank`, async ({ page }) => {
      await open(page)
      await fill(page)
      const plots = await page.evaluate((i) => [...document.getElementById(i).shadowRoot.querySelectorAll('[role="img"]')].map((p) => p.getAttribute('aria-label')), id)
      expect(plots).toHaveLength(charts)
      expect(plots[0]).toMatch(/^ABC Corp, 5m: last [\d.]+, up 1\.20%, 30 bars, 2 entries and 1 exit$/)
      const list = await canvases(page, id)
      expect(list.length).toBeGreaterThanOrEqual(charts)
      for (const c of list) {
        expect(c.hidden).toBe('true')
        expect(c.w).toBeGreaterThan(50)
      }
      expect(await colours(page, id)).toBeGreaterThan(6)
      // The box Emberwick draws in is not a tab stop: it is inside aria-hidden.
      const focusable = await page.evaluate((i) => document.getElementById(i).shadowRoot.querySelectorAll('.cv[tabindex="-1"][aria-hidden="true"]').length, id)
      expect(focusable).toBe(charts)
    })
  }

  test('the tile is named by the label and the headline, its image by the full summary, and the change carries a sign and a word', async ({ page }) => {
    await open(page)
    await fill(page)
    const info = await page.evaluate(() => {
      const root = document.getElementById('m').shadowRoot
      return { name: root.querySelector('.tile').getAttribute('aria-label'), image: root.querySelector('[role="img"]').getAttribute('aria-label'), change: root.querySelector('[data-k="chg0"]').textContent }
    })
    expect(info.name).toMatch(/^Watch, ABC Corp, last [\d.]+$/)
    expect(info.image).toMatch(/^ABC Corp, 5m: last .*, up 1\.20%/)
    expect(info.name).not.toBe(info.image)
    expect(info.change).toMatch(/^▲\+1\.20%$/)
  })

  test('the countdown option reaches Emberwick and follows the data', async ({ page }) => {
    await open(page)
    await fill(page)
    const before = await page.evaluate(() => window.__mc.count('setCountdown'))
    await page.evaluate(() => {
      const el = document.getElementById('m')
      el.data = { ...el.data, countdown: false }
    })
    await page.evaluate(() => window.__mc.nextFrame())
    expect(await page.evaluate(() => window.__mc.count('setCountdown'))).toBe(before + 1)
  })
})

test.describe('incremental updates', () => {
  test('a tick is one update, a candle closing is one update and one append, neither is a setData', async ({ page }) => {
    await open(page)
    await fill(page)
    const base = await page.evaluate(() => ({ set: window.__mc.count('setData'), update: window.__mc.count('update'), append: window.__mc.count('append') }))
    // The host reassigns data on every tick; only the last candle differs.
    await page.evaluate(() => {
      const el = document.getElementById('m')
      const d = structuredClone(el.data)
      const last = d.charts[0].bars.at(-1)
      last.close += 0.4
      last.high = Math.max(last.high, last.close)
      el.data = d
    })
    await page.evaluate(() => window.__mc.nextFrame())
    expect(await page.evaluate(() => [window.__mc.count('setData'), window.__mc.count('update'), window.__mc.count('append')])).toEqual([base.set, base.update + 1, base.append])
    await page.evaluate(() => {
      const el = document.getElementById('m')
      const d = structuredClone(el.data)
      const last = d.charts[0].bars.at(-1)
      d.charts[0].bars.push({ time: last.time + 300000, open: last.close, high: last.close + 0.3, low: last.close - 0.2, close: last.close + 0.1 })
      last.close -= 0.1
      el.data = d
    })
    await page.evaluate(() => window.__mc.nextFrame())
    expect(await page.evaluate(() => [window.__mc.count('setData'), window.__mc.count('update'), window.__mc.count('append')])).toEqual([base.set, base.update + 2, base.append + 1])
    const label = await page.evaluate(() => document.getElementById('m').shadowRoot.querySelector('[role="img"]').getAttribute('aria-label'))
    expect(label).toContain('31 bars')
  })

  test('a different timeframe is one setData', async ({ page }) => {
    await open(page)
    await fill(page)
    const before = await page.evaluate(() => window.__mc.count('setData'))
    await page.evaluate(() => {
      const el = document.getElementById('m')
      const d = structuredClone(el.data)
      d.charts[0].timeframe = '15m'
      d.charts[0].bars = d.charts[0].bars.filter((_, i) => i % 3 === 0)
      el.data = d
    })
    await page.evaluate(() => window.__mc.nextFrame())
    expect(await page.evaluate(() => window.__mc.count('setData'))).toBe(before + 1)
  })
})

test.describe('the theme', () => {
  test('is re-read when data-theme changes, and the candles are redrawn in the new colours', async ({ page }) => {
    await open(page, 'light')
    await fill(page)
    const theme = () => page.evaluate(() => {
      const chart = window.__mc.chartIn('m')
      return { background: chart.theme.background, up: chart.theme.up, text: chart.theme.text }
    })
    const light = await theme()
    expect(light.background).toMatch(/^rgb\(/)
    const before = await page.evaluate(() => window.__mc.count('setTheme'))
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark'
    })
    await page.waitForFunction((n) => window.__mc.count('setTheme') > n, before)
    const dark = await theme()
    expect(dark.background).not.toBe(light.background)
    // The same rgb() the tile's own --ts-surface resolves to.
    const surface = await page.evaluate(() => {
      const c = document.createElement('canvas').getContext('2d')
      c.fillStyle = getComputedStyle(document.getElementById('m')).getPropertyValue('--ts-surface').trim()
      c.fillRect(0, 0, 1, 1)
      const [r, g, b] = c.getImageData(0, 0, 1, 1).data
      return `rgb(${r}, ${g}, ${b})`
    })
    expect(dark.background).toBe(surface)
  })

  test('follows the red-up palette: up candles take the loss colour', async ({ page }) => {
    await open(page)
    await fill(page)
    const up = () => page.evaluate(() => window.__mc.chartIn('m').theme.up)
    const green = await up()
    const before = await page.evaluate(() => window.__mc.count('setTheme'))
    await page.evaluate(() => {
      document.documentElement.dataset.tsPalette = 'red-up'
    })
    await page.waitForFunction((n) => window.__mc.count('setTheme') > n, before)
    expect(await up()).not.toBe(green)
  })
})

// docs/theming.md: the theme may be set on the grid or the widget, "any element". Each case changes what --ts-* resolves to
// somewhere other than <html> or a grid, and Emberwick must hear about it.
test.describe('the theme wherever it is set', () => {
  const cases = {
    'data-theme on a wrapper': () => document.getElementById('stage').setAttribute('data-theme', 'dark'),
    'data-ts-palette on the widget itself': () => document.getElementById('m').setAttribute('data-ts-palette', 'red-up'),
    'a class on <body>': () => document.body.classList.add('dark'),
    'an inline token on <html>': () => document.documentElement.style.setProperty('--ts-surface', 'rgb(12, 34, 56)'),
  }
  for (const [name, change] of Object.entries(cases)) {
    test(`${name} reaches setTheme`, async ({ page }) => {
      await open(page, 'light')
      await fill(page)
      const theme = () => page.evaluate(() => {
        const t = window.__mc.chartIn('m').theme
        return JSON.stringify([t.background, t.up, t.down])
      })
      const was = await theme()
      const before = await page.evaluate(() => window.__mc.count('setTheme'))
      await page.evaluate(change)
      await page.waitForFunction((n) => window.__mc.count('setTheme') > n, before)
      expect(await theme()).not.toBe(was)
    })
  }

  test('a change that moves no mapped value calls setTheme nowhere', async ({ page }) => {
    await open(page, 'light')
    await fill(page)
    const before = await page.evaluate(() => window.__mc.count('setTheme'))
    await page.evaluate(() => {
      document.getElementById('stage').setAttribute('data-theme', 'light')
      document.getElementById('m').classList.add('unrelated')
    })
    await page.evaluate(() => window.__mc.nextFrame())
    await page.evaluate(() => window.__mc.nextFrame())
    expect(await page.evaluate(() => window.__mc.count('setTheme'))).toBe(before)
  })
})

test.describe('actions', () => {
  test('timeframe buttons need actions, are pressed from the data, and fire ts-action', async ({ page }) => {
    await open(page)
    await fill(page)
    const group = () => page.evaluate(() => {
      const g = document.getElementById('l').shadowRoot.querySelector('[data-k="tfGroup"]')
      return { hidden: g.hasAttribute('hidden'), buttons: [...g.querySelectorAll('button')].map((b) => [b.textContent, b.getAttribute('aria-pressed')]) }
    })
    expect((await group()).hidden).toBe(true)
    await page.evaluate(() => {
      document.getElementById('l').actions = ['timeframe']
    })
    await page.evaluate(() => window.__mc.nextFrame())
    expect(await group()).toEqual({ hidden: false, buttons: [['1m', 'false'], ['5m', 'true'], ['15m', 'false']] })
    const fired = page.evaluate(() => new Promise((resolve) => document.getElementById('l').addEventListener('ts-action', (e) => resolve(e.detail), { once: true })))
    await page.getByRole('button', { name: '15m' }).click()
    expect(await fired).toEqual({ action: 'timeframe', id: 'abc', value: '15m' })
  })
})

test.describe('a volume profile', () => {
  test('adds a canvas at L, and a rejected one is the error view', async ({ page }) => {
    await open(page)
    await fill(page)
    // The fixture's profile loads emberwick/profiles, which attaches its own canvas.
    await page.waitForFunction(() => document.getElementById('l').shadowRoot.querySelectorAll('canvas').length > 2)
    expect((await canvases(page, 'm')).length).toBeLessThan((await canvases(page, 'l')).length)
    await page.evaluate(() => {
      const el = document.getElementById('l')
      el.data = { ...el.data, volumeProfile: { ...el.data.volumeProfile, step: 0 } }
    })
    await page.waitForFunction(() => document.getElementById('l').shadowRoot.querySelector('[data-k="message"]'))
    expect(await page.evaluate(() => document.getElementById('l').shadowRoot.querySelector('[data-k="message"]').textContent)).toBe("The volume profile couldn't be drawn")
    // A good profile again brings the chart back.
    await page.evaluate(() => {
      const el = document.getElementById('l')
      el.data = window.__mc.dataFor('ts-mini-chart')
    })
    await page.waitForFunction(() => document.getElementById('l').shadowRoot.querySelectorAll('[role="img"]').length === 1)
  })
})

test.describe('under a strict CSP and Trusted Types', () => {
  test('draws, with no violation', async ({ page }) => {
    const violations = []
    await page.addInitScript(() => {
      window.__violations = []
      document.addEventListener('securitypolicyviolation', (e) => window.__violations.push(`${e.violatedDirective} ${e.blockedURI} ${(e.sample || '').slice(0, 60)}`))
    })
    await page.route('**/@vite/client', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export {}' }))
    await page.route('**/test/browser/fixtures/mini-chart.html*', async (route) => {
      const response = await route.fetch()
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; require-trusted-types-for 'script'; trusted-types tickslate",
        },
      })
    })
    await open(page)
    await fill(page)
    expect(await colours(page, 'm')).toBeGreaterThan(6)
    expect(await page.evaluate(() => window.__violations)).toEqual(violations)
  })
})
