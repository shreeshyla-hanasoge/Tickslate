// <ts-grid> editing edge cases in real engines (RFC 0002 §1.5, §5.5, §5.9):
// implicit-mode reconcile after a framework re-render, the ways tap-to-place
// ends without a move, and the outside-tap exit through nested shadow roots.
// The paths here are the ones a node test can't reach: they need real
// MutationObserver timing, real focus and real pointer events.
import { test, expect } from '@playwright/test'

const PAGE = '/test/browser/fixtures/grid.html'

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

// Two frames: the grid places tiles on the frame after a layout or a child change.
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
const editing = (page) => page.evaluate(() => document.getElementById('g').editing)

// The fixture records grid events only in explicit mode, so implicit pages
// record their own, from before the page's scripts run.
const RECORDER = () => {
  window.__seen = []
  for (const name of ['ts-layout-change', 'ts-edit-change']) {
    document.addEventListener(name, (e) => window.__seen.push({ type: name, reason: e.detail.reason, id: e.detail.id, editing: e.detail.editing, order: e.detail.items && e.detail.items.map((item) => item.id) }))
  }
}
const seen = (page, type) => page.evaluate((t) => window.__seen.filter((e) => e.type === t), type)

// Implicit mode: markup alone, three children (sales, notes, tasks).
async function loadImplicit(page) {
  await page.addInitScript(RECORDER)
  await page.goto(PAGE)
  await page.waitForFunction(() => window.__ready === true && document.getElementById('g').columns > 0)
  await settle(page)
}

// Explicit mode, five tiles, events recorded by the fixture.
async function loadExplicit(page) {
  await page.goto(`${PAGE}?mode=explicit`)
  await page.waitForFunction(() => window.__ready === true)
  await settle(page)
  await page.evaluate(RECORDER)
}

// The grid's own list, in its order: the source of truth in implicit mode.
const listed = (page) => page.evaluate(() => {
  const g = document.getElementById('g')
  return g.layout.profiles[g.profile].map((item) => item.id)
})
const hiddenIds = (page) => page.evaluate(() => document.getElementById('g').hiddenItems.map((h) => h.id))
// Tiles that take part in the layout: shown, and not hidden by the grid.
const shownIds = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#g > [item]')].filter((el) => el.style.display !== 'none').map((el) => el.getAttribute('item')).sort())

const handle = (page, id) => page.locator(`#g >> .chrome[data-id="${id}"] .handle`)
const remove = (page, id) => page.locator(`#g >> .chrome[data-id="${id}"] .remove`)
const resize = (page, id) => page.locator(`#g >> .chrome[data-id="${id}"] .resize`)
const status = (page) => page.locator('#g >> .sr')

// A click on desktop, a tap where the project has a touch screen.
async function press(page, locator) {
  if (test.info().project.use.hasTouch) await locator.tap()
  else await locator.click()
}

async function startEditing(page, id = 'g') {
  await page.evaluate((i) => { document.getElementById(i).editing = true }, id)
  await expect.poll(() => editing(page)).toBe(true)
  await settle(page)
}

// Focus, followed through shadow roots.
const focusHidden = (page) => page.evaluate(() => {
  let a = document.activeElement
  while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement
  const hidden = []
  for (let el = a; el; el = el.parentElement || (el.getRootNode() && el.getRootNode().host) || null) {
    if (el.matches && el.matches('[aria-hidden="true"], [inert]')) hidden.push(el.localName)
  }
  return hidden
})

