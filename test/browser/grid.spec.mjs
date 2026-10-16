// <ts-grid> in real engines: columns, implicit mode, pointer and touch editing,
// the keyboard, tap-to-place, remove and undo, Done, and the locked grid.
// The fixture records every grid event in window.__events.
import { test, expect } from '@playwright/test'

const PAGE = '/test/browser/fixtures/grid.html'
const START = ['sales', 'notes', 'tasks', 'traffic', 'queue']
// What each tile's widget may be sized to (the WIDGETS catalog, RFC 0002 §1.4).
const SIZES = {
  sales: ['S', 'Wide', 'M'],
  notes: ['S', 'Wide', 'Tall', 'M', 'L', 'Banner', 'XL'],
  tasks: ['S', 'Wide', 'Tall', 'M', 'L', 'Banner', 'XL'],
  traffic: ['Wide', 'M', 'L', 'XL'],
  queue: ['S', 'Wide', 'Tall', 'M', 'L', 'Banner', 'XL'],
}

let errors
test.beforeEach(async ({ page }) => {
  errors = []
  // Network off: only the dev server answers.
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => {
  expect(errors).toEqual([])
})

async function load(page, query = '') {
  await page.goto(`${PAGE}?mode=explicit${query}`)
  await page.waitForFunction(() => window.__ready === true)
  await settle(page)
}
// Two frames: the grid places tiles on the frame after a layout or a size change.
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
const events = (page) => page.evaluate(() => window.__events)
const changes = async (page, reason) => (await events(page)).filter((e) => e.type === 'ts-layout-change' && (!reason || e.reason === reason))
const editing = (page) => page.evaluate(() => document.getElementById('g').editing)

// Tile ids as they sit on screen, top to bottom then left to right. The
// position is the one the grid wrote (the translate), not the bounding box,
// which a lifted tile's 4% scale would nudge into the row above.
const onScreen = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#g > [item]')]
    .filter((el) => el.getBoundingClientRect().width > 0)
    .map((el) => {
      // A zero y is dropped from the serialised value: '366px', not '366px 0px'.
      const [x, y = 0] = el.style.translate.split(' ').map(parseFloat)
      return { id: el.getAttribute('item'), x, y }
    })
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((t) => t.id))

const tile = (page, id) => page.locator(`#g > [item="${id}"]`)
const handle = (page, id) => page.locator(`ts-grid .chrome[data-id="${id}"] .handle`)
const remove = (page, id) => page.locator(`ts-grid .chrome[data-id="${id}"] .remove`)
const resize = (page, id) => page.locator(`ts-grid .chrome[data-id="${id}"] .resize`)
const status = (page) => page.locator('ts-grid .sr')

// A click on desktop, a tap where the project has a touch screen.
async function press(page, locator) {
  if (test.info().project.use.hasTouch) await locator.tap()
  else await locator.click()
}

async function center(locator) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

// Focus, followed through shadow roots: the element that really has it.
const deepActive = (page) => page.evaluate(() => {
  let a = document.activeElement
  while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement
  if (!a) return null
  return { tag: a.localName, cls: a.className, id: a.closest?.('.chrome')?.dataset?.id ?? null, body: a === document.body }
})

// Whether focus sits inside aria-hidden or inert content, walking up through shadow hosts.
const focusHidden = (page) => page.evaluate(() => {
  let a = document.activeElement
  while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement
  const hidden = []
  for (let el = a; el; el = el.parentElement || (el.getRootNode() && el.getRootNode().host) || null) {
    if (el.matches && el.matches('[aria-hidden="true"], [inert]')) hidden.push(el.localName)
  }
  return hidden
})

// Edit mode through the keyboard door, the same on every engine.
async function startEditing(page) {
  await page.evaluate(() => { document.getElementById('g').editing = true })
  await expect.poll(() => editing(page)).toBe(true)
  await settle(page)
}

