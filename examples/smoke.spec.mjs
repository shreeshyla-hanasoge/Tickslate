// The smoke test every consumer example must pass (RFC 0003 §24, consumer-examples). It is
// not part of `npm run test:browser`: scripts/test-consumers.mjs runs it against the examples
// after each was installed from the packed tarball and built, and tells it where each one is
// served through TS_EXAMPLES, a JSON list of { name, url }.
import { test, expect } from '@playwright/test'

const examples = JSON.parse(process.env.TS_EXAMPLES || '[]')
const IDS = ['pnl', 'signups', 'revenue', 'notes']

// Two frames: the grid places tiles on the frame after a layout or a size change.
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

async function open(page, url) {
  await page.goto(url)
  await page.waitForFunction(() => customElements.get('ts-grid') && customElements.get('ts-metric'))
  await page.locator('ts-grid > [item="notes"]').waitFor()
  await settle(page)
}

// The tiles' ids in reading order on screen (top to bottom, then left to right).
const order = (page) => page.evaluate(() =>
  [...document.querySelectorAll('ts-grid > [item]')]
    .map((el) => ({ id: el.getAttribute('item'), r: el.getBoundingClientRect() }))
    .sort((a, b) => Math.round(a.r.top) - Math.round(b.r.top) || a.r.left - b.r.left)
    .map((t) => t.id))

for (const { name, url } of examples) {
  test.describe(name, () => {
    let problems
    test.beforeEach(async ({ page }) => {
      problems = []
      page.on('pageerror', (error) => problems.push(error.message))
      page.on('console', (msg) => { if (msg.type() === 'error' || msg.type() === 'warning') problems.push(msg.text()) })
    })
    test.afterEach(() => {
      expect(problems).toEqual([])
    })

    test('the four widgets render their data, with no object left as an attribute', async ({ page }) => {
      await open(page, url)
      await expect(page.locator('ts-metric')).toContainText('1,204')
      await expect(page.locator('ts-today-pnl')).toContainText('412')
      await expect(page.locator('ts-card')).toContainText('Deploy freeze')
      // The chart draws its result as an image with a label that states it.
      const label = await page.locator('ts-chart [role="img"]').first().getAttribute('aria-label')
      expect(label).toMatch(/Revenue/)
      // A framework that stringified `data` leaves this behind (and the tile shows its error view).
      const stringified = await page.evaluate(() => [...document.querySelectorAll('ts-grid > [item]')].filter((el) => (el.getAttribute('data') || '').includes('[object')).length)
      expect(stringified).toBe(0)
    })

    test('no two tiles overlap and every tile has a size', async ({ page }) => {
      await open(page, url)
      const boxes = await page.evaluate(() => [...document.querySelectorAll('ts-grid > [item]')].map((el) => {
        const r = el.getBoundingClientRect()
        return { id: el.getAttribute('item'), x: r.left, y: r.top, w: r.width, h: r.height }
      }))
      expect(boxes.map((b) => b.id).sort()).toEqual([...IDS].sort())
      for (const b of boxes) {
        expect(b.w, `${b.id} width`).toBeGreaterThan(40)
        expect(b.h, `${b.id} height`).toBeGreaterThan(40)
      }
      const eps = 0.5
      for (const [i, a] of boxes.entries()) {
        for (const b of boxes.slice(i + 1)) {
          const apart = a.x + a.w <= b.x + eps || b.x + b.w <= a.x + eps || a.y + a.h <= b.y + eps || b.y + b.h <= a.y + eps
          expect(apart, `${a.id} and ${b.id} overlap`).toBe(true)
        }
      }
    })

    test('activating a tile reaches the host as ts-action', async ({ page }) => {
      await open(page, url)
      await page.locator('ts-metric').click()
      await expect(page.locator('#last-action')).toHaveText(/open signups/)
    })

    test('a keyboard move fires ts-layout-change and survives a reload', async ({ page }) => {
      await open(page, url)
      const before = await order(page)
      expect([...before].sort()).toEqual([...IDS].sort())
      await page.evaluate(() => {
        window.__changes = []
        document.querySelector('ts-grid').addEventListener('ts-layout-change', (e) => window.__changes.push(e.detail.reason))
      })

      // Edit mode through the keyboard door (the first Tab stop is the grid's Edit layout button),
      // then the first tile's handle: Space lifts it, the arrow moves it, Space drops it.
      await page.keyboard.press('Tab')
      await page.keyboard.press('Enter')
      await expect.poll(() => page.evaluate(() => document.querySelector('ts-grid').editing)).toBe(true)
      await settle(page)
      const handle = page.locator(`ts-grid .chrome[data-id="${before[0]}"] .handle`)
      await handle.focus()
      await page.keyboard.press('Space')
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('Space')
      await settle(page)

      await expect.poll(() => page.evaluate(() => window.__changes)).toContain('move')
      const after = await order(page)
      expect(after).not.toEqual(before)

      // persist="…" put it in localStorage with no code in the example.
      await page.reload()
      await open(page, url)
      expect(await order(page)).toEqual(after)
    })
  })
}