test.describe('implicit mode: a framework re-renders the children', () => {
  // The user's move, by tap-to-place so every engine and input does the same thing.
  async function moveTasksFirst(page) {
    await startEditing(page)
    await press(page, handle(page, 'tasks'))
    await press(page, handle(page, 'sales'))
    await settle(page)
    expect(await listed(page)).toEqual(['tasks', 'sales', 'notes'])
    expect((await seen(page, 'ts-layout-change')).map((e) => e.reason)).toEqual(['move'])
  }

  test('a re-render after a drag leaves the dragged order alone', async ({ page }) => {
    await loadImplicit(page)
    await moveTasksFirst(page)

    // What a patching framework does: re-set every attribute it owns, then put
    // the children back in its own order. Neither may undo the user's move.
    await page.evaluate(() => {
      const g = document.getElementById('g')
      const byId = Object.fromEntries([...g.children].map((el) => [el.getAttribute('item'), el]))
      for (const el of g.children) {
        el.setAttribute('label', el.getAttribute('label'))
        el.setAttribute('size', el.getAttribute('size'))
        el.setAttribute('item', el.getAttribute('item'))
      }
      g.append(byId.sales, byId.notes, byId.tasks)
    })
    await settle(page)
    expect(await listed(page)).toEqual(['tasks', 'sales', 'notes'])
    expect(await page.evaluate(() => [...document.getElementById('g').children].map((el) => el.getAttribute('item')))).toEqual(['sales', 'notes', 'tasks'])
    // The framework's own writes are not edits: no event, and the grid is still editing.
    expect((await seen(page, 'ts-layout-change')).map((e) => e.reason)).toEqual(['move'])
    expect(await editing(page)).toBe(true)

    // Fresh elements with the same ids, as an unkeyed re-render creates them.
    await page.evaluate(() => {
      const g = document.getElementById('g')
      const fresh = [...g.children].map((el) => el.cloneNode(true))
      g.replaceChildren(...fresh)
    })
    await settle(page)
    expect(await listed(page)).toEqual(['tasks', 'sales', 'notes'])
    expect(await shownIds(page)).toEqual(['notes', 'sales', 'tasks'])
    // Every tile is on the board and has its chrome: the new nodes were adopted.
    await expect(page.locator('#g >> .chrome')).toHaveCount(3)
    expect((await seen(page, 'ts-layout-change')).map((e) => e.reason)).toEqual(['move'])
  })

  test('a re-render after a real pointer drag keeps the order the drag made', async ({ page }) => {
    await loadImplicit(page)
    // A mouse long press lifts the tile, then it is dragged onto another.
    const center = async (id) => {
      const box = await page.locator(`#g > [item="${id}"]`).boundingBox()
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    }
    const from = await center('tasks')
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.waitForTimeout(650)
    const to = await center('sales')
    await page.mouse.move(to.x + 20, to.y, { steps: 12 })
    await page.waitForTimeout(300)
    await page.mouse.up()
    await settle(page)
    const [drag] = await seen(page, 'ts-layout-change')
    expect(drag.reason).toBe('move')
    const dragged = await listed(page)
    expect(dragged).toEqual(drag.order)
    expect(dragged).not.toEqual(['sales', 'notes', 'tasks'])

    // The framework re-renders every child in its own order.
    await page.evaluate(() => {
      const g = document.getElementById('g')
      for (const el of g.children) el.setAttribute('label', el.getAttribute('label'))
      g.append(g.querySelector('[item="sales"]'), g.querySelector('[item="notes"]'), g.querySelector('[item="tasks"]'))
    })
    await settle(page)
    expect(await listed(page)).toEqual(dragged)
    expect((await seen(page, 'ts-layout-change')).length).toBe(1)
  })

  test('a tile inserted before the others joins at the end of the list', async ({ page }) => {
    await loadImplicit(page)
    await moveTasksFirst(page)

    await page.evaluate(() => {
      const g = document.getElementById('g')
      const card = document.createElement('ts-card')
      card.setAttribute('label', 'Reports')
      card.setAttribute('size', 'S')
      // First in the DOM; the grid's list still puts it last (§1.5, rule 6).
      g.insertBefore(card, g.firstElementChild)
    })
    await settle(page)
    const list = await listed(page)
    expect(list.slice(0, 3)).toEqual(['tasks', 'sales', 'notes'])
    expect(list).toHaveLength(4)
    // The generated id is written back, so the next read finds the same one.
    const written = await page.evaluate(() => document.getElementById('g').firstElementChild.getAttribute('item'))
    expect(written).toBe(list[3])
    await expect(page.locator('#g >> .chrome')).toHaveCount(4)

    // A second insert, in the middle, with no item either: a different id, again last.
    await page.evaluate(() => {
      const g = document.getElementById('g')
      const card = document.createElement('ts-card')
      card.setAttribute('label', 'Alerts')
      card.setAttribute('size', 'S')
      g.insertBefore(card, g.children[2])
    })
    await settle(page)
    const next = await listed(page)
    expect(next.slice(0, 4)).toEqual(list)
    expect(next).toHaveLength(5)
    expect(new Set(next).size).toBe(5)
    // Inserting is the host's business, not an edit.
    expect((await seen(page, 'ts-layout-change')).map((e) => e.reason)).toEqual(['move'])
  })

  test('a removed tile stays removed through a re-render until it is restored', async ({ page }) => {
    await loadImplicit(page)
    await moveTasksFirst(page)

    await page.waitForTimeout(450)
    await remove(page, 'notes').click()
    await settle(page)
    expect(await listed(page)).toEqual(['tasks', 'sales'])
    expect(await hiddenIds(page)).toEqual(['notes'])

    // The framework still renders the child, as it knows nothing of the removal.
    await page.evaluate(() => {
      const g = document.getElementById('g')
      for (const el of g.children) el.setAttribute('label', el.getAttribute('label'))
      g.append(...[...g.children])
    })
    await settle(page)
    expect(await listed(page)).toEqual(['tasks', 'sales'])
    expect(await hiddenIds(page)).toEqual(['notes'])
    expect(await page.evaluate(() => document.querySelector('#g > [item="notes"]').style.display)).toBe('none')

    // Fresh elements, again: still removed. Only restore() brings it back, at the end.
    await page.evaluate(() => {
      const g = document.getElementById('g')
      g.replaceChildren(...[...g.children].map((el) => el.cloneNode(true)))
    })
    await settle(page)
    expect(await listed(page)).toEqual(['tasks', 'sales'])
    expect(await page.evaluate(() => document.getElementById('g').restore('notes'))).toBe(true)
    await settle(page)
    expect(await listed(page)).toEqual(['tasks', 'sales', 'notes'])
    expect(await hiddenIds(page)).toEqual([])
    expect(await page.evaluate(() => document.getElementById('g').restore('notes'))).toBe(false)
  })

  test('a child that leaves the DOM is dropped, and comes back at the end', async ({ page }) => {
    await loadImplicit(page)
    await moveTasksFirst(page)

    const gone = await page.evaluate(() => {
      const el = document.querySelector('#g > [item="tasks"]')
      el.remove()
      window.__gone = el
      return true
    })
    expect(gone).toBe(true)
    await settle(page)
    expect(await listed(page)).toEqual(['sales', 'notes'])
    await expect(page.locator('#g >> .chrome')).toHaveCount(2)

    // The same element returns at the top of the DOM: a newcomer, so last in the list.
    await page.evaluate(() => {
      const g = document.getElementById('g')
      g.insertBefore(window.__gone, g.firstElementChild)
    })
    await settle(page)
    expect(await listed(page)).toEqual(['sales', 'notes', 'tasks'])
    await expect(page.locator('#g >> .chrome')).toHaveCount(3)
    // A child leaving is not an edit the user made, so no removal toast or event.
    expect((await seen(page, 'ts-layout-change')).map((e) => e.reason)).toEqual(['move'])
  })

  test('a host resize still applies after the user has moved tiles', async ({ page }) => {
    await loadImplicit(page)
    await moveTasksFirst(page)
    // Only a value that differs from the grid's own last write is the host's resize.
    await page.evaluate(() => document.querySelector('#g > [item="notes"]').setAttribute('size', 'Wide'))
    await settle(page)
    const size = await page.evaluate(() => {
      const g = document.getElementById('g')
      return g.layout.profiles[g.profile].find((item) => item.id === 'notes').size
    })
    expect(size).toBe('Wide')
    expect(await listed(page)).toEqual(['tasks', 'sales', 'notes'])
  })
})

