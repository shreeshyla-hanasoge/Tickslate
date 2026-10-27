// Reading and Tab order follow the layout outside edit mode (RFC 0003 §11): the
// grid slots one slot per visible tile in visual order and never moves a host
// node. Checked in real engines: Tab order, the accessibility tree, the host's
// untouched child list, the single-slot fallback and the event.
import { test, expect } from '@playwright/test'

const PAGE = '/test/browser/fixtures/grid.html'
const START = ['sales', 'notes', 'tasks', 'traffic', 'queue']

let errors
test.beforeEach(async ({ page }) => {
  errors = []
  // Network off: only the dev server answers.
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (error) => errors.push(error.message))
  // The order event, from before the grid exists, so the first one can't be missed.
  await page.addInitScript(() => {
    window.__orderEvents = []
    document.addEventListener('ts-reading-order-change', (e) => window.__orderEvents.push({ order: e.detail.order, bubbles: e.bubbles, composed: e.composed }))
    // Both events in the order they arrive, to check which comes first at Done.
    window.__sequence = []
    for (const name of ['ts-reading-order-change', 'ts-edit-change']) document.addEventListener(name, () => window.__sequence.push(name))
  })
})
test.afterEach(() => {
  expect(errors).toEqual([])
})

// Two frames: the grid places tiles on the frame after a layout or a size change.
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

async function load(page, query = '?mode=explicit') {
  await page.goto(`${PAGE}${query}`)
  await page.waitForFunction(() => window.__ready === true)
  await settle(page)
  await prepare(page)
}

// Tiles take focus themselves, so Tab has a stop in each, and so do the buttons around the grid, which WebKit's Tab
// skips without a tabindex. `before` is where every Tab walk starts, whatever an earlier one left focused.
async function prepare(page) {
  await page.evaluate(() => {
    if (!document.getElementById('before')) document.body.insertAdjacentHTML('afterbegin', '<button id="before" type="button">Before</button>')
    document.querySelectorAll('#g > [item], #outside, #before').forEach((el) => el.setAttribute('tabindex', '0'))
  })
}
const fromTop = (page) => page.evaluate(() => {
  window.scrollTo(0, 0)
  document.getElementById('before').focus()
})

// Tile ids as they sit on screen, by the translate the grid wrote.
const onScreen = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#g > [item]')]
    .filter((el) => el.getBoundingClientRect().width > 0)
    .map((el) => {
      const [x, y = 0] = el.style.translate.split(' ').map(parseFloat)
      return { id: el.getAttribute('item'), x, y }
    })
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((t) => t.id))

const readingOrder = (page) => page.evaluate(() => [...document.getElementById('g').readingOrder])
const orderEvents = (page) => page.evaluate(() => window.__orderEvents)
const hostIds = (page) => page.evaluate(() => [...document.getElementById('g').children].map((el) => el.getAttribute('item')))
// The flat tree, which the accessibility tree and Tab follow: each tile slot in turn, and what it holds.
const flat = (page) => page.evaluate(() =>
  [...document.getElementById('g').shadowRoot.querySelectorAll('.board > slot')]
    .flatMap((slot) => slot.assignedElements().map((el) => el.getAttribute('item')))
    .filter(Boolean))
const slotCount = (page) => page.evaluate(() => document.getElementById('g').shadowRoot.querySelectorAll('.board > slot').length)

// Every tile that Tab reaches, from the top of the page to the button after the grid.
async function tabOrder(page) {
  await fromTop(page)
  const seen = []
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab')
    const id = await page.evaluate(() => (document.activeElement.id === 'outside' ? 'outside' : document.activeElement.getAttribute('item')))
    if (id === 'outside') return seen
    // A chart has a stop of its own inside it, its scrubber (RFC 0004 §1.4), which reads as the same tile: one entry per run.
    if (id && seen[seen.length - 1] !== id) seen.push(id)
  }
  throw new Error(`Tab never left the grid: ${seen}`)
}

