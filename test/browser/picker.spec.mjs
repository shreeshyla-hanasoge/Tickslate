// <ts-widget-picker> and <ts-grid-controls> in real engines (RFC 0003 §18):
// the add-a-widget sheet, restores and ts-add-request, the schedule-aware
// switcher, and the edit pill's Add. The fixture records every layout change
// in window.__events and every request in window.__requests.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const PAGE = '/test/browser/fixtures/picker.html'

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
const changes = async (page, reason) => (await page.evaluate(() => window.__events)).filter((e) => e.type === 'ts-layout-change' && (!reason || e.reason === reason))
const requests = (page) => page.evaluate(() => window.__requests)
const status = (page) => page.locator('ts-grid .sr')
const sheet = (page) => page.locator('ts-widget-picker dialog')
const chip = (page, name) => page.locator('ts-widget-picker .chip', { hasText: name })
const search = (page) => page.locator('ts-widget-picker .search')

// Focus, followed through shadow roots: the element that really has it.
const deepActive = (page) => page.evaluate(() => {
  let a = document.activeElement
  while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement
  return a ? { tag: a.localName, id: a.id, cls: a.className, text: (a.textContent || '').trim().slice(0, 30) } : null
})

async function press(page, locator) {
  if (test.info().project.use.hasTouch) await locator.tap()
  else await locator.click()
}

// Opens the sheet from the page's own button, by the keyboard where there is one.
async function openSheet(page) {
  await page.locator('#open').focus()
  await page.keyboard.press('Enter')
  await expect(sheet(page)).toBeVisible()
}

const visibleRowLabels = (page) => page.evaluate(() =>
  [...document.querySelector('ts-widget-picker').shadowRoot.querySelectorAll('.row .name')].map((n) => n.textContent))

test.describe('the sheet', () => {
  test('opens from a button with the search focused, and Escape closes it and returns focus', async ({ page }) => {
    await load(page)
    expect(await page.evaluate(() => document.getElementById('p').open)).toBe(false)
    await openSheet(page)
    await expect(search(page)).toBeFocused()
    expect(await page.evaluate(() => document.getElementById('p').open)).toBe(true)
    await expect(page.locator('ts-widget-picker')).toHaveAttribute('open', '')
    await page.keyboard.press('Escape')
    await expect(sheet(page)).toBeHidden()
    expect(await page.evaluate(() => document.getElementById('p').open)).toBe(false)
    expect(await deepActive(page)).toMatchObject({ id: 'open' })
    // A closed sheet leaves the grid as it was.
    expect(await changes(page)).toEqual([])
  })

  test('is a labelled modal dialog: the page behind it is inert and Tab stays inside', async ({ page }) => {
    await load(page)
    await openSheet(page)
    const name = await page.evaluate(() => {
      const d = document.querySelector('ts-widget-picker').shadowRoot.querySelector('dialog')
      return { modal: d.matches(':modal'), label: d.getRootNode().getElementById(d.getAttribute('aria-labelledby')).textContent }
    })
    expect(name).toEqual({ modal: true, label: 'Add a widget' })
    // Twelve Tabs go round the close button, the search field and the chips, and never reach the page behind.
    // WebKit hands focus to the browser's own controls at the end of the dialog, which leaves the document on its body.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      expect(['ts-widget-picker', 'body']).toContain(await page.evaluate(() => document.activeElement && document.activeElement.localName))
    }
  })

  test('the close button and a click on the backdrop close it, and focus returns', async ({ page }) => {
    await load(page)
    await openSheet(page)
    await press(page, page.locator('ts-widget-picker .close'))
    await expect(sheet(page)).toBeHidden()
    expect(await deepActive(page)).toMatchObject({ id: 'open' })
    await openSheet(page)
    // The backdrop is the dialog's own box outside its content; a press at the very top of the page is on it.
    await page.mouse.click(2, 2)
    await expect(sheet(page)).toBeHidden()
    expect(await deepActive(page)).toMatchObject({ id: 'open' })
  })

  test('is a bottom sheet below 700px and centred above, with 44px targets', async ({ page }) => {
    await load(page)
    await openSheet(page)
    const box = await sheet(page).boundingBox()
    const view = page.viewportSize()
    if (view.width < 700) {
      expect(Math.abs(box.x)).toBeLessThan(1)
      expect(Math.abs(box.width - view.width)).toBeLessThan(1)
      expect(Math.abs(box.y + box.height - view.height)).toBeLessThan(1.5)
    } else {
      expect(Math.abs(box.x + box.width / 2 - view.width / 2)).toBeLessThan(1)
      expect(box.y + box.height).toBeLessThan(view.height - 8)
      expect(box.width).toBeLessThanOrEqual(560)
    }
    const small = await page.evaluate(() => [...document.querySelector('ts-widget-picker').shadowRoot.querySelectorAll('button, input')]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.height < 44 || r.width < 44).length)
    expect(small).toBe(0)
    // No horizontal scroll inside the sheet.
    const overflow = await page.evaluate(() => {
      const root = document.querySelector('ts-widget-picker').shadowRoot
      const results = root.querySelector('.results')
      return results.scrollWidth > results.clientWidth + 1
    })
    expect(overflow).toBe(false)
  })

  test('has no serious axe violations, open, in both themes', async ({ page }) => {
    for (const theme of ['light', 'dark']) {
      await load(page, `&theme=${theme}`)
      await openSheet(page)
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
      const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      expect(bad.map((v) => `${v.id}: ${v.help} ${v.nodes.slice(0, 2).map((n) => n.target.join(' '))}`), theme).toEqual([])
    }
  })
})