test.describe('tap-to-place: every way out of a held tile', () => {
  const moves = async (page) => (await seen(page, 'ts-layout-change')).filter((e) => e.reason === 'move')

  // After any way out, the next tap on a handle picks that tile up fresh: the
  // grid must not still think the old tile is held and move it.
  async function expectFresh(page) {
    await press(page, handle(page, 'queue'))
    await expect(status(page)).toContainText('Queue, picked up.')
    expect(await moves(page)).toEqual([])
    await page.keyboard.press('Escape')
    await expect(status(page)).toContainText('Queue, move cancelled.')
  }

  test('Escape cancels the held tile and keeps editing', async ({ page }) => {
    await loadExplicit(page)
    await startEditing(page)
    await press(page, handle(page, 'tasks'))
    await expect(status(page)).toContainText('Tasks, picked up.')
    await page.keyboard.press('Escape')
    await expect(status(page)).toContainText('Tasks, move cancelled.')
    expect(await editing(page)).toBe(true)
    expect(await moves(page)).toEqual([])
    await expectFresh(page)
    // With nothing held, Escape leaves edit mode.
    await page.keyboard.press('Escape')
    await expect.poll(() => editing(page)).toBe(false)
  })

  test('Done while holding ends editing with no move, and nothing stays held', async ({ page }) => {
    await loadExplicit(page)
    await startEditing(page)
    await press(page, handle(page, 'tasks'))
    await expect(status(page)).toContainText('Tasks, picked up.')
    await press(page, page.locator('#g >> .pill .done'))
    await expect.poll(() => editing(page)).toBe(false)
    expect(await moves(page)).toEqual([])
    expect(await focusHidden(page)).toEqual([])
    await settle(page)
    await startEditing(page)
    await expectFresh(page)
  })

  test('a tap outside the grid while holding ends editing with no move', async ({ page }) => {
    await loadExplicit(page)
    await startEditing(page)
    await press(page, handle(page, 'tasks'))
    await expect(status(page)).toContainText('Tasks, picked up.')
    await press(page, page.locator('#outside'))
    await expect.poll(() => editing(page)).toBe(false)
    expect(await moves(page)).toEqual([])
    expect(await focusHidden(page)).toEqual([])
    // The tile is back where it was, with no lifted state left behind.
    expect(await page.evaluate(() => document.querySelector('#g > [item="tasks"]').style.zIndex)).toBe('')
    await startEditing(page)
    await expectFresh(page)
  })

  test('locking the grid while holding ends editing with no move', async ({ page }) => {
    await loadExplicit(page)
    await startEditing(page)
    await press(page, handle(page, 'tasks'))
    await expect(status(page)).toContainText('Tasks, picked up.')
    await page.evaluate(() => document.getElementById('g').setAttribute('locked', ''))
    await expect.poll(() => editing(page)).toBe(false)
    expect(await moves(page)).toEqual([])
    await page.evaluate(() => document.getElementById('g').removeAttribute('locked'))
    await startEditing(page)
    await expectFresh(page)
  })

  test('undo() from code while holding drops the hold without a move', async ({ page }) => {
    await loadExplicit(page)
    await startEditing(page)
    // Something to undo: one resize through the button.
    await resize(page, 'queue').click()
    await settle(page)
    await press(page, handle(page, 'tasks'))
    await expect(status(page)).toContainText('Tasks, picked up.')
    expect(await page.evaluate(() => document.getElementById('g').undo())).toBe(true)
    await settle(page)
    expect(await moves(page)).toEqual([])
    // Not holding any more: the next handle tap picks up rather than places.
    await expectFresh(page)
  })

  test('remove and resize taps are ignored while holding, and the hold survives', async ({ page }) => {
    await loadExplicit(page)
    await startEditing(page)
    await press(page, handle(page, 'tasks'))
    await expect(status(page)).toContainText('Tasks, picked up.')
    const before = await page.evaluate(() => JSON.stringify(document.getElementById('g').layout))
    await press(page, remove(page, 'notes'))
    await press(page, resize(page, 'notes'))
    await settle(page)
    expect(await page.evaluate(() => JSON.stringify(document.getElementById('g').layout))).toBe(before)
    expect((await seen(page, 'ts-layout-change'))).toEqual([])
    // Still held: tapping another tile now places the held one.
    await press(page, handle(page, 'sales'))
    await settle(page)
    const placed = await moves(page)
    expect(placed.map((e) => e.id)).toEqual(['tasks'])
  })

  test('tapping the held tile twice drops it, then picks it up again', async ({ page }) => {
    await loadExplicit(page)
    await startEditing(page)
    await press(page, handle(page, 'notes'))
    await expect(status(page)).toContainText('Notes, picked up.')
    await press(page, handle(page, 'notes'))
    await expect(status(page)).toContainText('Notes, dropped')
    expect(await moves(page)).toEqual([])
    await press(page, handle(page, 'notes'))
    await expect(status(page)).toContainText('Notes, picked up.')
    await press(page, handle(page, 'notes'))
    await expect(status(page)).toContainText('Notes, dropped')
    expect(await moves(page)).toEqual([])
  })
})

