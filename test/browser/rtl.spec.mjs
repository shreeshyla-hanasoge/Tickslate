// <ts-grid> under dir=rtl in real engines (RFC 0003 §9): the page and an ancestor
// mirrored, mixed directions, positions, the chrome's corners, the arrow swap,
// a pointer drag and resize, and charts that stay left to right.
import { test, expect } from '@playwright/test'

const PAGE = '/test/browser/fixtures/grid.html?mode=explicit'
const START = ['sales', 'notes', 'tasks', 'traffic', 'queue']

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

// `html` and `wrap` are the dir values for the page and the grid's wrapper from before the grid exists, or none.
async function load(page, { html, wrap, query = '' } = {}) {
  await page.addInitScript(({ html, wrap }) => {
    // The root element may not exist yet when an init script runs.
    const apply = () => {
      if (html && document.documentElement) document.documentElement.setAttribute('dir', html)
      const w = document.getElementById('wrap')
      if (w && wrap) w.setAttribute('dir', wrap)
    }
    new MutationObserver(apply).observe(document, { childList: true, subtree: true })
    apply()
  }, { html, wrap })
  await page.goto(`${PAGE}${query}`)
  await page.waitForFunction(() => window.__ready === true)
  await settle(page)
}

// Each tile's box relative to the grid's physical left edge, by what the browser draws.
const boxes = (page) => page.evaluate(() => {
  const g = document.getElementById('g')
  const gr = g.getBoundingClientRect()
  const out = {}
  for (const el of g.children) {
    const r = el.getBoundingClientRect()
    if (r.width) out[el.getAttribute('item')] = { x: r.left - gr.left, y: r.top - gr.top, w: r.width, h: r.height }
  }
  return { width: gr.width, boxes: out }
})
const mirrored = (ltr, id) => ltr.width - ltr.boxes[id].x - ltr.boxes[id].w
const chrome = (page, id, part) => page.locator(`ts-grid .chrome[data-id="${id}"] .${part}`)
const order = (page) => page.evaluate(() => {
  const g = document.getElementById('g')
  return g.layout.profiles[g.profile].map((i) => i.id)
})
const status = (page) => page.locator('ts-grid .sr')
async function edit(page) {
  await page.evaluate(() => { document.getElementById('g').editing = true })
  await settle(page)
}
async function middle(locator) {
  await locator.scrollIntoViewIfNeeded()
  const b = await locator.boundingBox()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}
// The left-to-right layout of the same page, to compare a mirrored one with.
async function ltrBoxes(page, options) {
  await load(page, options)
  const result = await boxes(page)
  await page.goto('about:blank')
  return result
}

test.describe('positions', () => {
  test('dir=rtl on the page mirrors every tile across the grid', async ({ page }) => {
    const ltr = await ltrBoxes(page, {})
    await load(page, { html: 'rtl' })
    const rtl = await boxes(page)
    expect(rtl.width).toBeCloseTo(ltr.width, 0)
    for (const id of START) {
      const a = ltr.boxes[id]
      const b = rtl.boxes[id]
      expect(b.w).toBeCloseTo(a.w, 0)
      expect(b.y).toBeCloseTo(a.y, 0)
      expect(b.x, `${id} mirrored`).toBeCloseTo(mirrored(ltr, id), 0)
    }
    // The first tile sits top-right: flush with the grid's right edge, on the first row.
    expect(rtl.boxes.sales.x + rtl.boxes.sales.w).toBeCloseTo(rtl.width, 0)
    expect(rtl.boxes.sales.y).toBeCloseTo(0, 0)
  })

  test('dir=rtl on an ancestor alone is enough', async ({ page }) => {
    const ltr = await ltrBoxes(page, {})
    await load(page, { wrap: 'rtl' })
    expect((await boxes(page)).boxes.sales.x).toBeCloseTo(mirrored(ltr, 'sales'), 0)
  })

  test('mixed directions: the grid follows its own, not the page', async ({ page }) => {
    const ltr = await ltrBoxes(page, {})
    await load(page, { html: 'rtl', wrap: 'ltr' })
    expect((await boxes(page)).boxes.sales.x).toBeCloseTo(ltr.boxes.sales.x, 0)
    await page.goto('about:blank')
    await load(page, { html: 'ltr', wrap: 'rtl' })
    expect((await boxes(page)).boxes.sales.x).toBeCloseTo(mirrored(ltr, 'sales'), 0)
  })

  test('changing dir while the page is up re-measures at the same width', async ({ page }) => {
    await load(page)
    const before = await boxes(page)
    await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'))
    await expect.poll(async () => (await boxes(page)).boxes.sales.x).toBeCloseTo(mirrored(before, 'sales'), 0)
    await page.evaluate(() => document.documentElement.removeAttribute('dir'))
    await expect.poll(async () => (await boxes(page)).boxes.sales.x).toBeCloseTo(before.boxes.sales.x, 0)
  })

  test('a CSS direction counts, picked up at the next measure', async ({ page }) => {
    await load(page)
    await page.addStyleTag({ content: '#wrap { direction: rtl }' })
    // Nothing can be observed for a stylesheet; a change of width measures again.
    await page.evaluate(() => { document.getElementById('wrap').style.width = '720px' })
    await expect.poll(async () => {
      const b = await boxes(page)
      return b.boxes.sales.x + b.boxes.sales.w - b.width
    }).toBeCloseTo(0, 0)
  })
})

