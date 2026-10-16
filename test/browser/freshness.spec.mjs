// Freshness and change flashes in real engines (RFC 0003 §6): the stale dot and meta, and a flash that is
// actually painted on Today's P&L and on the card. Computed style is the proof, because a class on an element that
// paints nothing (a slot is display: contents) is the bug this spec exists to catch.
import { test, expect } from '@playwright/test'

const PAGE = '/test/browser/fixtures/freshness.html'
const CLEAR = 'rgba(0, 0, 0, 0)'

test.beforeEach(async ({ page }) => {
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
})

async function open(page, query = '') {
  await page.goto(`${PAGE}${query}`)
  await page.waitForFunction(() => window.__ready === true)
  await page.evaluate(() => window.__f.nextFrame())
}

/** What an element inside a tile's shadow root paints behind itself. */
const paint = (page, tile, selector) =>
  page.evaluate(([t, s]) => getComputedStyle(window.__f[t].shadowRoot.querySelector(s)).backgroundColor, [tile, selector])

const text = (page, tile, selector) => page.evaluate(([t, s]) => window.__f[t].shadowRoot.querySelector(s).textContent, [tile, selector])
const name = (page, tile) => page.evaluate((t) => window.__f[t].shadowRoot.querySelector('[part="tile"]').getAttribute('aria-label'), tile)

test.describe('the change flash', () => {
  test.use({ reducedMotion: 'no-preference' })

  test("paints on Today's P&L, survives an unrelated render, and goes after 700 ms", async ({ page }) => {
    await open(page)
    expect(await paint(page, 'pnl', '[data-k="net"]')).toBe(CLEAR)
    await page.evaluate(() => { window.__f.pnl.data = { ...window.__f.pnl.data, net: 2400 } })
    await page.evaluate(() => window.__f.nextFrame())
    expect(await page.evaluate(() => window.__f.pnl.shadowRoot.querySelector('[data-k="net"]').className)).toMatch(/flash-up/)
    expect(await paint(page, 'pnl', '[data-k="net"]')).not.toBe(CLEAR)
    // A re-render with the same data (what the shared 15 s timer does) leaves the tint running.
    await page.evaluate(() => window.__f.pnl.requestRender())
    await page.evaluate(() => window.__f.nextFrame())
    expect(await paint(page, 'pnl', '[data-k="net"]')).not.toBe(CLEAR)
    await expect.poll(() => paint(page, 'pnl', '[data-k="net"]'), { timeout: 3000 }).toBe(CLEAR)
  })

  test('a fall tints with the loss colour and a rise with the profit colour', async ({ page }) => {
    await open(page)
    const probe = (token) =>
      page.evaluate((t) => {
        const d = document.createElement('div')
        d.style.backgroundColor = `color-mix(in srgb, var(${t}) 18%, transparent)`
        document.body.append(d)
        const c = getComputedStyle(d).backgroundColor
        d.remove()
        return c
      }, token)
    await page.evaluate(() => { window.__f.pnl.data = { ...window.__f.pnl.data, net: 100 } })
    await page.evaluate(() => window.__f.nextFrame())
    expect(await paint(page, 'pnl', '[data-k="net"]')).toBe(await probe('--ts-loss'))
  })

  test('paints on the card: the wrapper around the value slot, not the slot', async ({ page }) => {
    await open(page)
    expect(await paint(page, 'card', '[data-k="vw"]')).toBe(CLEAR)
    await page.evaluate(() => { window.__f.card.querySelector('[slot="value"]').textContent = '1,262' })
    await expect.poll(() => paint(page, 'card', '[data-k="vw"]'), { timeout: 3000 }).not.toBe(CLEAR)
    await expect.poll(() => paint(page, 'card', '[data-k="vw"]'), { timeout: 3000 }).toBe(CLEAR)
  })

  test('a formatted metric figure flashes on the number behind it', async ({ page }) => {
    await open(page)
    await page.evaluate(() => { window.__f.metric.data = { ...window.__f.metric.data, value: 1500 } })
    await page.evaluate(() => window.__f.nextFrame())
    expect(await paint(page, 'metric', '[data-k="value"]')).not.toBe(CLEAR)
  })

  test('flash="off" on the tile stops it', async ({ page }) => {
    await open(page)
    await page.evaluate(() => {
      window.__f.pnl.setAttribute('flash', 'off')
      window.__f.pnl.data = { ...window.__f.pnl.data, net: 3000 }
    })
    await page.evaluate(() => window.__f.nextFrame())
    expect(await paint(page, 'pnl', '[data-k="net"]')).toBe(CLEAR)
  })
})

test.describe('the change flash under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('paints nothing', async ({ page }) => {
    await open(page)
    await page.evaluate(() => { window.__f.pnl.data = { ...window.__f.pnl.data, net: 2400 } })
    await page.evaluate(() => window.__f.nextFrame())
    expect(await paint(page, 'pnl', '[data-k="net"]')).toBe(CLEAR)
  })
})

test.describe('the stale dot', () => {
  test('a fresh live tile pulses green with "just now"; ten minutes on it is amber, still, worded and named', async ({ page }) => {
    await open(page)
    const probe = (token) =>
      page.evaluate((t) => {
        const d = document.createElement('div')
        d.style.backgroundColor = `var(${t})`
        document.body.append(d)
        const c = getComputedStyle(d).backgroundColor
        d.remove()
        return c
      }, token)
    for (const tile of ['pnl', 'metric', 'table', 'card']) {
      expect(await text(page, tile, '[data-k="time"]'), `${tile} fresh`).toBe('just now')
      expect(await name(page, tile)).toMatch(/, live$/)
      expect(await paint(page, tile, '[data-k="dot"]')).toBe(await probe('--ts-profit'))
    }
    await page.evaluate(() => window.__f.set(window.__f.now() + 600000))
    await page.evaluate(() => window.__f.nextFrame())
    for (const tile of ['pnl', 'metric', 'table', 'card']) {
      expect(await text(page, tile, '[data-k="time"]'), `${tile} stale`).toMatch(/^Stale · 10 mins?$/)
      expect(await name(page, tile)).toMatch(/, stale$/)
      expect(await paint(page, tile, '[data-k="dot"]')).toBe(await probe('--ts-warn'))
      expect(await page.evaluate((t) => getComputedStyle(window.__f[t].shadowRoot.querySelector('[data-k="dot"]')).animationName, tile)).toBe('none')
    }
  })

  test('thirty live tiles run on one 15 s timer', async ({ page }) => {
    await page.addInitScript(() => {
      window.__intervals = []
      const real = window.setInterval
      window.setInterval = (fn, ms, ...rest) => {
        const id = real(fn, ms, ...rest)
        window.__intervals.push({ id, ms })
        return id
      }
    })
    await open(page)
    await page.evaluate(() => {
      for (let i = 0; i < 26; i++) {
        const el = document.createElement('ts-metric')
        el.setAttribute('size', 'S')
        el.clock = () => window.__f.now()
        el.data = { value: i, asOf: window.__f.now() - 1000, live: true }
        document.getElementById('stage').append(el)
      }
    })
    await page.evaluate(() => window.__f.nextFrame())
    expect(await page.evaluate(() => window.__intervals.filter((i) => i.ms === 15000).length)).toBe(1)
  })
})