test.describe('what it lists', () => {
  test('catalog types the host answers for, grouped by category, with a chip per size', async ({ page }) => {
    await load(page)
    await openSheet(page)
    const groups = await page.evaluate(() => [...document.querySelector('ts-widget-picker').shadowRoot.querySelectorAll('.group')].map((g) => ({
      title: g.querySelector('.group-title').textContent,
      rows: [...g.querySelectorAll('.row')].map((r) => ({
        name: r.querySelector('.name').textContent,
        desc: r.querySelector('.desc').textContent,
        chips: [...r.querySelectorAll('.chip')].map((c) => [c.textContent, c.getAttribute('aria-label')]),
      })),
    })))
    expect(groups.map((g) => g.title)).toEqual(['General'])
    expect(groups[0].rows.map((r) => r.name)).toEqual(['Card', 'Chart', 'Metric'])
    const metric = groups[0].rows.find((r) => r.name === 'Metric')
    expect(metric.desc).toBe('One figure with a label and a change.')
    expect(metric.chips).toEqual([
      ['Small', 'Add Metric as Small, 1 by 1'],
      ['Wide', 'Add Metric as Wide, 2 by 1'],
      ['Medium', 'Add Metric as Medium, 2 by 2'],
    ])
  })

  test('a host that lists no types gets no new types, and says so when nothing is left', async ({ page }) => {
    await load(page, '&add=off')
    await openSheet(page)
    await expect(page.locator('ts-widget-picker .empty')).toHaveText('Every widget is already on this layout')
    expect(await visibleRowLabels(page)).toEqual([])
    expect(await page.evaluate(() => document.querySelector('ts-widget-picker').shadowRoot.querySelector('.results').hidden)).toBe(true)
  })

  test('search matches the label and the description, ignoring case, and says when nothing matches', async ({ page }) => {
    await load(page)
    await openSheet(page)
    await page.keyboard.type('CHAR')
    expect(await visibleRowLabels(page)).toEqual(['Chart'])
    await search(page).fill('label and a change')
    expect(await visibleRowLabels(page)).toEqual(['Metric'])
    await search(page).fill('zzz')
    await expect(page.locator('ts-widget-picker .empty')).toHaveText('No widget matches your search')
    await search(page).fill('')
    expect(await visibleRowLabels(page)).toEqual(['Card', 'Chart', 'Metric'])
  })

  test('uses the grid’s locale and messages', async ({ page }) => {
    await load(page, '&lang=de')
    await openSheet(page)
    await expect(page.locator('ts-widget-picker .title')).toHaveText('Widget hinzufügen')
    expect(await visibleRowLabels(page)).toContain('Karte')
    await expect(page.locator('ts-widget-picker .group-title')).toHaveText('Allgemein')
  })
})

