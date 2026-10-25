// <ts-layout-list> in real engines (RFC 0003 §20): the grid's layout as a list, edited with the keyboard or a
// tap and nothing else. The fixture records every layout change in window.__events.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const PAGE = '/test/browser/fixtures/layout-list.html'

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
  await page.goto(`${PAGE}?x=1${query}`)
  await page.waitForFunction(() => window.__ready === true)
  await settle(page)
}
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
const events = async (page, type = 'ts-layout-change') => (await page.evaluate(() => window.__events)).filter((e) => e.type === type)
const row = (page, id) => page.locator(`ts-layout-list li[data-id="${id}"]`)
const ids = (page) => page.evaluate(() => [...document.getElementById('l').shadowRoot.querySelectorAll('li')].map((li) => li.dataset.id))
const status = (page) => page.locator('ts-layout-list .status')
const names = (page) => page.evaluate(() => [...document.getElementById('l').shadowRoot.querySelectorAll('li .name')].map((n) => n.textContent))

// Focus, followed through shadow roots: the element that really has it.
const deepActive = (page) => page.evaluate(() => {
  let a = document.activeElement
  while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement
  const li = a && a.closest ? a.closest('li') : null
  return a ? { tag: a.localName, id: a.id, row: li ? li.dataset.id : null, action: a.dataset ? a.dataset.action : null, label: a.getAttribute('aria-label') } : null
})

// A tap on a touch screen, a click elsewhere.
async function press(page, locator) {
  if (test.info().project.use.hasTouch) await locator.tap()
  else await locator.click()
}

test.describe('the rows', () => {
  test('is a labelled region with an ordered list of the visible tiles, in layout order', async ({ page }) => {
    await load(page)
    expect(await names(page)).toEqual(['Sales', 'Notes', 'Tasks', 'Traffic', 'Queue'])
    const shape = await page.evaluate(() => {
      const root = document.getElementById('l').shadowRoot
      return { region: root.querySelector('[role=region]').getAttribute('aria-label'), list: root.querySelector('ol').localName, items: root.querySelectorAll('ol > li').length }
    })
    expect(shape).toEqual({ region: 'Edit layout as a list', list: 'ol', items: 5 })
  })

  test('each row has a button per supported size, the current one pressed and named in full', async ({ page }) => {
    await load(page)
    const sizes = (id) => row(page, id).locator('.sizes button')
    // Sales is a metric: Small, Wide, Medium.
    await expect(sizes('sales')).toHaveCount(3)
    expect(await sizes('sales').evaluateAll((bs) => bs.map((b) => [b.textContent, b.getAttribute('aria-label'), b.getAttribute('aria-pressed')]))).toEqual([
      ['Small', 'Small, 1 by 1', 'false'],
      ['Wide', 'Wide, 2 by 1', 'true'],
      ['Medium', 'Medium, 2 by 2', 'false'],
    ])
    await expect(row(page, 'sales').getByRole('button', { name: 'Medium, 2 by 2' })).toBeVisible()
    // A card supports every size.
    await expect(sizes('notes')).toHaveCount(7)
  })

  test('every button is at least 44 by 32 and the size group is named for its tile', async ({ page }) => {
    await load(page)
    const small = await page.evaluate(() => {
      const root = document.getElementById('l').shadowRoot
      return [...root.querySelectorAll('li button')].map((b) => b.getBoundingClientRect()).filter((r) => r.width < 44 || r.height < 32).length
    })
    expect(small).toBe(0)
    await expect(row(page, 'tasks').getByRole('group', { name: 'Size of Tasks' })).toBeVisible()
  })

  test('Move up on the first row and Move down on the last are aria-disabled, not removed', async ({ page }) => {
    await load(page)
    const state = (id, name) => row(page, id).getByRole('button', { name }).getAttribute('aria-disabled')
    expect(await state('sales', 'Move up Sales')).toBe('true')
    expect(await state('sales', 'Move down Sales')).toBe('false')
    expect(await state('queue', 'Move down Queue')).toBe('true')
    expect(await state('queue', 'Move up Queue')).toBe('false')
    // They are still in the Tab order, and pressing one changes nothing.
    await row(page, 'sales').getByRole('button', { name: 'Move up Sales' }).focus()
    await page.keyboard.press('Enter')
    expect(await events(page)).toEqual([])
    expect(await ids(page)).toEqual(['sales', 'notes', 'tasks', 'traffic', 'queue'])
  })

  test('leaves the grid as it was until a button is used', async ({ page }) => {
    await load(page)
    expect(await events(page)).toEqual([])
  })
})