// The tiles in the accessibility tree, in the order it lists them. Tiles are named by their label.
async function treeOrder(page, labels) {
  const snapshot = await page.getByRole('region', { name: 'Dashboard' }).ariaSnapshot()
  const at = (label) => snapshot.indexOf(label)
  const found = Object.entries(labels).filter(([, label]) => at(label) >= 0)
  return found.sort((a, b) => at(a[1]) - at(b[1])).map(([id]) => id)
}
const LABELS = { sales: 'Sales', notes: 'Notes', tasks: 'Tasks', traffic: 'Traffic', queue: 'Queue' }

const deepActive = (page) => page.evaluate(() => {
  let a = document.activeElement
  while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement
  return a ? { cls: a.className, id: a.closest?.('.chrome')?.dataset?.id ?? null } : null
})

async function startEditing(page) {
  await page.evaluate(() => { document.getElementById('g').editing = true })
  await expect.poll(() => page.evaluate(() => document.getElementById('g').editing)).toBe(true)
  await settle(page)
}
const done = async (page) => {
  await page.evaluate(() => { document.getElementById('g').editing = false })
  await settle(page)
}

// Tab, in edit mode, to a tile's handle.
async function tabToHandle(page, id) {
  await fromTop(page)
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab')
    if ((await deepActive(page))?.id === id) return
  }
  throw new Error(`Tab never reached ${id}`)
}

// Push the held tile with the arrow keys until it sits at `index` among the tiles on screen. At two columns a wide
// tile only moves down, so the key follows the column count.
async function push(page, id, index) {
  const key = (await page.evaluate(() => document.getElementById('g').columns)) === 2 ? 'ArrowDown' : 'ArrowRight'
  for (let i = 0; i < 8 && (await onScreen(page)).indexOf(id) < index; i++) await page.keyboard.press(key)
}

// Move a tile with the keyboard, the way a user does: Tab to its handle, Space, arrows, Space.
async function moveWithKeyboard(page, id, index) {
  await startEditing(page)
  await tabToHandle(page, id)
  await page.keyboard.press('Space')
  await push(page, id, index)
  await page.keyboard.press('Space')
  await settle(page)
}