// A mouse long press on a tile; leaves the button down and the tile lifted.
async function longPressDown(page, id) {
  const c = await center(tile(page, id))
  await page.mouse.move(c.x, c.y)
  await page.mouse.down()
  await page.waitForTimeout(650)
}

// Touch pointer events, dispatched by hand: Playwright has no touch long press,
// and the grid listens to pointer events, not touch events, so these are what a finger sends.
async function touch(page, step) {
  await page.evaluate(({ type, target, x, y }) => {
    const g = document.getElementById('g')
    const el = target === 'window' ? window
      : target.tile ? g.querySelector(`[item="${target.tile}"]`)
        : g.shadowRoot.querySelector(`.chrome[data-id="${target.handle}"] .handle`)
    el.dispatchEvent(new PointerEvent(type, {
      pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1,
      clientX: x, clientY: y, bubbles: true, composed: true, cancelable: true,
    }))
  }, step)
}

test.describe('columns and implicit mode', () => {
  for (const [width, columns] of [[1300, 4], [900, 3], [420, 2]]) {
    test(`a ${width}px grid has ${columns} columns`, async ({ page }) => {
      await load(page, `&w=${width}`)
      expect(await page.evaluate(() => document.getElementById('g').columns)).toBe(columns)
      const seen = (await events(page)).filter((e) => e.type === 'ts-columns-change')
      expect(seen.at(-1).columns).toBe(columns)
      // The tiles fit the grid whatever the width.
      const fits = await page.evaluate(() => {
        const g = document.getElementById('g').getBoundingClientRect()
        return [...document.querySelectorAll('#g > [item]')].every((el) => {
          const r = el.getBoundingClientRect()
          return r.width > 0 && r.left >= g.left - 0.5 && r.right <= g.right + 0.5
        })
      })
      expect(fits).toBe(true)
    })
  }

  test('three children and no script beyond the import are placed without overlap', async ({ page }) => {
    await page.goto(PAGE)
    await page.waitForFunction(() => window.__ready === true && document.getElementById('g').columns > 0)
    await settle(page)
    // Nothing set data, a layout or a clock: the grid worked from the markup.
    expect(await page.evaluate(() => typeof window.__fx)).toBe('undefined')
    const rects = await page.evaluate(() => [...document.querySelectorAll('#g > [item]')].map((el) => {
      const r = el.getBoundingClientRect()
      return { id: el.getAttribute('item'), x: r.left, y: r.top, w: r.width, h: r.height }
    }))
    expect(rects.map((r) => r.id)).toEqual(['sales', 'notes', 'tasks'])
    for (const r of rects) {
      expect(r.w).toBeGreaterThan(0)
      expect(r.h).toBeGreaterThan(0)
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]
        const b = rects[j]
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
        expect(overlapX > 0.5 && overlapY > 0.5, `${a.id} overlaps ${b.id}`).toBe(false)
      }
    }
  })
})