test.describe('editing with the keyboard', () => {
  test('Tab reaches a row, Move down moves the tile, fires ts-layout-change and announces it', async ({ page, browserName }) => {
    test.skip(test.info().project.use.hasTouch, 'no keyboard on a phone')
    await load(page)
    await page.locator('#before').focus()
    // Tab on until the list is reached (the grid's own Edit button comes first), then take Sales' controls: its sizes are one Tab stop (the pressed one), then Move up, Move down, Remove.
    const stops = []
    for (let i = 0; i < 12 && !stops.length; i++) {
      await page.keyboard.press('Tab')
      const at = await deepActive(page)
      if (at.row) stops.push(at)
    }
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab')
      stops.push(await deepActive(page))
    }
    expect(stops.map((s) => s.label)).toEqual(['Wide, 2 by 1', 'Move up Sales', 'Move down Sales', 'Remove Sales'])
    await page.keyboard.press('Shift+Tab')
    expect(await deepActive(page)).toMatchObject({ row: 'sales', action: 'down' })
    await page.keyboard.press('Enter')
    const changes = await events(page)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ reason: 'move', id: 'sales', order: ['notes', 'sales', 'tasks', 'traffic', 'queue'] })
    await expect(status(page)).toHaveText('Sales moved to position 2 of 5')
    expect(await ids(page)).toEqual(['notes', 'sales', 'tasks', 'traffic', 'queue'])
    // The row moved and the button used still has focus, so Space can move it again.
    expect(await deepActive(page)).toMatchObject({ row: 'sales', action: 'down' })
    await page.keyboard.press('Space')
    expect(await ids(page)).toEqual(['notes', 'tasks', 'sales', 'traffic', 'queue'])
    await expect(status(page)).toHaveText('Sales moved to position 3 of 5')
    expect(await events(page)).toHaveLength(2)
  })

  test('the arrow keys move between a row\'s sizes, which are one Tab stop', async ({ page }) => {
    test.skip(test.info().project.use.hasTouch, 'no keyboard on a phone')
    await load(page)
    await row(page, 'sales').getByRole('button', { name: 'Wide, 2 by 1' }).focus()
    await page.keyboard.press('ArrowRight')
    expect((await deepActive(page)).label).toBe('Medium, 2 by 2')
    await page.keyboard.press('ArrowRight')
    expect((await deepActive(page)).label).toBe('Small, 1 by 1')
    await page.keyboard.press('End')
    expect((await deepActive(page)).label).toBe('Medium, 2 by 2')
    // Focus is the stop while it is in the row: Tab goes on to Move up, and nothing was resized by moving.
    await page.keyboard.press('Tab')
    expect((await deepActive(page)).label).toBe('Move up Sales')
    expect(await events(page)).toEqual([])
    // Back in, the stop is where focus last was (Medium), and Enter resizes to it.
    await page.keyboard.press('Shift+Tab')
    expect((await deepActive(page)).label).toBe('Medium, 2 by 2')
    await page.keyboard.press('Enter')
    expect((await events(page))[0]).toMatchObject({ reason: 'resize', id: 'sales' })
    const tabbable = await page.evaluate(() => [...document.getElementById('l').shadowRoot.querySelectorAll('li[data-id=sales] .sizes button')].filter((b) => b.tabIndex === 0).length)
    expect(tabbable).toBe(1)
  })

  test('the grid itself shows the new order', async ({ page }) => {
    await load(page)
    await press(page, row(page, 'queue').getByRole('button', { name: 'Move up Queue' }))
    const order = await page.evaluate(() => window.__fx.grid.layout.profiles.market.map((i) => i.id))
    expect(order).toEqual(['sales', 'notes', 'tasks', 'queue', 'traffic'])
  })

  test('a size button resizes through the grid, and the pressed state follows', async ({ page }) => {
    await load(page)
    await press(page, row(page, 'notes').getByRole('button', { name: 'Medium, 2 by 2' }))
    const changes = await events(page)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ reason: 'resize', id: 'notes' })
    expect(changes[0].sizes).toEqual(['Wide', 'M', 'S', 'M', 'Wide'])
    await expect(row(page, 'notes').getByRole('button', { name: 'Medium, 2 by 2' })).toHaveAttribute('aria-pressed', 'true')
    await expect(row(page, 'notes').getByRole('button', { name: 'Small, 1 by 1' })).toHaveAttribute('aria-pressed', 'false')
    await expect(status(page)).toHaveText('Notes resized to Medium, 2 by 2')
    // The size it already has is not an edit.
    await press(page, row(page, 'notes').getByRole('button', { name: 'Medium, 2 by 2' }))
    expect(await events(page)).toHaveLength(1)
  })
})