test.describe('reading order after a move', () => {
  test('Tab and the accessibility tree follow the new placement, and the host DOM does not change', async ({ page }) => {
    await load(page)
    expect(await tabOrder(page)).toEqual(START)
    expect(await treeOrder(page, LABELS)).toEqual(START)
    expect(await readingOrder(page)).toEqual(START)
    expect(await slotCount(page)).toBeGreaterThanOrEqual(START.length)

    // Count what happens to the host's children from here on.
    await page.evaluate(() => {
      window.__records = []
      new MutationObserver((records) => window.__records.push(...records.map((r) => r.type))).observe(document.getElementById('g'), { childList: true })
    })
    const domBefore = await hostIds(page)

    // Sales, the first tile, goes to third place.
    await moveWithKeyboard(page, 'sales', 2)
    await done(page)

    const moved = await onScreen(page)
    expect(moved).not.toEqual(START)
    expect(moved.indexOf('sales')).toBeGreaterThanOrEqual(2)
    expect(await readingOrder(page)).toEqual(moved)
    expect(await flat(page)).toEqual(moved)
    expect(await treeOrder(page, LABELS)).toEqual(moved)
    expect(await tabOrder(page)).toEqual(moved)

    // The host's children are where the host left them, and nothing moved them.
    expect(await hostIds(page)).toEqual(domBefore)
    expect(await page.evaluate(() => window.__records)).toEqual([])
  })

  test('twenty moves leave the host DOM alone and framework patches still land', async ({ page }) => {
    await load(page)
    await page.evaluate(() => {
      window.__records = []
      new MutationObserver((records) => window.__records.push(...records.map((r) => r.type))).observe(document.getElementById('g'), { childList: true })
    })
    const domBefore = await hostIds(page)

    // Twenty rearrangements outside edit mode, each a rotation of the layout.
    for (let i = 0; i < 20; i++) {
      await page.evaluate(() => {
        const g = document.getElementById('g')
        const items = g.layout.profiles.market
        g.layout = [...items.slice(1), items[0]]
      })
      await settle(page)
      const shown = await onScreen(page)
      expect(await readingOrder(page)).toEqual(shown)
      expect(await flat(page)).toEqual(shown)
    }
    expect(await hostIds(page)).toEqual(domBefore)
    expect(await page.evaluate(() => window.__records)).toEqual([])
    expect(await tabOrder(page)).toEqual(await onScreen(page))

    // A framework patches its own children in place: text, attributes, and a child that is replaced.
    await page.evaluate(() => {
      const g = document.getElementById('g')
      g.querySelector('[item="notes"] [slot="value"]').textContent = '99'
      g.querySelector('[item="queue"]').setAttribute('label', 'Queue now')
      const tasks = g.querySelector('[item="tasks"]')
      const next = tasks.cloneNode(true)
      next.querySelector('[slot="value"]').textContent = '8'
      tasks.replaceWith(next)
    })
    await settle(page)
    await expect(page.locator('#g > [item="notes"] [slot="value"]')).toHaveText('99')
    await expect(page.locator('#g > [item="tasks"] [slot="value"]')).toHaveText('8')
    // The replacement is placed and slotted like the tile it replaced.
    const shown = await onScreen(page)
    expect(shown).toHaveLength(5)
    expect(await flat(page)).toEqual(shown)
    expect(await readingOrder(page)).toEqual(shown)
  })

  test('focus inside a tile survives a rearrangement', async ({ page }) => {
    await load(page)
    await page.evaluate(() => document.querySelector('#g > [item="sales"]').focus())
    await page.evaluate(() => {
      const g = document.getElementById('g')
      const items = g.layout.profiles.market
      g.layout = [...items.slice(1), items[0]]
    })
    await settle(page)
    expect(await page.evaluate(() => document.activeElement.getAttribute('item'))).toBe('sales')
  })

  test('tiles still render where they did, and read in order at every width', async ({ page }) => {
    await load(page, '?mode=explicit&w=420')
    expect(await page.evaluate(() => document.getElementById('g').columns)).toBe(2)
    await page.evaluate(() => {
      const g = document.getElementById('g')
      const items = g.layout.profiles.market
      g.layout = [items[3], items[4], items[0], items[1], items[2]]
    })
    await settle(page)
    const shown = await onScreen(page)
    expect(shown).toEqual(['traffic', 'queue', 'sales', 'notes', 'tasks'])
    expect(await readingOrder(page)).toEqual(shown)
    expect(await tabOrder(page)).toEqual(shown)
    // Widening the grid re-places the tiles, and the reading order goes with them.
    await page.evaluate(() => { document.getElementById('wrap').style.width = '1200px' })
    await expect.poll(() => page.evaluate(() => document.getElementById('g').columns)).toBe(4)
    await settle(page)
    expect(await readingOrder(page)).toEqual(await onScreen(page))
    expect(await flat(page)).toEqual(await onScreen(page))
  })
})