test.describe('removing and adding back', () => {
  test('a removed tile is listed first, as one Add back, and restoring it needs no host', async ({ page }) => {
    await load(page)
    expect(await page.evaluate(() => document.getElementById('g').remove('queue'))).toBe(true)
    await settle(page)
    expect((await changes(page)).map((c) => c.reason)).toEqual(['remove'])
    await openSheet(page)
    const rows = await page.evaluate(() => [...document.querySelector('ts-widget-picker').shadowRoot.querySelectorAll('.row')].map((r) => ({
      name: r.querySelector('.name').textContent,
      chips: [...r.querySelectorAll('.chip')].map((c) => c.getAttribute('aria-label')),
    })))
    expect(rows[0]).toEqual({ name: 'Queue', chips: ['Add back Queue'] })
    // Keyboard: Tab from the search field reaches the chip, and Enter takes it.
    await page.keyboard.press('Tab')
    expect(await deepActive(page)).toMatchObject({ cls: 'chip', text: 'Add back' })
    await page.keyboard.press('Enter')
    await expect(sheet(page)).toBeHidden()
    const added = await changes(page, 'add')
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({ id: 'queue' })
    expect(added[0].order.at(-1)).toBe('queue')
    expect(await requests(page)).toEqual([])
    await expect(status(page)).toHaveText('Queue added back.')
    expect(await deepActive(page)).toMatchObject({ id: 'open' })
  })

  test('a hidden child is searchable and sits in its type’s group', async ({ page }) => {
    await load(page)
    await page.evaluate(() => { const g = document.getElementById('g'); g.remove('notes'); g.remove('tasks') })
    await settle(page)
    await openSheet(page)
    expect(await visibleRowLabels(page)).toEqual(['Notes', 'Tasks', 'Card', 'Chart', 'Metric'])
    await search(page).fill('task')
    expect(await visibleRowLabels(page)).toEqual(['Tasks'])
  })
})

test.describe('adding a new tile', () => {
  test('asks the host with a cancelable ts-add-request, and places the child it renders at the size chosen', async ({ page }) => {
    await load(page)
    await openSheet(page)
    await search(page).fill('card')
    await press(page, chip(page, 'Medium'))
    await expect(sheet(page)).toBeHidden()
    expect(await requests(page)).toEqual([{ type: 'card', id: 'card', size: 'M', cancelable: true, composed: true }])
    await settle(page)
    const added = await changes(page, 'add')
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({ id: 'card' })
    expect(added[0].order).toContain('card')
    expect(added[0].sizes[added[0].order.indexOf('card')]).toBe('M')
    await expect(status(page)).toHaveText('New card card added.')
    // It is a real tile: laid out inside the grid and the size attribute written.
    const tile = page.locator('#g > [item="card"]')
    await expect(tile).toHaveAttribute('size', 'M')
    const fits = await page.evaluate(() => {
      const g = document.getElementById('g').getBoundingClientRect()
      const r = document.querySelector('#g > [item="card"]').getBoundingClientRect()
      return r.width > 0 && r.height > 0 && r.left >= g.left - 0.5 && r.right <= g.right + 0.5
    })
    expect(fits).toBe(true)
    expect(await deepActive(page)).toMatchObject({ id: 'open' })
  })

  test('a second tile of the type takes the next id, and Undo takes the add back', async ({ page }) => {
    await load(page)
    for (let i = 0; i < 2; i++) {
      await openSheet(page)
      await press(page, chip(page, 'Small').first())
      await settle(page)
    }
    const ids = (await requests(page)).map((r) => r.id)
    expect(ids).toEqual(['card', 'card-2'])
    expect((await changes(page, 'add')).length).toBe(2)
    expect(await page.evaluate(() => document.getElementById('g').undo())).toBe(true)
    await settle(page)
    const last = (await changes(page)).at(-1)
    expect(last.reason).toBe('undo')
    expect(last.order).not.toContain(ids[1])
    expect(last.order).toContain(ids[0])
  })

  test('works when the host answers a moment later, as a framework does', async ({ page }) => {
    await load(page, '&late=1')
    await openSheet(page)
    await press(page, chip(page, 'Wide').first())
    expect(await changes(page, 'add')).toHaveLength(0)
    await expect.poll(async () => (await changes(page, 'add')).length).toBe(1)
    const [added] = await changes(page, 'add')
    expect(added.sizes[added.order.indexOf(added.id)]).toBe('Wide')
  })

  test('when nobody takes the request nothing is added, and the sheet stays open', async ({ page }) => {
    await load(page, '&handle=off')
    // The grid warns once in development; that is expected here.
    page.removeAllListeners('console')
    await openSheet(page)
    await press(page, chip(page, 'Small').first())
    await expect(sheet(page)).toBeVisible()
    expect((await requests(page)).length).toBe(1)
    await settle(page)
    expect(await changes(page)).toEqual([])
    expect(await page.evaluate(() => document.getElementById('g').add({ type: 'card' }))).toBeNull()
  })

  test('works in implicit mode too: the child the host renders is resized to what was asked', async ({ page }) => {
    await load(page, '&implicit=1')
    const id = await page.evaluate(() => document.getElementById('g').add({ type: 'card', size: 'L' }))
    expect(id).toBe('card')
    await settle(page)
    // On a phone the tile is drawn as M (the grid writes the reflowed size), so the layout is what says L.
    const added = await changes(page, 'add')
    expect(added).toHaveLength(1)
    expect(added[0].sizes[added[0].order.indexOf('card')]).toBe('L')
    expect(await page.evaluate(() => document.getElementById('g').undo())).toBe(true)
    await settle(page)
    expect((await changes(page)).at(-1).order).not.toContain('card')
  })

  test('grid.add returns the id, a null for an unknown type, and restores a hidden child without asking', async ({ page }) => {
    await load(page)
    const result = await page.evaluate(() => {
      const g = document.getElementById('g')
      const out = {}
      out.unknown = g.add({ type: 'no-such-type' })
      out.card = g.add({ type: 'metric', size: 'XL' })
      g.remove('notes')
      out.restore = g.add({ type: 'card', id: 'notes' })
      out.taken = g.add({ type: 'card', id: 'sales' })
      return out
    })
    expect(result).toEqual({ unknown: null, card: 'metric', restore: 'notes', taken: null })
    await settle(page)
    const reqs = await requests(page)
    // 'XL' is not a size a metric has, so the grid asks at the nearest it does.
    expect(reqs).toEqual([{ type: 'metric', id: 'metric', size: 'M', cancelable: true, composed: true }])
    expect((await changes(page)).map((c) => c.reason)).toEqual(['remove', 'add', 'add'])
  })
})