test.describe('remove and undo', () => {
  test('Remove drops the row and moves focus to the row that takes its place', async ({ page }) => {
    await load(page)
    const remove = row(page, 'notes').getByRole('button', { name: 'Remove Notes' })
    await remove.focus()
    await page.keyboard.press('Enter')
    expect(await ids(page)).toEqual(['sales', 'tasks', 'traffic', 'queue'])
    const changes = await events(page)
    expect(changes[0]).toMatchObject({ reason: 'remove', id: 'notes' })
    await expect(status(page)).toHaveText('Notes removed')
    expect(await deepActive(page)).toMatchObject({ row: 'tasks', action: 'remove' })
  })

  test('removing the last row moves focus up, and removing every row moves it to the list', async ({ page }) => {
    await load(page)
    await row(page, 'queue').getByRole('button', { name: 'Remove Queue' }).focus()
    await page.keyboard.press('Enter')
    expect(await deepActive(page)).toMatchObject({ row: 'traffic', action: 'remove' })
    for (let i = 0; i < 4; i++) await page.keyboard.press('Enter')
    expect(await ids(page)).toEqual([])
    expect(await deepActive(page)).toMatchObject({ tag: 'div' })
    await expect(page.locator('ts-layout-list .empty')).toHaveText('No widgets on this layout')
  })

  test('Undo puts the tile back and says so; with nothing left to undo it says that', async ({ page }) => {
    await load(page)
    await press(page, row(page, 'tasks').getByRole('button', { name: 'Remove Tasks' }))
    expect(await ids(page)).toEqual(['sales', 'notes', 'traffic', 'queue'])
    await press(page, page.locator('ts-layout-list .undo'))
    await expect(status(page)).toHaveText('Undone')
    expect(await ids(page)).toEqual(['sales', 'notes', 'tasks', 'traffic', 'queue'])
    const reasons = (await events(page)).map((e) => e.reason)
    expect(reasons).toEqual(['remove', 'undo'])
    await press(page, page.locator('ts-layout-list .undo'))
    await expect(status(page)).toHaveText('Nothing to undo')
    expect((await events(page)).length).toBe(2)
  })

  test('one Undo takes back one edit, whichever way it was made', async ({ page }) => {
    await load(page)
    await press(page, row(page, 'sales').getByRole('button', { name: 'Move down Sales' }))
    await press(page, row(page, 'sales').getByRole('button', { name: 'Small, 1 by 1' }))
    await press(page, page.locator('ts-layout-list .undo'))
    expect(await page.evaluate(() => window.__fx.grid.layout.profiles.market.map((i) => `${i.id}:${i.size}`).slice(0, 2))).toEqual(['notes:S', 'sales:Wide'])
    await press(page, page.locator('ts-layout-list .undo'))
    expect(await ids(page)).toEqual(['sales', 'notes', 'tasks', 'traffic', 'queue'])
  })

  test('an edit made elsewhere (the host, or the grid\'s own editing) is drawn too', async ({ page }) => {
    await load(page)
    await page.evaluate(() => window.__fx.grid.move('queue', 0))
    expect(await ids(page)).toEqual(['queue', 'sales', 'notes', 'tasks', 'traffic'])
    await page.evaluate(() => window.__fx.grid.remove('sales'))
    expect(await ids(page)).toEqual(['queue', 'notes', 'tasks', 'traffic'])
  })
})