test.describe('pointer', () => {
  test('a long press enters edit mode', async ({ page }) => {
    await load(page)
    await longPressDown(page, 'notes')
    await page.mouse.up()
    expect(await editing(page)).toBe(true)
    expect((await events(page)).filter((e) => e.type === 'ts-edit-change').map((e) => e.editing)).toEqual([true])
    // A press that ends before the delay is only a click.
    await page.evaluate(() => { document.getElementById('g').editing = false })
    const c = await center(tile(page, 'tasks'))
    await page.mouse.move(c.x, c.y)
    await page.mouse.down()
    await page.waitForTimeout(150)
    await page.mouse.up()
    expect(await editing(page)).toBe(false)
  })

  test('a drag fires exactly one move, and the event order is the screen order', async ({ page }) => {
    await load(page)
    await longPressDown(page, 'notes')
    const to = await center(tile(page, 'tasks'))
    await page.mouse.move(to.x + 20, to.y, { steps: 12 })
    await page.waitForTimeout(300)
    await page.mouse.up()
    await settle(page)
    const moves = await changes(page)
    expect(moves.map((e) => e.reason)).toEqual(['move'])
    expect(moves[0].id).toBe('notes')
    const shown = await onScreen(page)
    expect(moves[0].order).toEqual(shown)
    expect(shown).not.toEqual(START)
    expect([...shown].sort()).toEqual([...START].sort())
  })

  test('a mouse drag from the handle in edit mode moves a tile', async ({ page }) => {
    await load(page)
    await startEditing(page)
    const from = await center(handle(page, 'tasks'))
    const to = await center(tile(page, 'notes'))
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x - 20, to.y, { steps: 12 })
    await page.waitForTimeout(300)
    await page.mouse.up()
    await settle(page)
    const moves = await changes(page, 'move')
    expect(moves).toHaveLength(1)
    expect(moves[0].order).toEqual(await onScreen(page))
  })

  test('touch: a held finger enters edit mode and drags a tile', async ({ page }) => {
    await load(page)
    const from = await center(tile(page, 'notes'))
    const to = await center(tile(page, 'tasks'))
    await touch(page, { type: 'pointerdown', target: { tile: 'notes' }, ...from })
    await page.waitForTimeout(650)
    expect(await editing(page)).toBe(true)
    for (let i = 1; i <= 10; i++) {
      await touch(page, { type: 'pointermove', target: 'window', x: from.x + ((to.x + 20 - from.x) * i) / 10, y: from.y + ((to.y - from.y) * i) / 10 })
    }
    await page.waitForTimeout(300)
    await touch(page, { type: 'pointerup', target: 'window', x: to.x + 20, y: to.y })
    await settle(page)
    const moves = await changes(page)
    expect(moves.map((e) => e.reason)).toEqual(['move'])
    expect(moves[0].order).toEqual(await onScreen(page))
  })

  test('touch: in edit mode a short hold on a handle lifts the tile', async ({ page }) => {
    await load(page)
    await startEditing(page)
    const from = await center(handle(page, 'tasks'))
    const to = await center(tile(page, 'notes'))
    await touch(page, { type: 'pointerdown', target: { handle: 'tasks' }, ...from })
    await page.waitForTimeout(350)
    for (let i = 1; i <= 10; i++) {
      await touch(page, { type: 'pointermove', target: 'window', x: from.x + ((to.x - 20 - from.x) * i) / 10, y: from.y + ((to.y - from.y) * i) / 10 })
    }
    await page.waitForTimeout(300)
    await touch(page, { type: 'pointerup', target: 'window', x: to.x - 20, y: to.y })
    await settle(page)
    const moves = await changes(page, 'move')
    expect(moves).toHaveLength(1)
    expect(moves[0].order).toEqual(await onScreen(page))
  })

  test('resizing only yields sizes in the widget catalog', async ({ page }) => {
    await load(page)
    await startEditing(page)
    const seen = []
    // Keep the pointer inside the viewport: Firefox under Playwright drops a mouseup
    // released outside it, which would leave the resize gesture open.
    const view = page.viewportSize()
    const inView = (v, max) => Math.min(Math.max(v, 2), max - 2)
    // Pull each tile's corner big, then small, then tap it a few times.
    for (const id of ['sales', 'traffic', 'notes']) {
      for (const [dx, dy] of [[500, 400], [-600, -500]]) {
        const c = await center(resize(page, id))
        await page.mouse.move(c.x, c.y)
        await page.mouse.down()
        await page.mouse.move(inView(c.x + dx / 2, view.width), inView(c.y + dy / 2, view.height), { steps: 6 })
        await page.mouse.move(inView(c.x + dx, view.width), inView(c.y + dy, view.height), { steps: 6 })
        await page.waitForTimeout(200)
        await page.mouse.up()
        await settle(page)
      }
      for (let i = 0; i < 3; i++) {
        await resize(page, id).click()
        await settle(page)
      }
    }
    const resizes = await changes(page, 'resize')
    expect(resizes.length).toBeGreaterThan(3)
    for (const e of resizes) {
      seen.push(`${e.id}:${e.sizes[e.order.indexOf(e.id)]}`)
      expect(SIZES[e.id], `${e.id} resized to ${e.sizes[e.order.indexOf(e.id)]}`).toContain(e.sizes[e.order.indexOf(e.id)])
    }
    // Every tile is still a catalog size on screen.
    const shown = await page.evaluate(() => [...document.querySelectorAll('#g > [item]')].map((el) => [el.getAttribute('item'), el.getAttribute('size')]))
    for (const [id, size] of shown) expect(SIZES[id]).toContain(size)
    expect(new Set(seen).size).toBeGreaterThan(2)
  })

  test('a double-clicked remove fires once; Undo, undo() and Add back restore', async ({ page }) => {
    await load(page)
    await startEditing(page)

    await remove(page, 'notes').dblclick()
    await settle(page)
    expect((await changes(page, 'remove')).map((e) => e.id)).toEqual(['notes'])
    expect(await onScreen(page)).toEqual(START.filter((id) => id !== 'notes'))
    await expect(page.locator('ts-grid .toast')).toHaveClass(/on/)
    await expect(page.locator('ts-grid .toast .msg')).toHaveText('Notes removed')

    // The toast's Undo.
    await press(page, page.locator('ts-grid .toast .undo'))
    await settle(page)
    expect((await changes(page)).map((e) => e.reason)).toEqual(['remove', 'undo'])
    expect(await onScreen(page)).toEqual(START)

    // undo() from code. (A second remove inside 400 ms reads as a double-click and is ignored.)
    await page.waitForTimeout(450)
    await remove(page, 'tasks').click()
    await settle(page)
    expect(await onScreen(page)).toEqual(START.filter((id) => id !== 'tasks'))
    expect(await page.evaluate(() => document.getElementById('g').undo())).toBe(true)
    await settle(page)
    expect(await onScreen(page)).toEqual(START)
    expect(await page.evaluate(() => document.getElementById('g').undo())).toBe(false)

    // Add back from the pill.
    await page.waitForTimeout(450)
    await remove(page, 'queue').click()
    await settle(page)
    const pill = page.locator('ts-grid .pill')
    await expect(pill.locator('.add')).toContainText('Add back (1)')
    await press(page, pill.locator('.add'))
    await press(page, page.locator('ts-grid .pill .menu .mi'))
    await settle(page)
    const reasons = (await changes(page)).map((e) => e.reason)
    expect(reasons).toEqual(['remove', 'undo', 'remove', 'undo', 'remove', 'add'])
    expect([...(await onScreen(page))].sort()).toEqual([...START].sort())
    // Focus lands on the restored tile.
    expect((await deepActive(page)).id).toBe('queue')
  })

  test('Done leaves edit mode', async ({ page }) => {
    await load(page)
    await longPressDown(page, 'notes')
    await page.mouse.up()
    expect(await editing(page)).toBe(true)
    await press(page, page.locator('ts-grid .pill .done'))
    await expect.poll(() => editing(page)).toBe(false)
    expect((await events(page)).filter((e) => e.type === 'ts-edit-change').map((e) => e.editing)).toEqual([true, false])
    await expect(page.locator('ts-grid .pill')).toBeHidden()
    expect(await focusHidden(page)).toEqual([])
  })

  test('a tap outside the grid leaves edit mode; one inside the pill does not', async ({ page }) => {
    await load(page)
    await startEditing(page)
    // Open the Add back list's neighbour: a press on the pill itself keeps editing.
    const pillBox = await page.locator('ts-grid .pill').boundingBox()
    await page.mouse.move(pillBox.x + 3, pillBox.y + pillBox.height / 2)
    await page.mouse.down()
    await page.mouse.up()
    expect(await editing(page)).toBe(true)
    await press(page, page.locator('#outside'))
    await expect.poll(() => editing(page)).toBe(false)
    expect(await focusHidden(page)).toEqual([])
  })

  test('widths: dragging in a narrow grid still gives one move', async ({ page }) => {
    await load(page, '&w=420')
    await longPressDown(page, 'tasks')
    const to = await center(tile(page, 'notes'))
    await page.mouse.move(to.x - 10, to.y, { steps: 10 })
    await page.waitForTimeout(300)
    await page.mouse.up()
    await settle(page)
    const moves = await changes(page)
    expect(moves.map((e) => e.reason)).toEqual(['move'])
    expect(moves[0].order).toEqual(await onScreen(page))
  })
})