test.describe('readingOrder and ts-reading-order-change', () => {
  test('the event does not fire for the first order', async ({ page }) => {
    // Three children in markup: the grid's first render sees them all.
    await load(page, '')
    expect(await readingOrder(page)).toEqual(['sales', 'notes', 'tasks'])
    expect(await orderEvents(page)).toEqual([])
  })

  test('the explicit page, which adds tiles and sets a layout while it starts up, fires nothing', async ({ page }) => {
    await load(page)
    expect(await readingOrder(page)).toEqual(START)
    expect(await orderEvents(page)).toEqual([])
  })

  test('the event fires once for a change, bubbling and composed', async ({ page }) => {
    await load(page)
    expect(await readingOrder(page)).toEqual(START)
    expect(await orderEvents(page)).toEqual([])

    await page.evaluate(() => {
      const g = document.getElementById('g')
      const items = g.layout.profiles.market
      g.layout = [items[1], items[2], items[0], items[3], items[4]]
    })
    await settle(page)
    const seen = await orderEvents(page)
    expect(seen).toHaveLength(1)
    expect(seen[0].order).toEqual(await onScreen(page))
    expect(seen[0].order).toEqual(await readingOrder(page))
    expect(seen[0].bubbles).toBe(true)
    expect(seen[0].composed).toBe(true)

    // The same layout again changes nothing, so nothing fires.
    await page.evaluate(() => { const g = document.getElementById('g'); g.layout = g.layout })
    await settle(page)
    expect(await orderEvents(page)).toHaveLength(1)
  })

  test('a resize that keeps the order, and the middle of an edit, fire nothing; Done fires once', async ({ page }) => {
    await load(page)
    await startEditing(page)
    // A resize in edit mode changes sizes, not the order.
    await page.evaluate(() => {
      const g = document.getElementById('g')
      const items = g.layout.profiles.market.map((i) => (i.id === 'queue' ? { ...i, size: 'S' } : i))
      g.layout = items
    })
    await settle(page)
    expect(await orderEvents(page)).toEqual([])

    // Holding a tile and moving it changes what is on screen, not what is read, until it is dropped and Done is pressed.
    await tabToHandle(page, 'sales')
    await page.keyboard.press('Space')
    await push(page, 'sales', 2)
    await settle(page)
    const heldAt = await onScreen(page)
    expect(heldAt.indexOf('sales')).toBeGreaterThanOrEqual(2)
    expect(await readingOrder(page)).toEqual(START)
    expect(await flat(page)).toEqual(START)
    expect(await orderEvents(page)).toEqual([])

    await page.keyboard.press('Space')
    await settle(page)
    expect(await orderEvents(page)).toEqual([])
    await done(page)
    const seen = await orderEvents(page)
    expect(seen).toHaveLength(1)
    expect(seen[0].order).toEqual(await onScreen(page))
    expect(await flat(page)).toEqual(seen[0].order)
  })

  test('a cancelled move changes nothing and fires nothing', async ({ page }) => {
    await load(page)
    await startEditing(page)
    await tabToHandle(page, 'notes')
    await page.keyboard.press('Space')
    await push(page, 'notes', 2)
    await page.keyboard.press('Escape')
    await settle(page)
    await done(page)
    expect(await orderEvents(page)).toEqual([])
    expect(await readingOrder(page)).toEqual(START)
  })
})

test.describe('tiles that are not placed, and content that is not a tile', () => {
  test('a removed tile is assigned to no slot, and comes back with Undo', async ({ page }) => {
    await load(page)
    await startEditing(page)
    await page.evaluate(() => document.getElementById('g').shadowRoot.querySelector('.chrome[data-id="notes"] .remove').click())
    await settle(page)
    await done(page)
    expect(await readingOrder(page)).toEqual(['sales', 'tasks', 'traffic', 'queue'])
    expect(await flat(page)).toEqual(['sales', 'tasks', 'traffic', 'queue'])
    expect(await page.evaluate(() => document.querySelector('#g > [item="notes"]').assignedSlot === null)).toBe(true)
    expect(await slotCount(page)).toBe(5) // four tiles and the default slot for what isn't a tile; the empty slot lives in the panel
    expect(await tabOrder(page)).toEqual(['sales', 'tasks', 'traffic', 'queue'])

    await page.evaluate(() => document.getElementById('g').undo())
    await settle(page)
    expect(await readingOrder(page)).toEqual(START)
    expect(await flat(page)).toEqual(START)
    expect(await tabOrder(page)).toEqual(START)
    expect(await page.evaluate(() => document.querySelector('#g > [item="notes"]').assignedSlot !== null)).toBe(true)
  })

  test('slot="empty" content shows on an empty board, text stays rendered, and the tiles are put back', async ({ page }) => {
    await load(page)
    await page.evaluate(() => {
      const g = document.getElementById('g')
      g.insertAdjacentHTML('beforeend', '<p slot="empty" id="nothing">Nothing here yet</p>')
      g.append(document.createTextNode(' loose text '))
      g.layout = []
    })
    await settle(page)
    await expect(page.locator('#nothing')).toBeVisible()
    expect(await page.evaluate(() => document.getElementById('nothing').assignedSlot.getAttribute('name'))).toBe('empty')
    expect(await readingOrder(page)).toEqual([])
    // Hidden tiles are in no slot, and the loose text is in the default one.
    expect(await page.evaluate(() => document.querySelector('#g > [item="sales"]').assignedSlot === null)).toBe(true)
    expect(await page.evaluate(() => {
      const text = [...document.getElementById('g').childNodes].find((n) => n.nodeType === 3 && n.data.includes('loose'))
      return text.assignedSlot !== null && !text.assignedSlot.hasAttribute('name')
    })).toBe(true)

    // Tiles return and the empty content goes again.
    await page.evaluate(() => {
      const g = document.getElementById('g')
      g.layout = [
        { id: 'sales', type: 'metric', size: 'Wide' },
        { id: 'notes', type: 'card', size: 'S' },
      ]
    })
    await settle(page)
    await expect(page.locator('#nothing')).toBeHidden()
    expect(await readingOrder(page)).toEqual(['sales', 'notes'])
    expect(await flat(page)).toEqual(['sales', 'notes'])
    await expect(page.locator('#g > [item="sales"]')).toBeVisible()
  })

  test('the empty board keeps its own text when the host gives none', async ({ page }) => {
    await load(page)
    await page.evaluate(() => { document.getElementById('g').layout = [] })
    await settle(page)
    await expect(page.locator('ts-grid .empty')).toBeVisible()
    await expect(page.locator('ts-grid .empty .note')).toBeVisible()
  })
})