test.describe('finding the grid and the profile', () => {
  test('follows the active profile, and draws again when the profile changes', async ({ page }) => {
    await load(page, '&profiles')
    expect(await ids(page)).toEqual(['sales', 'notes', 'tasks', 'traffic', 'queue'])
    await press(page, page.locator('#switch'))
    await expect.poll(() => ids(page)).toEqual(['tasks', 'sales'])
    expect((await events(page, 'ts-profile-change')).map((e) => e.profile)).toEqual(['closed'])
    // An edit in this profile is an edit of this profile.
    await press(page, row(page, 'tasks').getByRole('button', { name: 'Move down Tasks' }))
    expect(await page.evaluate(() => window.__fx.grid.layout.profiles.closed.map((i) => i.id))).toEqual(['sales', 'tasks'])
    expect(await page.evaluate(() => window.__fx.grid.layout.profiles.market.map((i) => i.id))).toEqual(['sales', 'notes', 'tasks', 'traffic', 'queue'])
    await press(page, page.locator('#switch'))
    expect(await ids(page)).toEqual(['sales', 'notes', 'tasks', 'traffic', 'queue'])
  })

  test('a host that sets the profile attribute is followed too', async ({ page }) => {
    await load(page, '&profiles')
    await page.evaluate(() => window.__fx.grid.setAttribute('profile', 'closed'))
    await expect.poll(() => ids(page)).toEqual(['tasks', 'sales'])
    await page.evaluate(() => window.__fx.grid.removeAttribute('profile'))
    await expect.poll(() => ids(page)).toEqual(['sales', 'notes', 'tasks', 'traffic', 'queue'])
  })

  test('a grid that arrives after the list is picked up', async ({ page }) => {
    await load(page, '&late')
    await expect(page.locator('ts-layout-list li')).toHaveCount(0)
    await expect(page.locator('ts-layout-list .empty')).toHaveText('No dashboard to edit yet')
    // The test adds the grid itself, so nothing depends on how fast the page was.
    await page.evaluate(() => window.__addGrid())
    await expect.poll(() => ids(page)).toEqual(['sales', 'notes', 'tasks', 'traffic', 'queue'])
    await press(page, row(page, 'notes').getByRole('button', { name: 'Remove Notes' }))
    expect(await ids(page)).toEqual(['sales', 'tasks', 'traffic', 'queue'])
  })

  test('changing `for` points the list at another grid', async ({ page }) => {
    await load(page)
    await page.evaluate(() => {
      const other = document.createElement('ts-grid')
      other.id = 'g2'
      other.layout = [{ id: 'solo', type: 'card', size: 'S' }]
      const el = document.createElement('ts-card')
      el.setAttribute('item', 'solo')
      el.setAttribute('label', 'Solo')
      other.append(el)
      document.body.append(other)
      document.getElementById('l').for = 'g2'
    })
    await expect.poll(() => ids(page)).toEqual(['solo'])
    // The old grid is no longer listened to: count the list's redraws while the old grid is edited every way it can be.
    await page.evaluate(() => {
      const list = document.getElementById('l')
      const draw = list._render
      window.__draws = 0
      list._render = function (...args) {
        window.__draws++
        return draw.apply(this, args)
      }
    })
    await page.evaluate(() => {
      const old = window.__fx.grid
      old.move('queue', 0)
      old.layout = old.layout
      old.setAttribute('profile', 'market')
      old.setAttribute('locked', '')
      const extra = document.createElement('ts-card')
      extra.setAttribute('item', 'late')
      old.append(extra)
      old._stateChanged()
    })
    await settle(page)
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => window.__draws)).toBe(0)
    expect(await ids(page)).toEqual(['solo'])
    expect(await page.evaluate(() => [window.__fx.grid._stateListeners.size, document.getElementById('l').for])).toEqual([0, 'g2'])
    // The new grid is listened to, once per edit.
    await page.evaluate(() => document.getElementById('g2').remove())
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => window.__draws)).toBeGreaterThan(0)
    await expect(page.locator('ts-layout-list .empty')).toHaveText('No dashboard to edit yet')
    // A removed grid is not listened to either.
    const after = await page.evaluate(() => window.__draws)
    await page.evaluate(() => window.__fx.grid.move('sales', 1))
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => window.__draws)).toBe(after)
  })

  test('a list that left the page before its grid was defined does not bind to it', async ({ page }) => {
    await page.goto('/test/browser/fixtures/layout-list-only.html')
    await page.waitForFunction(() => window.__ready === true)
    const result = await page.evaluate(async () => {
      const list = document.getElementById('l')
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      list.remove()
      await import('/src/elements/define/grid.js')
      await customElements.whenDefined('ts-grid')
      await new Promise((r) => setTimeout(r, 50))
      const grid = document.getElementById('g')
      return { bound: list._grid === null, listeners: grid._stateListeners.size }
    })
    expect(result).toEqual({ bound: true, listeners: 0 })
  })
})