test.describe('locked', () => {
  test('a locked grid does not edit', async ({ page }) => {
    await load(page, '&locked')
    await longPressDown(page, 'notes')
    await page.mouse.up()
    expect(await editing(page)).toBe(false)
    expect((await events(page)).filter((e) => e.type === 'ts-edit-change')).toEqual([])
    // Setting editing is ignored (with a development warning, not an error).
    await page.evaluate(() => { document.getElementById('g').editing = true })
    await settle(page)
    expect(await editing(page)).toBe(false)
    await expect(page.locator('ts-grid .edit-btn')).toBeHidden()
    await expect(page.locator('ts-grid .pill')).toBeHidden()

    // Taking the lock off makes editing available again.
    await page.evaluate(() => document.getElementById('g').removeAttribute('locked'))
    await longPressDown(page, 'notes')
    await page.mouse.up()
    expect(await editing(page)).toBe(true)

    // Locking while editing ends it.
    await page.evaluate(() => document.getElementById('g').setAttribute('locked', ''))
    await expect.poll(() => editing(page)).toBe(false)
  })
})

test.describe('keyboard', () => {
  async function tabToHandle(page, id) {
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab')
      if ((await deepActive(page))?.id === id) return
    }
    throw new Error(`Tab never reached ${id}`)
  }

  test('Tab, Enter, Space, arrows, Escape, Delete and Done', async ({ page }) => {
    await load(page)
    // Tab reaches Edit layout first.
    await page.keyboard.press('Tab')
    expect((await deepActive(page)).cls).toContain('edit-btn')
    await page.keyboard.press('Enter')
    await expect.poll(() => editing(page)).toBe(true)
    await expect(status(page)).toHaveText('Editing layout, 5 tiles. Tab to a tile, Space to pick it up.')

    // Space lifts; the arrow moves; the position is announced.
    await tabToHandle(page, 'notes')
    await expect(handle(page, 'notes')).toHaveAccessibleName(/^Notes, S, position 2 of 5/)
    await page.keyboard.press('Space')
    await expect(status(page)).toContainText('Notes, picked up.')
    await page.keyboard.press('ArrowRight')
    await expect(status(page)).toContainText('Notes, moved to position')
    const moved = await onScreen(page)
    expect(moved).not.toEqual(START)

    // Escape puts it back, and nothing was committed.
    await page.keyboard.press('Escape')
    await expect(status(page)).toContainText('Notes, move cancelled.')
    expect(await onScreen(page)).toEqual(START)
    expect(await changes(page)).toEqual([])
    expect(await editing(page)).toBe(true)

    // Move and drop: one commit, in the order on screen.
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Space')
    await expect(status(page)).toContainText('Notes, dropped')
    const dropped = await changes(page)
    expect(dropped.map((e) => e.reason)).toEqual(['move'])
    expect(dropped[0].order).toEqual(await onScreen(page))

    // Delete removes, once even when pressed twice.
    await page.keyboard.press('Delete')
    await page.keyboard.press('Delete')
    await settle(page)
    expect((await changes(page, 'remove')).map((e) => e.id)).toEqual(['notes'])
    // The toast speaks the removal, so the status region does not say it twice.
    await expect(page.locator('ts-grid .toast .msg')).toHaveText('Notes removed')

    // Done hands focus back to where editing began.
    await page.locator('ts-grid .pill .done').focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => editing(page)).toBe(false)
    expect((await deepActive(page)).cls).toContain('edit-btn')
    expect(await focusHidden(page)).toEqual([])
  })

  test('Escape on an idle handle leaves edit mode and focus stays visible', async ({ page }) => {
    await load(page)
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await expect.poll(() => editing(page)).toBe(true)
    await tabToHandle(page, 'sales')
    await page.keyboard.press('Escape')
    await expect.poll(() => editing(page)).toBe(false)
    expect(await focusHidden(page)).toEqual([])
    expect((await deepActive(page)).body).toBe(false)
  })

  test('plus and minus resize the focused tile to catalog sizes', async ({ page }) => {
    await load(page)
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await tabToHandle(page, 'traffic')
    await page.keyboard.press('+')
    await expect(status(page)).toContainText('Traffic, size')
    await page.keyboard.press('-')
    await page.keyboard.press('-')
    await settle(page)
    const resizes = await changes(page, 'resize')
    expect(resizes.length).toBeGreaterThanOrEqual(2)
    for (const e of resizes) expect(SIZES.traffic).toContain(e.sizes[e.order.indexOf('traffic')])
  })
})