// A grid two shadow roots down, and other grids and buttons in other shadow
// roots around it. Built here, since no fixture nests shadow roots.
async function nest(page) {
  await page.evaluate(() => {
    const card = (id, label) => `<ts-card item="${id}" label="${label}" size="S"><span slot="value">1</span></ts-card>`
    const mount = document.querySelector('main')

    class Inner extends HTMLElement {
      connectedCallback() {
        if (this.shadowRoot) return
        const root = this.attachShadow({ mode: 'open' })
        root.innerHTML =
          '<div class="stack"><ts-grid class="ng" aria-label="Nested dashboard">' + card('a', 'Alpha') + card('b', 'Beta') + '</ts-grid>' +
          '<button type="button" class="inner-outside">Inner outside</button>' +
          '<ts-grid class="other" aria-label="Other dashboard">' + card('c', 'Gamma') + '</ts-grid></div>'
      }
    }
    class Outer extends HTMLElement {
      connectedCallback() {
        if (this.shadowRoot) return
        const root = this.attachShadow({ mode: 'open' })
        root.innerHTML = '<section><button type="button" class="outer-outside">Outer outside</button><x-inner></x-inner></section>'
      }
    }
    customElements.define('x-inner', Inner)
    customElements.define('x-outer', Outer)
    const outer = document.createElement('x-outer')
    outer.id = 'outer'
    mount.append(outer)
    // Nothing else on the page may compete for the taps.
    document.getElementById('g').remove()
  })
  await page.waitForFunction(() => {
    const ng = document.querySelector('#outer').shadowRoot.querySelector('x-inner').shadowRoot.querySelector('.ng')
    return ng && ng.columns > 0
  })
  await settle(page)
}