// The grid says nothing when a host sets layout, or when tiles come and go in implicit mode; the list reads it again on its own and before each action.
test.describe('a grid changed without an event', () => {
  const replaceLayout = (page, order) => page.evaluate((order) => {
    const sizes = { sales: 'Wide', notes: 'S', tasks: 'S', traffic: 'M', queue: 'Wide' }
    const types = { sales: 'metric', traffic: 'chart' }
    window.__fx.grid.layout = order.map((id) => ({ id, type: types[id] || 'card', size: sizes[id] }))
  }, order)
  // The grid's own setter, bypassing anything on the instance: no event, no hook, as if the list had missed the change.
  const silently = (page, order) => page.evaluate((order) => {
    const sizes = { sales: 'Wide', notes: 'S', tasks: 'S', traffic: 'M', queue: 'Wide' }
    const types = { sales: 'metric', traffic: 'chart' }
    const desc = Object.getOwnPropertyDescriptor(customElements.get('ts-grid').prototype, 'layout')
    desc.set.call(window.__fx.grid, order.map((id) => ({ id, type: types[id] || 'card', size: sizes[id] })))
  }, order)

  test('grid.layout = ... after the first draw is drawn', async ({ page }) => {
    await load(page)
    await replaceLayout(page, ['queue', 'sales', 'notes', 'tasks', 'traffic'])
    await expect.poll(() => ids(page)).toEqual(['queue', 'sales', 'notes', 'tasks', 'traffic'])
    await replaceLayout(page, ['tasks', 'sales'])
    await expect.poll(() => ids(page)).toEqual(['tasks', 'sales'])
  })

  test('a button on a stale row acts on the fresh layout, and says what really happened', async ({ page }) => {
    await load(page)
    await silently(page, ['queue', 'sales', 'notes', 'tasks', 'traffic'])
    // The list still shows sales first. Move down Sales: in the fresh layout it is second, so it goes to third.
    expect(await ids(page)).toEqual(['sales', 'notes', 'tasks', 'traffic', 'queue'])
    await press(page, row(page, 'sales').getByRole('button', { name: 'Move down Sales' }))
    expect(await page.evaluate(() => window.__fx.grid.layout.profiles.market.map((i) => i.id))).toEqual(['queue', 'notes', 'sales', 'tasks', 'traffic'])
    await expect(status(page)).toHaveText('Sales moved to position 3 of 5')
    expect(await ids(page)).toEqual(['queue', 'notes', 'sales', 'tasks', 'traffic'])
  })

  test('a button on a row the grid no longer has does nothing and says nothing', async ({ page }) => {
    await load(page)
    const stale = row(page, 'notes').getByRole('button', { name: 'Remove Notes' })
    await silently(page, ['sales', 'tasks', 'traffic', 'queue'])
    await stale.dispatchEvent('click')
    expect(await events(page)).toEqual([])
    await expect(status(page)).toHaveText('')
    expect(await ids(page)).toEqual(['sales', 'tasks', 'traffic', 'queue'])
  })

  test('a move that would change nothing is not announced', async ({ page }) => {
    await load(page)
    // The list is stale in the other direction: the fresh layout has one tile, so Move down on Sales is now an end.
    await silently(page, ['sales'])
    await row(page, 'sales').getByRole('button', { name: 'Move down Sales' }).dispatchEvent('click')
    expect(await events(page)).toEqual([])
    await expect(status(page)).toHaveText('')
  })

  test('tiles added to and removed from an implicit grid are drawn', async ({ page }) => {
    await load(page, '&implicit')
    expect(await names(page)).toEqual(['Sales', 'Notes', 'Tasks', 'Traffic', 'Queue'])
    await page.evaluate(() => {
      const el = document.createElement('ts-card')
      el.setAttribute('item', 'extra')
      el.setAttribute('label', 'Extra')
      window.__fx.grid.append(el)
    })
    await expect.poll(() => ids(page)).toEqual(['sales', 'notes', 'tasks', 'traffic', 'queue', 'extra'])
    await page.evaluate(() => window.__fx.grid.querySelector('[item=notes]').remove())
    await expect.poll(() => ids(page)).toEqual(['sales', 'tasks', 'traffic', 'queue', 'extra'])
    // A rename is drawn too.
    await page.evaluate(() => window.__fx.grid.querySelector('[item=tasks]').setAttribute('label', 'To do'))
    await expect.poll(() => names(page)).toContain('To do')
  })
})