test.describe('edit chrome', () => {
  test('the remove button sits top-right of its tile and the resize handle bottom-left', async ({ page }) => {
    await load(page, { html: 'rtl' })
    await edit(page)
    const tile = await page.locator('#g > [item="notes"]').boundingBox()
    const remove = await middle(chrome(page, 'notes', 'remove'))
    const resize = await middle(chrome(page, 'notes', 'resize'))
    const mid = { x: tile.x + tile.width / 2, y: tile.y + tile.height / 2 }
    expect(remove.x).toBeGreaterThan(mid.x)
    expect(remove.y).toBeLessThan(mid.y)
    expect(resize.x).toBeLessThan(mid.x)
    expect(resize.y).toBeGreaterThan(mid.y)
  })

  test('left to right keeps them top-left and bottom-right', async ({ page }) => {
    await load(page)
    await edit(page)
    const tile = await page.locator('#g > [item="notes"]').boundingBox()
    const remove = await middle(chrome(page, 'notes', 'remove'))
    const resize = await middle(chrome(page, 'notes', 'resize'))
    expect(remove.x).toBeLessThan(tile.x + tile.width / 2)
    expect(resize.x).toBeGreaterThan(tile.x + tile.width / 2)
  })
})

test.describe('keyboard', () => {
  async function pickUp(page, id) {
    await edit(page)
    await chrome(page, id, 'handle').focus()
    await page.keyboard.press('Space')
    await expect(status(page)).toContainText('picked up')
  }

  test('ArrowRight moves a held tile toward the first slot under rtl, and ArrowLeft back', async ({ page }) => {
    await load(page, { html: 'rtl' })
    const start = (await boxes(page))
    const atRightEdge = Math.abs(start.boxes.notes.x + start.boxes.notes.w - start.width) < 2
    await pickUp(page, 'notes')
    await page.keyboard.press('ArrowRight')
    await settle(page)
    if (atRightEdge) {
      // On a phone the tile already sits at the right edge, and the key must not carry it visually left.
      await expect(status(page)).toContainText("Can't move further.")
    } else {
      // The first slot is at the right edge, so a key that reads rightward is a step earlier in the order.
      await expect(status(page)).toContainText('Notes, moved to position 1 of 5.')
      await page.keyboard.press('ArrowLeft')
      await expect(status(page)).toContainText('Notes, moved to position 2 of 5.')
    }
    await page.keyboard.press('Escape')
  })

  test('the same key steps the other way in left to right', async ({ page }) => {
    await load(page)
    await pickUp(page, 'notes')
    await page.keyboard.press('ArrowRight')
    await settle(page)
    await expect(status(page)).toContainText('Notes, moved to position 3 of 5.')
    await page.keyboard.press('Escape')
  })
})

test.describe('pointer', () => {
  test('dragging a tile to the right edge puts it first', async ({ page }) => {
    await load(page, { html: 'rtl' })
    const grid = await page.locator('#g').boundingBox()
    const from = await middle(page.locator('#g > [item="notes"]'))
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.waitForTimeout(650)
    // The top-right corner of the board is the first slot in this direction.
    await page.mouse.move(grid.x + grid.width - 40, grid.y + 40, { steps: 14 })
    await page.waitForTimeout(300)
    await page.mouse.up()
    await settle(page)
    expect((await order(page))[0]).toBe('notes')
  })

  test('dragging the handle toward the left widens a tile', async ({ page }) => {
    await load(page, { html: 'rtl' })
    await edit(page)
    const before = (await boxes(page)).boxes.notes
    const handle = await middle(chrome(page, 'notes', 'resize'))
    await page.mouse.move(handle.x, handle.y)
    await page.mouse.down()
    // Firefox under Playwright drops a mouseup released outside the viewport, so the pull stays inside it.
    await page.mouse.move(Math.max(handle.x - before.w * 1.2, 4), handle.y, { steps: 12 })
    await page.mouse.up()
    await settle(page)
    const after = (await boxes(page)).boxes.notes
    expect(after.w).toBeGreaterThan(before.w + 10)
  })
})

test('charts stay left to right inside a mirrored grid', async ({ page }) => {
  await load(page, { html: 'rtl' })
  const result = await page.evaluate(() => {
    const dir = (el) => getComputedStyle(el).direction
    const img = document.querySelector('ts-chart').shadowRoot.querySelector('[role="img"]')
    return { chart: img ? dir(img) : null, tile: dir(document.querySelector('ts-metric')) }
  })
  expect(result.chart).toBe('ltr')
  expect(result.tile).toBe('rtl')
})