test.describe('implicit mode and persist', () => {
  test('implicit mode: a keyboard move is read in the new order', async ({ page }) => {
    await load(page, '')
    expect(await readingOrder(page)).toEqual(['sales', 'notes', 'tasks'])
    await moveWithKeyboard(page, 'sales', 2)
    await done(page)
    const shown = await onScreen(page)
    expect(shown.indexOf('sales')).toBeGreaterThanOrEqual(2)
    expect(await readingOrder(page)).toEqual(shown)
    expect(await flat(page)).toEqual(shown)
    expect(await tabOrder(page)).toEqual(shown)
    expect(await hostIds(page)).toEqual(['sales', 'notes', 'tasks'])
  })

  test('persist: a saved order is read in order after a reload, with no event for it', async ({ page }) => {
    await page.addInitScript(() => {
      new MutationObserver((records, observer) => {
        const g = document.getElementById('g')
        if (!g) return
        g.setAttribute('persist', 'order-demo')
        observer.disconnect()
      }).observe(document, { childList: true, subtree: true })
    })
    await load(page, '')
    await moveWithKeyboard(page, 'sales', 2)
    await done(page)
    const saved = await onScreen(page)
    expect(saved.indexOf('sales')).toBeGreaterThanOrEqual(2)

    await page.reload()
    await page.waitForFunction(() => window.__ready === true)
    await settle(page)
    await prepare(page)
    expect(await onScreen(page)).toEqual(saved)
    expect(await readingOrder(page)).toEqual(saved)
    expect(await flat(page)).toEqual(saved)
    expect(await tabOrder(page)).toEqual(saved)
  })
})

test.describe('where manual slot assignment is missing', () => {
  test('the grid keeps one slot and works, with Tab following the DOM order', async ({ page }) => {
    await page.addInitScript(() => { delete HTMLSlotElement.prototype.assign })
    await load(page)
    expect(await page.evaluate(() => typeof HTMLSlotElement.prototype.assign)).toBe('undefined')
    // The one default slot, and the empty panel's named one outside the board's children.
    expect(await slotCount(page)).toBe(1)
    expect(await onScreen(page)).toEqual(START)

    await page.evaluate(() => {
      const g = document.getElementById('g')
      const items = g.layout.profiles.market
      g.layout = [items[1], items[2], items[0], items[3], items[4]]
    })
    await settle(page)
    const shown = await onScreen(page)
    expect(shown).not.toEqual(START)
    // The visual order is still reported; Tab follows the host's DOM order, as in 0.1.0.
    expect(await readingOrder(page)).toEqual(shown)
    expect(await tabOrder(page)).toEqual(START)
    expect(await hostIds(page)).toEqual(START)
    expect(await slotCount(page)).toBe(1)

    // Editing and the empty board work as before.
    await moveWithKeyboard(page, 'notes', 1)
    await done(page)
    await page.evaluate(() => {
      document.getElementById('g').insertAdjacentHTML('beforeend', '<p slot="empty" id="nothing">Nothing here yet</p>')
      document.getElementById('g').layout = []
    })
    await settle(page)
    await expect(page.locator('#nothing')).toBeVisible()

    // A tile's own slot attribute is a name the single slot doesn't have, so the tile isn't rendered (documented).
    await page.evaluate(() => {
      const g = document.getElementById('g')
      g.layout = [{ id: 'sales', type: 'metric', size: 'Wide' }]
      g.querySelector('[item="sales"]').setAttribute('slot', 'elsewhere')
    })
    await settle(page)
    expect(await page.evaluate(() => document.querySelector('#g > [item="sales"]').assignedSlot === null)).toBe(true)
  })
})