test.describe('outside tap through nested shadow roots', () => {
  const grid = (page) => page.locator('#outer >> x-inner >> .ng')
  const isEditing = (page) => page.evaluate(() => document.querySelector('#outer').shadowRoot.querySelector('x-inner').shadowRoot.querySelector('.ng').editing)

  async function startNested(page) {
    await page.evaluate(() => { document.querySelector('#outer').shadowRoot.querySelector('x-inner').shadowRoot.querySelector('.ng').editing = true })
    await expect.poll(() => isEditing(page)).toBe(true)
    await settle(page)
  }

  test('taps inside the nested grid keep editing; taps anywhere else leave it', async ({ page }) => {
    await page.addInitScript(RECORDER)
    await page.goto(PAGE)
    await page.waitForFunction(() => window.__ready === true && document.getElementById('g').columns > 0)
    await nest(page)

    const outsides = [
      ['a button beside it in the same shadow root', () => page.locator('#outer >> x-inner >> .inner-outside')],
      ['a button in the enclosing shadow root', () => page.locator('#outer >> .outer-outside')],
      // Not editing, so its handles take no pointer: the tap lands on its tile.
      ['another grid in the same shadow root', () => page.locator('#outer >> x-inner >> .other >> ts-card')],
      ['a button in the light DOM', () => page.locator('#outside')],
    ]
    for (const [name, target] of outsides) {
      await startNested(page)
      // Inside first: the pill's edge and a tile's handle are the grid's own.
      const pill = await grid(page).locator('.pill').boundingBox()
      await page.mouse.move(pill.x + 3, pill.y + pill.height / 2)
      await page.mouse.down()
      await page.mouse.up()
      expect(await isEditing(page), `a press on the pill, before ${name}`).toBe(true)
      await press(page, grid(page).locator('.chrome[data-id="a"] .handle'))
      expect(await isEditing(page), `a tap on a handle, before ${name}`).toBe(true)
      await expect(grid(page).locator('.sr')).toContainText('Alpha, picked up.')

      // Outside: editing ends, the hold goes with it and focus is not stranded.
      await press(page, target())
      await expect.poll(() => isEditing(page), name).toBe(false)
      expect(await focusHidden(page), name).toEqual([])
      await settle(page)
    }
    // No tap of any of these was an edit.
    expect(await seen(page, 'ts-layout-change')).toEqual([])
  })

  // KNOWN GAP, reported as a src follow-up (this story touches no src/). The
  // document-level pointerdown listener sees a composedPath() that stops at the
  // closed root's host, so isOutside() reads every tap inside the grid as outside.
  test.fixme('a grid in a closed shadow root: a tap inside it does not end editing', async ({ page }) => {
    await page.addInitScript(RECORDER)
    await page.goto(PAGE)
    await page.waitForFunction(() => window.__ready === true && document.getElementById('g').columns > 0)
    await page.evaluate(() => {
      const host = document.createElement('div')
      host.id = 'closed'
      const root = host.attachShadow({ mode: 'closed' })
      root.innerHTML = '<ts-grid aria-label="Closed dashboard"><ts-card item="a" label="Alpha" size="S"><span slot="value">1</span></ts-card></ts-grid>'
      document.querySelector('main').append(host)
      window.__closedGrid = root.firstElementChild
      document.getElementById('g').remove()
    })
    await page.waitForFunction(() => window.__closedGrid.columns > 0)
    await settle(page)
    await page.evaluate(() => { window.__closedGrid.editing = true })
    await settle(page)
    // Playwright pierces open roots only, so the tap goes where the handle is.
    const box = await page.evaluate(() => {
      const r = window.__closedGrid.shadowRoot.querySelector('.chrome .handle').getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })
    if (test.info().project.use.hasTouch) await page.touchscreen.tap(box.x, box.y)
    else await page.mouse.click(box.x, box.y)
    await settle(page)
    expect(await page.evaluate(() => window.__closedGrid.editing)).toBe(true)
  })
})