test.describe('a locked grid', () => {
  const buttons = (page) => page.evaluate(() => [...document.getElementById('l').shadowRoot.querySelectorAll('button')].map((b) => b.getAttribute('aria-disabled')))

  test('every button and Undo are aria-disabled and inert, and the list says why', async ({ page }) => {
    await load(page, '&locked')
    const states = await buttons(page)
    expect(states.length).toBeGreaterThan(10)
    expect(states.every((s) => s === 'true')).toBe(true)
    await expect(page.locator('ts-layout-list .locked')).toHaveText('This layout is locked')
    await row(page, 'queue').getByRole('button', { name: 'Move up Queue' }).dispatchEvent('click')
    await row(page, 'notes').getByRole('button', { name: 'Medium, 2 by 2' }).dispatchEvent('click')
    await row(page, 'notes').getByRole('button', { name: 'Remove Notes' }).dispatchEvent('click')
    await page.locator('ts-layout-list .undo').dispatchEvent('click')
    expect(await events(page)).toEqual([])
    expect(await ids(page)).toEqual(['sales', 'notes', 'tasks', 'traffic', 'queue'])
    await expect(status(page)).toHaveText('This layout is locked')
    // Still in the Tab order, like the ends.
    await row(page, 'notes').getByRole('button', { name: 'Remove Notes' }).focus()
    expect((await deepActive(page)).label).toBe('Remove Notes')
  })

  test('following the locked attribute as it is set and removed', async ({ page }) => {
    await load(page)
    await expect(page.locator('ts-layout-list .locked')).toBeHidden()
    await page.evaluate(() => window.__fx.grid.setAttribute('locked', ''))
    await expect.poll(async () => (await buttons(page)).every((s) => s === 'true')).toBe(true)
    await expect(page.locator('ts-layout-list .locked')).toBeVisible()
    await page.evaluate(() => window.__fx.grid.removeAttribute('locked'))
    await expect.poll(async () => (await buttons(page)).filter((s) => s === 'true').length).toBe(2)
    await expect(page.locator('ts-layout-list .locked')).toBeHidden()
    await press(page, row(page, 'queue').getByRole('button', { name: 'Move up Queue' }))
    expect((await events(page)).map((e) => e.reason)).toEqual(['move'])
  })

  test('a list that was already drawn goes inert when the grid is locked, before any event', async ({ page }) => {
    await load(page)
    const target = row(page, 'notes').getByRole('button', { name: 'Remove Notes' })
    // Locked silently and pressed at once: the press itself reads the lock.
    await page.evaluate(() => {
      const grid = window.__fx.grid
      grid.setAttribute('locked', '')
    })
    await target.dispatchEvent('click')
    expect(await events(page)).toEqual([])
  })
})

test.describe('words', () => {
  test('every string comes from the grid\'s messages', async ({ page }) => {
    await load(page, '&lang=de')
    await expect(page.locator('ts-layout-list .undo')).toHaveText('Rückgängig')
    await expect(row(page, 'sales').getByRole('button', { name: 'Nach unten: Sales' })).toBeVisible()
    await expect(row(page, 'sales').getByRole('button', { name: 'Mittel, 2 mal 2' })).toBeVisible()
    await press(page, row(page, 'sales').getByRole('button', { name: 'Nach unten: Sales' }))
    await expect(status(page)).toHaveText('Sales ist jetzt an Position 2 von 5')
    await press(page, page.locator('ts-layout-list .undo'))
    await expect(status(page)).toHaveText('Rückgängig gemacht')
  })
})

test.describe('phone width and accessibility', () => {
  test('fits 390px with no sideways scroll, a long name wrapping', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    await load(page, '&many')
    const overflow = await page.evaluate(() => {
      const list = document.getElementById('l')
      const root = list.shadowRoot
      const box = list.getBoundingClientRect()
      const wide = [...root.querySelectorAll('li, button')].filter((el) => el.getBoundingClientRect().right > box.right + 0.5).length
      return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, wide }
    })
    expect(overflow).toEqual({ page: 0, wide: 0 })
  })

  test('has no axe violations, in light and dark', async ({ page }) => {
    for (const theme of ['light', 'dark']) {
      await load(page, `&theme=${theme}`)
      // The long list, a pressed button, a disabled end and a status line all on the page.
      await press(page, row(page, 'notes').getByRole('button', { name: 'Medium, 2 by 2' }))
      const results = await new AxeBuilder({ page }).include('ts-layout-list').analyze()
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
    }
  })
})