test.describe('a declarative shadow root that assigns by name', () => {
  test('is reused, falls back to DOM order, and warns once in development', async ({ page }) => {
    const warnings = []
    page.on('console', (msg) => msg.type() === 'warning' && warnings.push(msg.text()))
    await load(page)
    const supported = await page.evaluate(() => typeof Document.parseHTMLUnsafe === 'function')
    test.skip(!supported, 'this engine has no Document.parseHTMLUnsafe, which is how the test parses a declarative root without the grid defined')
    // A parsed document has no element registry, so the grid upgrades on adoption, over the root the template made.
    const result = await page.evaluate(async () => {
      const doc = Document.parseHTMLUnsafe('<ts-grid id="decl"><template shadowrootmode="open"></template><ts-card item="a" label="A" size="S"></ts-card><ts-card item="b" label="B" size="S"></ts-card></ts-grid>')
      const grid = doc.body.firstElementChild
      const wrap = document.getElementById('wrap')
      wrap.append(grid)
      for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r))
      grid.layout = [{ id: 'b', type: 'card', size: 'S' }, { id: 'a', type: 'card', size: 'S' }]
      for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r))
      const boxes = [...grid.querySelectorAll('[item]')].map((el) => el.getBoundingClientRect().width > 0)
      return { slotAssignment: grid.shadowRoot.slotAssignment, order: [...grid.readingOrder], boxes, slots: grid.shadowRoot.querySelectorAll('.board > slot').length, dom: [...grid.children].map((el) => el.getAttribute('item')) }
    })
    expect(result.slotAssignment).toBe('named')
    // Placed and shown, with the visual order reported, though Tab and reading follow the DOM.
    expect(result.boxes).toEqual([true, true])
    expect(result.order).toEqual(['b', 'a'])
    expect(result.slots).toBe(1)
    expect(result.dom).toEqual(['a', 'b'])
    expect(warnings.filter((w) => w.includes('shadowrootslotassignment'))).toHaveLength(1)
  })
})

test.describe('start-up is not a rearrangement', () => {
  // A grid made in the page, the way a framework mounts one: connected first, then given its children or layout.
  const mount = (page, steps) => page.evaluate(async (steps) => {
    const frames = async () => { for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r)) }
    const grid = document.createElement('ts-grid')
    grid.style.cssText = 'display:block;width:1000px'
    const seen = []
    grid.addEventListener('ts-reading-order-change', (e) => seen.push(e.detail.order))
    document.body.append(grid)
    await frames()
    const log = []
    for (const step of steps) {
      if (step.html) grid.insertAdjacentHTML('beforeend', step.html)
      if (step.layout) grid.layout = step.layout
      await frames()
      log.push({ order: [...grid.readingOrder], events: seen.length })
    }
    return log
  }, steps)
  const cards = '<ts-card item="a" label="A" size="S"></ts-card><ts-card item="b" label="B" size="S"></ts-card><ts-card item="c" label="C" size="S"></ts-card>'
  const item = (id) => ({ id, type: 'card', size: 'S' })

  test('children arriving at an empty grid, then the host\'s first layout, fire nothing; the next layout does', async ({ page }) => {
    await load(page)
    const log = await mount(page, [
      {},
      { html: cards },
      { layout: [item('c'), item('a'), item('b')] },
      { layout: [item('a'), item('b'), item('c')] },
    ])
    expect(log[0]).toEqual({ order: [], events: 0 })
    expect(log[1]).toEqual({ order: ['a', 'b', 'c'], events: 0 })
    // The first layout the host gives replaces the order the children made, before anyone has edited.
    expect(log[2]).toEqual({ order: ['c', 'a', 'b'], events: 0 })
    expect(log[3]).toEqual({ order: ['a', 'b', 'c'], events: 1 })
  })

  test('a layout set on a grid that connected with its children fires nothing', async ({ page }) => {
    await load(page)
    const log = await mount(page, [{ html: cards }, { layout: [item('b'), item('c'), item('a')] }])
    expect(log[1]).toEqual({ order: ['b', 'c', 'a'], events: 0 })
  })

  test('a tile that arrives once the grid has its order is a change', async ({ page }) => {
    await load(page)
    const log = await mount(page, [{ html: cards }, { html: '<ts-card item="d" label="D" size="S"></ts-card>' }])
    expect(log[1]).toEqual({ order: ['a', 'b', 'c', 'd'], events: 1 })
  })
})