test.describe('a request the host takes and never answers', () => {
  test('keeps the sheet open, then reports the failure and frees the id', async ({ page }) => {
    test.setTimeout(40000)
    await load(page, '&handle=silent')
    // The grid warns once in development when it gives up; that is expected here.
    page.removeAllListeners('console')
    await openSheet(page)
    await press(page, chip(page, 'Small').first())
    await expect(sheet(page)).toBeVisible()
    await expect(page.locator('ts-widget-picker .results')).toHaveAttribute('aria-busy', 'true')
    expect(await requests(page)).toHaveLength(1)
    // The id is spoken for: a second request for it fires nothing, and the sheet ignores another chip.
    expect(await page.evaluate(() => document.getElementById('g').add({ type: 'card', id: 'card' }))).toBeNull()
    await press(page, chip(page, 'Wide').first())
    expect(await requests(page)).toHaveLength(1)
    await expect(status(page)).toHaveText('Card could not be added.', { timeout: 15000 })
    await expect(page.locator('ts-widget-picker .fail')).toHaveText('Card could not be added.')
    await expect(sheet(page)).toBeVisible()
    await expect(page.locator('ts-widget-picker .results')).not.toHaveAttribute('aria-busy', 'true')
    expect(await changes(page)).toEqual([])
    // Released: the same id can be asked for again.
    expect(await page.evaluate(() => document.getElementById('g').add({ type: 'card', id: 'card' }))).toBe('card')
  })

  test('two children with the one id warn in development, and the grid still adds the tile', async ({ page }) => {
    await load(page, '&handle=silent')
    const warnings = []
    page.on('console', (msg) => msg.type() === 'warning' && warnings.push(msg.text()))
    await page.evaluate(() => {
      const g = document.getElementById('g')
      g.add({ type: 'card', id: 'dup' })
      for (let i = 0; i < 2; i++) {
        const el = document.createElement('ts-card')
        el.setAttribute('item', 'dup')
        g.append(el)
      }
    })
    await expect.poll(async () => (await changes(page, 'add')).length).toBe(1)
    expect(warnings.some((w) => w.includes('two children with item="dup"'))).toBe(true)
  })
})

test.describe('the picker without a grid', () => {
  test('says there is no dashboard, not that every widget is on the layout', async ({ page }) => {
    await load(page)
    await page.evaluate(() => {
      const p = document.createElement('ts-widget-picker')
      p.id = 'orphan'
      p.setAttribute('for', 'no-such-grid')
      document.body.append(p)
      p.show()
    })
    await expect(page.locator('#orphan .empty')).toHaveText('No dashboard to add to yet')
  })
})