// A point on the bare board (no tile, chrome or button over it), or null.
const bareBoard = (page) => page.evaluate(() => {
  const g = document.getElementById('g')
  const r = g.getBoundingClientRect()
  for (let y = r.top + 4; y < r.bottom; y += 6) {
    for (let x = r.left + 4; x < r.right; x += 6) {
      const hit = g.shadowRoot.elementFromPoint(x, y)
      if (hit && hit.classList.contains('board') && y > 0 && y < innerHeight && x < innerWidth) return { x, y }
    }
  }
  return null
})

test.describe('tap-to-place', () => {
  test('clicks alone move a tile, and focus is not left in hidden content after Done', async ({ page }) => {
    await load(page)
    await startEditing(page)
    // Pick up, then tap another tile: the first goes there and drops.
    await press(page, handle(page, 'tasks'))
    await expect(status(page)).toContainText('Tasks, picked up.')
    await press(page, handle(page, 'sales'))
    await settle(page)
    const moves = await changes(page)
    expect(moves.map((e) => e.reason)).toEqual(['move'])
    expect(moves[0].id).toBe('tasks')
    const shown = await onScreen(page)
    expect(shown[0]).toBe('tasks')
    // The saved order is the list's; on a narrow grid a short tile can fill a gap beside an earlier one,
    // so reading order on screen can differ from it. The tapped tile still comes first in both.
    expect(moves[0].order[0]).toBe('tasks')
    expect([...moves[0].order].sort()).toEqual([...START].sort())

    // Tapping the held tile drops it with no change; a tap on empty board cancels.
    await press(page, handle(page, 'notes'))
    await press(page, handle(page, 'notes'))
    await expect(status(page)).toContainText('Notes, dropped')
    expect(await changes(page, 'move')).toHaveLength(1)
    await press(page, handle(page, 'queue'))
    await expect(status(page)).toContainText('Queue, picked up.')
    const bare = await bareBoard(page)
    expect(bare, 'the fixture leaves some board uncovered').not.toBeNull()
    await page.mouse.click(bare.x, bare.y)
    await expect(status(page)).toContainText('Queue, move cancelled.')
    expect(await changes(page, 'move')).toHaveLength(1)

    await press(page, page.locator('ts-grid .pill .done'))
    await expect.poll(() => editing(page)).toBe(false)
    expect(await focusHidden(page)).toEqual([])
    // Tiles that were inert while editing are interactive again.
    expect(await page.evaluate(() => [...document.querySelectorAll('#g > [item]')].some((el) => el.hasAttribute('inert')))).toBe(false)
  })
})