test.describe('with motion allowed', () => {
  test.use({ reducedMotion: 'no-preference' })

  // Right after the change, with no wait, which is when the transitions have just started.
  const rearrange = (page, pick) => page.evaluate((src) => {
    const g = document.getElementById('g')
    const before = Object.fromEntries([...g.children].map((el) => [el.getAttribute('item'), el.style.translate]))
    g.layout = new Function('items', `return (${src})(items)`)(g.layout.profiles.market)
    return Object.fromEntries([...g.children].map((el) => [el.getAttribute('item'), { changed: before[el.getAttribute('item')] !== el.style.translate, running: el.getAnimations().length }]))
  }, pick.toString())

  test('the last tile going first slides every tile that moved', async ({ page }) => {
    await load(page)
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(false)
    // One slot moves, not four, and that tile's slot moves before its box is written (a style flush between), because
    // WebKit drops the slide of a tile that is reattached after its box changed. That showed only on loaded Linux
    // runners, where the moved tile (here the last, going first) came back with no animation, so it is checked for it.
    const result = await rearrange(page, (i) => [i[4], i[0], i[1], i[2], i[3]])
    const moved = Object.entries(result).filter(([, t]) => t.changed)
    expect(moved).toHaveLength(5)
    expect(moved.filter(([, t]) => t.running === 0).map(([id]) => id)).toEqual([])
    expect(await readingOrder(page)).toEqual(await onScreen(page))
  })

  test('the first tile going last slides all the others', async ({ page }) => {
    await load(page)
    // The tile whose slot moves may be reattached, and WebKit and Firefox drop that tile's slide; the rest keep theirs.
    const result = await rearrange(page, (i) => [i[1], i[2], i[3], i[4], i[0]])
    const still = Object.entries(result).filter(([id, t]) => id !== 'sales' && t.changed && t.running === 0)
    expect(still).toEqual([])
    expect(await readingOrder(page)).toEqual(await onScreen(page))
  })
})

test.describe('while editing and at Done', () => {
  test('a tile removed in edit mode leaves readingOrder at once, and Done fires the order event before the edit event', async ({ page }) => {
    await load(page)
    await startEditing(page)
    await page.evaluate(() => document.getElementById('g').shadowRoot.querySelector('.chrome[data-id="notes"] .remove').click())
    await settle(page)
    expect(await readingOrder(page)).toEqual(['sales', 'tasks', 'traffic', 'queue'])
    expect(await orderEvents(page)).toEqual([])
    await page.evaluate(() => { window.__sequence.length = 0 })
    await done(page)
    // The removal is told at Done, like a move, and before the edit event.
    expect(await page.evaluate(() => window.__sequence)).toEqual(['ts-reading-order-change', 'ts-edit-change'])
    expect((await orderEvents(page)).map((e) => e.order)).toEqual([['sales', 'tasks', 'traffic', 'queue']])

    await moveWithKeyboard(page, 'sales', 2)
    await page.evaluate(() => { window.__sequence.length = 0 })
    await done(page)
    expect(await page.evaluate(() => window.__sequence)).toEqual(['ts-reading-order-change', 'ts-edit-change'])
  })
})