test.describe('the controls on a page with no grid', () => {
  test('queue one whenDefined per tag, however often the page changes', async ({ page }) => {
    await page.goto('/test/browser/fixtures/controls-only.html')
    await page.waitForFunction(() => window.__ready === true)
    await page.evaluate(async () => {
      for (let i = 0; i < 30; i++) {
        document.body.append(document.createElement('p'))
        await new Promise((r) => requestAnimationFrame(r))
      }
    })
    const queued = await page.evaluate(() => window.__whenDefined)
    expect(queued.filter((n) => n === 'ts-grid').length).toBe(1)
    expect(queued.filter((n) => n === 'ts-widget-picker').length).toBeLessThanOrEqual(1)
  })
})

test.describe('the editing methods', () => {
  test('announce what they did, in the words a drag uses', async ({ page }) => {
    await load(page)
    await page.evaluate(() => document.getElementById('g').move('queue', 0))
    await expect(status(page)).toHaveText('Queue, moved to position 1 of 5.')
    await page.evaluate(() => document.getElementById('g').resize('notes', 'Wide'))
    await expect(status(page)).toHaveText('Notes, size Wide.')
    await page.evaluate(() => document.getElementById('g').remove('tasks'))
    await expect(status(page)).toHaveText('Tasks removed.')
  })

  test('warn in development about a bad size or index, and keep their return values', async ({ page }) => {
    await load(page)
    const warnings = []
    page.on('console', (msg) => msg.type() === 'warning' && warnings.push(msg.text()))
    const out = await page.evaluate(() => {
      const g = document.getElementById('g')
      return [g.resize('notes', 'giant'), g.move('notes', 'first'), g.resize('nope', 'giant')]
    })
    expect(out).toEqual([true, true, false])
    expect(warnings.some((w) => w.includes('resize(id, size) needs a size name'))).toBe(true)
    expect(warnings.some((w) => w.includes('move(id, toIndex) needs a number'))).toBe(true)
  })


  test('move, resize and remove commit like a drag and return false for an unknown id', async ({ page }) => {
    await load(page)
    const out = await page.evaluate(() => {
      const g = document.getElementById('g')
      return [g.move('queue', 0), g.resize('notes', 'Wide'), g.remove('tasks'), g.move('nope', 1), g.resize('nope', 'S'), g.remove('nope'), g.move('sales', 99)]
    })
    expect(out).toEqual([true, true, true, false, false, false, true])
    await settle(page)
    const list = await changes(page)
    expect(list.map((c) => c.reason)).toEqual(['move', 'resize', 'remove', 'move'])
    expect(list[0].order[0]).toBe('queue')
    expect(list[1].sizes[list[1].order.indexOf('notes')]).toBe('Wide')
    expect(list[2].order).not.toContain('tasks')
    expect(list[3].order.at(-1)).toBe('sales')
    // Each is an undo step.
    expect(await page.evaluate(() => document.getElementById('g').undo())).toBe(true)
  })
})

test.describe('the grid controls', () => {
  test('render nothing without a schedule', async ({ page }) => {
    await load(page)
    const hidden = await page.evaluate(() => {
      const c = document.getElementById('c')
      return c.shadowRoot.querySelector('.wrap').hidden && c.getBoundingClientRect().height === 0
    })
    expect(hidden).toBe(true)
  })

  test('a scheduled grid gets Auto, Market hours and After close, and the next switch', async ({ page }) => {
    await load(page, '&schedule')
    const options = page.locator('ts-grid-controls .opt')
    await expect(options).toHaveText(['Auto', 'Market hours', 'After close'])
    expect(await options.evaluateAll((els) => els.map((e) => e.getAttribute('aria-pressed')))).toEqual(['true', 'false', 'false'])
    await expect(page.locator('ts-grid-controls .next')).toHaveText('Switches to After close at 15:40')
    expect(await page.evaluate(() => document.getElementById('g').profile)).toBe('market')

    await press(page, options.nth(2))
    expect(await page.evaluate(() => [document.getElementById('g').profile, document.getElementById('g').profileOverride])).toEqual(['closed', 'closed'])
    expect(await options.evaluateAll((els) => els.map((e) => e.getAttribute('aria-pressed')))).toEqual(['false', 'false', 'true'])
    await press(page, options.nth(1))
    expect(await page.evaluate(() => document.getElementById('g').profileOverride)).toBe('market')
    await press(page, options.nth(0))
    expect(await page.evaluate(() => [document.getElementById('g').profile, document.getElementById('g').profileOverride])).toEqual(['market', null])
    expect(await options.evaluateAll((els) => els.map((e) => e.getAttribute('aria-pressed')))).toEqual(['true', 'false', 'false'])
    const small = await options.evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 44).length)
    expect(small).toBe(0)
  })

  test('the switcher appears when the schedule is set after the page loaded, and is gone when it is cleared', async ({ page }) => {
    await load(page)
    await page.evaluate(async () => {
      const { calendar, frozenClock } = await import('/test/browser/fixtures/data.js')
      const g = document.getElementById('g')
      g.clock = frozenClock
      g.schedule = { calendar, market: { sessions: ['nse-fo'] } }
    })
    await expect(page.locator('ts-grid-controls .opt')).toHaveCount(3)
    await expect(page.locator('ts-grid-controls .wrap')).toBeVisible()
    await page.evaluate(() => { document.getElementById('g').schedule = null })
    await expect(page.locator('ts-grid-controls .wrap')).toBeHidden()
  })

  test('uses the grid’s messages', async ({ page }) => {
    await load(page, '&schedule&lang=de')
    await expect(page.locator('ts-grid-controls .opt').first()).toHaveText('Automatisch')
    await expect(page.locator('ts-grid-controls .next')).toHaveText('Wechselt zu After close um 15:40')
  })
})

