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
    // The corner is the other diagonal, so the cursor has to be too.
    expect(await chrome(page, 'notes', 'resize').evaluate((el) => getComputedStyle(el).cursor)).toBe('nesw-resize')
  })

  test('left to right keeps them top-left and bottom-right', async ({ page }) => {
    await load(page)
    await edit(page)
    const tile = await page.locator('#g > [item="notes"]').boundingBox()
    const remove = await middle(chrome(page, 'notes', 'remove'))
    const resize = await middle(chrome(page, 'notes', 'resize'))
    expect(remove.x).toBeLessThan(tile.x + tile.width / 2)
    expect(resize.x).toBeGreaterThan(tile.x + tile.width / 2)
    expect(await chrome(page, 'notes', 'resize').evaluate((el) => getComputedStyle(el).cursor)).toBe('nwse-resize')
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

test.describe('a direction flip during a gesture', () => {
  const flip = async (page, dir) => {
    await page.evaluate((d) => document.documentElement.setAttribute('dir', d), dir)
    await settle(page)
  }

  test('flipping dir while a tile is held cancels the hold', async ({ page }) => {
    await load(page, { html: 'rtl' })
    await edit(page)
    await chrome(page, 'notes', 'handle').focus()
    await page.keyboard.press('Space')
    await expect(status(page)).toContainText('picked up')
    await flip(page, 'ltr')
    await expect(status(page)).toContainText('Notes, move cancelled.')
    expect(await order(page)).toEqual(START)
  })

  test('flipping dir mid-drag ends the drag with a valid layout', async ({ page }) => {
    await load(page, { html: 'rtl' })
    const grid = await page.locator('#g').boundingBox()
    const from = await middle(page.locator('#g > [item="notes"]'))
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.waitForTimeout(650)
    await page.mouse.move(grid.x + grid.width - 40, grid.y + 40, { steps: 8 })
    await flip(page, 'ltr')
    await page.mouse.up()
    await settle(page)
    expect([...(await order(page))].sort()).toEqual([...START].sort())
    await expect(page.locator('ts-grid .placeholder.on')).toHaveCount(0)
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
    await settle(page)
    // The right edge is the anchored one under rtl: a placeholder that kept the physical left would slide off it.
    const grid = await page.locator('#g').boundingBox()
    const ph = await page.locator('ts-grid .placeholder').boundingBox()
    expect(Math.abs(ph.x + ph.width - grid.x - before.x - before.w)).toBeLessThan(2)
    expect(ph.width).toBeGreaterThan(before.w + 10)
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

// ── Parity: the same gestures give the same layout in either direction ──────────────────────────────────────────

const layoutOf = (page) => page.evaluate(() => JSON.stringify(document.getElementById('g').layout))
const FIVE = ['sales', 'tasks', 'traffic', 'queue', 'corner']

// Drag notes with the mouse to where `spot` is on screen. 'corner' is the grid's first slot: top-left in ltr, top-right in rtl.
async function dragNotes(page, spot, rtl) {
  const grid = await page.locator('#g').boundingBox()
  const from = await middle(page.locator('#g > [item="notes"]'))
  const to = spot === 'corner'
    ? { x: rtl ? grid.x + grid.width - 40 : grid.x + 40, y: grid.y + 40 }
    : await middle(page.locator(`#g > [item="${spot}"]`))
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.waitForTimeout(650)
  await page.mouse.move(to.x, to.y, { steps: 14 })
  await page.waitForTimeout(300)
  await page.mouse.up()
  await settle(page)
}

test.describe('parity with left to right', () => {
  for (const spot of FIVE) {
    test(`dropping notes on ${spot} saves the same layout in both directions`, async ({ page }) => {
      await load(page)
      await dragNotes(page, spot, false)
      const ltr = await layoutOf(page)
      await page.goto('about:blank')
      await load(page, { html: 'rtl' })
      await dragNotes(page, spot, true)
      expect(await layoutOf(page)).toBe(ltr)
    })
  }

  test('a resize pulled the same distance toward the growing side gives the same size', async ({ page }) => {
    const sizeOf = () => page.evaluate(() => document.getElementById('g').layout.profiles[document.getElementById('g').profile].find((i) => i.id === 'notes').size)
    const pull = async (sign) => {
      await edit(page)
      const handle = await middle(chrome(page, 'notes', 'resize'))
      const w = (await boxes(page)).boxes.notes.w
      await page.mouse.move(handle.x, handle.y)
      await page.mouse.down()
      await page.mouse.move(handle.x + sign * (w + 16) * 0.9, handle.y, { steps: 12 })
      await page.mouse.up()
      await settle(page)
      return sizeOf()
    }
    await load(page)
    const ltr = await pull(1)
    await page.goto('about:blank')
    await load(page, { html: 'rtl' })
    const rtl = await pull(-1)
    expect(ltr).not.toBe('S')
    expect(rtl).toBe(ltr)
  })
})

test.describe('tile shapes', () => {
  const SHAPES = [['sales', 'Wide'], ['notes', 'Banner'], ['tasks', 'Tall'], ['traffic', 'M'], ['queue', 'Wide']]
  const shape = async (page) => {
    await page.evaluate((shapes) => { document.getElementById('g').layout = shapes.map(([id, size]) => ({ id, size })) }, SHAPES)
    await settle(page)
    return boxes(page)
  }
  test('Banner and Tall tiles mirror like the rest', async ({ page }) => {
    await load(page)
    const ltr = await shape(page)
    await page.goto('about:blank')
    await load(page, { html: 'rtl' })
    const rtl = await shape(page)
    for (const [id] of SHAPES) {
      expect(rtl.boxes[id].x, `${id} x`).toBeCloseTo(mirrored(ltr, id), 0)
      expect(rtl.boxes[id].y, `${id} y`).toBeCloseTo(ltr.boxes[id].y, 0)
      expect(rtl.boxes[id].w, `${id} w`).toBeCloseTo(ltr.boxes[id].w, 0)
    }
  })
})

test.describe('furniture', () => {
  async function removeAll(page) {
    await edit(page)
    for (const id of START) {
      // The tiles slide after each removal, so a click can land on the button's old place: try again until it takes.
      await expect.poll(async () => {
        if (await page.locator(`#g > [item="${id}"]`).isHidden()) return true
        await chrome(page, id, 'remove').click({ timeout: 1000 }).catch(() => {})
        await page.waitForTimeout(250)
        return page.locator(`#g > [item="${id}"]`).isHidden()
      }, { timeout: 8000 }).toBe(true)
    }
  }

  for (const dir of ['ltr', 'rtl']) {
    test(`the empty board's Add back menu is centred on its button (${dir})`, async ({ page }) => {
      await load(page, { html: dir })
      await page.evaluate(() => { document.getElementById('g').addTypes = '*' })
      await removeAll(page)
      const add = page.locator('ts-grid .empty .add')
      await expect(add).toBeVisible()
      await add.focus()
      await page.keyboard.press('Enter')
      const menu = page.locator('ts-grid .empty .menu')
      await expect(menu).toBeVisible()
      const view = page.viewportSize()
      // The menu may still be easing in; its resting place is what counts.
      await expect.poll(async () => {
        const a = await add.boundingBox()
        const m = await menu.boundingBox()
        return Math.abs(m.x + m.width / 2 - (a.x + a.width / 2))
      }).toBeLessThan(2)
      const m = await menu.boundingBox()
      expect(m.x).toBeGreaterThanOrEqual(-0.5)
      expect(m.x + m.width).toBeLessThanOrEqual(view.width + 0.5)
    })
  }

  test('the undo toast pads and spaces from the inline start under rtl', async ({ page }) => {
    await load(page, { html: 'rtl' })
    await edit(page)
    await chrome(page, 'notes', 'remove').click()
    await settle(page)
    const toast = page.locator('ts-grid .toast.on')
    await expect(toast).toBeVisible()
    const css = await toast.evaluate((el) => {
      const t = getComputedStyle(el)
      const u = getComputedStyle(el.querySelector('.undo'))
      return { pl: t.paddingLeft, pr: t.paddingRight, ml: u.marginLeft, mr: u.marginRight }
    })
    expect(css).toEqual({ pl: '4px', pr: '20px', ml: '0px', mr: '16px' })
  })
})

test.describe('a dir on a shadow-tree wrapper', () => {
  const wrapInShadow = (page, dir) => page.evaluate((dir) => {
    const host = document.createElement('div')
    host.id = 'sh'
    document.getElementById('wrap').append(host)
    const root = host.attachShadow({ mode: 'open' })
    root.innerHTML = `<div id="inner" dir="${dir}"><slot></slot></div>`
    host.append(document.getElementById('g'))
  }, dir)

  test('mirrors the grid slotted into it, and follows a change of that dir', async ({ page }) => {
    await load(page)
    const ltr = await boxes(page)
    await wrapInShadow(page, 'rtl')
    await expect.poll(async () => (await boxes(page)).boxes.sales.x).toBeCloseTo(mirrored(ltr, 'sales'), 0)
    await page.evaluate(() => document.getElementById('sh').shadowRoot.getElementById('inner').setAttribute('dir', 'ltr'))
    await expect.poll(async () => (await boxes(page)).boxes.sales.x).toBeCloseTo(ltr.boxes.sales.x, 0)
  })
})

test.describe('signed figures', () => {
  test('a gain keeps its sign before its digits in a mirrored grid', async ({ page }) => {
    await load(page, { html: 'rtl' })
    const order = await page.evaluate(() => {
      const el = document.querySelector('ts-metric')
      const walker = document.createTreeWalker(el.shadowRoot, NodeFilter.SHOW_TEXT)
      const out = []
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const sign = n.data.search(/[+−]/)
        const digit = n.data.search(/\d/)
        if (sign < 0 || digit < 0 || sign > digit) continue
        const at = (i) => { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); return r.getBoundingClientRect() }
        out.push(at(sign).left < at(digit).left)
      }
      return out
    })
    expect(order.length).toBeGreaterThan(0)
    expect(order.every(Boolean)).toBe(true)
  })
})

test.describe('touch', () => {
  test.skip(({ browserName }) => browserName === 'firefox', 'Firefox has no touch emulation')
  test.use({ hasTouch: true })

  test('tap-to-place: tap a handle, then another tile, and the first lands there', async ({ page }) => {
    await load(page, { html: 'rtl' })
    await edit(page)
    await chrome(page, 'tasks', 'handle').tap()
    await expect(status(page)).toContainText('Tasks, picked up.')
    await chrome(page, 'sales', 'handle').tap()
    await settle(page)
    const first = await page.evaluate(() => document.getElementById('g').layout.profiles[document.getElementById('g').profile][0].id)
    expect(first).toBe('tasks')
    // And the tile sits in the first slot: the top-right corner.
    const b = await boxes(page)
    expect(b.boxes.tasks.x + b.boxes.tasks.w).toBeCloseTo(b.width, 0)
    expect(b.boxes.tasks.y).toBeCloseTo(0, 0)
  })

  test('the remove button works by touch at its mirrored corner', async ({ page }) => {
    await load(page, { html: 'rtl' })
    await edit(page)
    await chrome(page, 'notes', 'remove').tap()
    await settle(page)
    await expect(page.locator('#g > [item="notes"]')).toBeHidden()
  })
})

// ── Fit: nothing sticks out of its tile, with wide fonts and under the terminal preset ──────────────────────────

const stick = (page) => page.evaluate(() => {
  const out = []
  const clippedBy = (n, tile) => {
    for (let p = n.parentElement; p; p = p.parentElement) if (getComputedStyle(p).overflowX !== 'visible') return true
    return false
  }
  const visit = (root, tile) => {
    for (const n of root.querySelectorAll('*')) {
      if (n.closest('[hidden]') || n.closest('.sr')) continue
      const r = n.getBoundingClientRect()
      if (r.width > 0 && r.height > 0 && (r.left < tile.left - 0.5 || r.right > tile.right + 0.5) && !clippedBy(n, tile)) out.push(`${n.localName}.${n.className}`)
      if (n.shadowRoot) visit(n.shadowRoot, tile)
    }
  }
  for (const el of document.querySelectorAll('#g > [item]')) {
    const tile = el.getBoundingClientRect()
    if (tile.width && el.shadowRoot) visit(el.shadowRoot, tile)
  }
  return out
})

test.describe('fits its tile in a mirrored grid', () => {
  // The grid is 361px at a phone (an S tile is 170px, Wide 351px) and 1264px on a desktop (S 304px, Wide 624px).
  for (const w of [361, 1264]) {
    for (const mode of ['plain', 'wide', 'terminal']) {
      test(`at ${w}px, ${mode}`, async ({ page }) => {
        await load(page, { html: 'rtl', query: `&w=${w}` })
        if (mode === 'wide') {
          await page.addStyleTag({ content: ":root { --ts-font-ui: Verdana, 'DejaVu Sans', sans-serif; --ts-font-num: Verdana, 'DejaVu Sans', sans-serif; } body { letter-spacing: .05em; }" })
        }
        if (mode === 'terminal') {
          await page.addStyleTag({ url: '/src/themes/presets/terminal.css' })
          await page.evaluate(() => { document.documentElement.dataset.tsTheme = 'terminal' })
        }
        await settle(page)
        await page.waitForTimeout(200)
        expect(await stick(page)).toEqual([])
      })
    }
  }
})