test.describe('the edit pill', () => {
  const addButton = (page) => page.locator('ts-grid .pill .add')

  test('with the controls linking a picker, Add opens it, and focus returns to Add', async ({ page }) => {
    await load(page)
    await page.evaluate(() => { document.getElementById('g').editing = true })
    await settle(page)
    await expect(addButton(page)).toBeVisible()
    await expect(addButton(page).locator('.t')).toHaveText('Add')
    expect(await page.evaluate(() => typeof document.getElementById('g').openPicker)).toBe('function')
    await press(page, addButton(page))
    await expect(sheet(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sheet(page)).toBeHidden()
    // Escape closed the sheet and left edit mode alone.
    expect(await page.evaluate(() => document.getElementById('g').editing)).toBe(true)
    await expect(addButton(page)).toBeFocused()
  })

  test('shows Add even when nothing is hidden, and the picker lists the restores first', async ({ page }) => {
    await load(page)
    await page.evaluate(() => { const g = document.getElementById('g'); g.editing = true; g.remove('tasks') })
    await settle(page)
    await press(page, addButton(page))
    expect((await visibleRowLabels(page))[0]).toBe('Tasks')
    await press(page, chip(page, 'Add back'))
    await expect(sheet(page)).toBeHidden()
    expect((await changes(page, 'add')).map((c) => c.id)).toEqual(['tasks'])
  })

  test('without a linked picker the pill keeps Add back (n)', async ({ page }) => {
    await load(page, '&link=off')
    await page.evaluate(() => { const g = document.getElementById('g'); g.editing = true; g.remove('tasks') })
    await settle(page)
    await expect(addButton(page).locator('.t')).toHaveText('Add back (1)')
    expect(await page.evaluate(() => document.getElementById('g').openPicker)).toBeNull()
  })

  test('removing the controls puts the pill back', async ({ page }) => {
    await load(page)
    await page.evaluate(() => { const g = document.getElementById('g'); g.editing = true; g.remove('tasks') })
    await settle(page)
    await expect(addButton(page).locator('.t')).toHaveText('Add')
    await page.evaluate(() => document.getElementById('c').remove())
    await expect(addButton(page).locator('.t')).toHaveText('Add back (1)')
  })
})

test.describe('the catalog', () => {
  test('a widget registered after the grid rendered is drawn, and offered', async ({ page }) => {
    await load(page)
    const result = await page.evaluate(async () => {
      const { TsWidget, defineWidget, widgetCatalog } = await import('/src/elements/index.js')
      class Late extends TsWidget {
        static spec = { label: 'Late', sizes: ['S', 'Wide'], description: 'Registered after load.', category: 'Mine' }
        static dataShape = {}
        static template() { return '' }
        static viewModel() { return { label: 'Late', ariaLabel: 'Late' } }
        update() {}
      }
      const g = document.getElementById('g')
      defineWidget('x-late', Late, { type: 'late' })
      g.addTypes = '*'
      return Object.keys(widgetCatalog()).includes('late')
    })
    expect(result).toBe(true)
    await openSheet(page)
    await search(page).fill('registered after')
    expect(await visibleRowLabels(page)).toEqual(['Late'])
    await expect(page.locator('ts-widget-picker .group-title')).toHaveText('Mine')
  })
})
