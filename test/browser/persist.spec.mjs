// <ts-grid persist> in real engines: an edit survives a reload with no script
// beyond the import, the attribute can be changed or removed on a live grid,
// and a grid nothing saves says so on its first edit (RFC 0003 §4).
// The fixture is the implicit one: three children in markup, nothing else.
import { test, expect } from '@playwright/test'

const PAGE = '/test/browser/fixtures/grid.html'
const LOST = 'edits will be lost on reload'

let errors
let warnings
test.beforeEach(async ({ page }) => {
  errors = []
  warnings = []
  // Network off: only the dev server answers.
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
    if (msg.type() === 'warning') warnings.push(msg.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => {
  expect(errors).toEqual([])
})

// The fixture's grid with the attribute on it as the parser creates it, so it is there at upgrade, as when
// a host writes it in markup. The element modules run after parsing, so this beats them. (Rewriting the page
// through route.fulfill would make Chromium treat it as public and block the dev server's local websocket.)
async function withPersist(page, key) {
  await page.addInitScript((k) => {
    new MutationObserver((records, observer) => {
      const g = document.getElementById('g')
      if (!g) return
      g.setAttribute('persist', k)
      observer.disconnect()
    }).observe(document, { childList: true, subtree: true })
  }, key)
}

async function load(page) {
  await page.goto(PAGE)
  await page.waitForFunction(() => window.__ready === true)
  await settle(page)
}
// Two frames: the grid places tiles on the frame after a layout or a size change.
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
const stored = (page, prefix = 'demo:') => page.evaluate((p) => Object.keys(localStorage).filter((k) => k.startsWith(p)), prefix)
// The ids a saved entry holds, whichever device wrote it.
const savedIds = (page, prefix) => page.evaluate((p) => {
  const key = Object.keys(localStorage).find((k) => k.startsWith(p))
  return key ? JSON.parse(localStorage.getItem(key)).profiles.market.map((i) => i.id) : null
}, prefix)

// Tile ids as they sit on screen, top to bottom then left to right.
const onScreen = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#g > [item]')]
    .filter((el) => el.getBoundingClientRect().width > 0)
    .map((el) => {
      const [x, y = 0] = el.style.translate.split(' ').map(parseFloat)
      return { id: el.getAttribute('item'), x, y }
    })
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((t) => t.id))

async function press(locator) {
  if (test.info().project.use.hasTouch) await locator.tap()
  else await locator.click()
}

// Edit mode through the keyboard door, then the tile's own Remove button.
async function removeTile(page, id) {
  await page.evaluate(() => { document.getElementById('g').editing = true })
  await settle(page)
  await press(page.locator(`ts-grid .chrome[data-id="${id}"] .remove`))
  await settle(page)
  // The grid ignores a second remove within 400 ms, taking it for a double click.
  await page.waitForTimeout(450)
}

test('an edit survives a reload with persist="demo" and no script', async ({ page }) => {
  await withPersist(page, 'demo')
  await load(page)
  expect(await onScreen(page)).toEqual(['sales', 'notes', 'tasks'])

  await removeTile(page, 'notes')
  expect(await onScreen(page)).toEqual(['sales', 'tasks'])
  // One entry per device, and the device is the one this project's viewport has.
  expect(await stored(page)).toHaveLength(1)

  await page.reload()
  await page.waitForFunction(() => window.__ready === true)
  await settle(page)
  expect(await onScreen(page)).toEqual(['sales', 'tasks'])
  expect(warnings.filter((w) => w.includes(LOST))).toEqual([])
})

test('removing the attribute on a live grid stops saving, and changing it re-keys', async ({ page }) => {
  await withPersist(page, 'demo')
  await load(page)

  await page.evaluate(() => document.getElementById('g').removeAttribute('persist'))
  await removeTile(page, 'notes')
  expect(await stored(page)).toEqual([])

  await page.evaluate(() => document.getElementById('g').setAttribute('persist', 'demo'))
  await removeTile(page, 'tasks')
  expect(await stored(page)).toHaveLength(1)
  const demo = await savedIds(page, 'demo:')
  expect(demo).not.toContain('tasks')
  expect(await stored(page, 'other:')).toEqual([])

  // Re-keying writes nothing by itself; the next edit goes to the new key and the old one is left as it was.
  await page.evaluate(() => document.getElementById('g').setAttribute('persist', 'other'))
  await settle(page)
  expect(await stored(page, 'other:')).toEqual([])
  await removeTile(page, 'sales')
  expect(await stored(page, 'other:')).toHaveLength(1)
  expect(await savedIds(page, 'other:')).not.toContain('sales')
  expect(await savedIds(page, 'demo:')).toEqual(demo)
})

test('children that arrive after connect are not hidden when the device changes with nothing saved', async ({ page }) => {
  await load(page)
  const visible = () => page.evaluate(() => [...document.querySelectorAll('#late > [item]')].filter((el) => el.getBoundingClientRect().width > 0).map((el) => el.getAttribute('item')))
  // A grid that connects empty, at desktop width, with the attribute in place.
  await page.evaluate(() => {
    document.getElementById('wrap').style.width = '1200px'
    const late = document.createElement('ts-grid')
    late.id = 'late'
    late.setAttribute('persist', 'late')
    document.getElementById('wrap').append(late)
  })
  await settle(page)
  // A framework adding its children afterwards.
  await page.evaluate(() => {
    document.getElementById('late').insertAdjacentHTML('beforeend', '<ts-card item="x" label="X" size="S"></ts-card><ts-card item="y" label="Y" size="S"></ts-card>')
  })
  await settle(page)
  await expect.poll(visible).toEqual(['x', 'y'])
  // Across the breakpoint, where nothing is saved for the phone.
  await page.evaluate(() => { document.getElementById('wrap').style.width = '360px' })
  await expect.poll(() => page.evaluate(() => document.getElementById('late').columns)).toBe(2)
  await settle(page)
  expect(await visible()).toEqual(['x', 'y'])
})

test('a grid with no saving warns once, on its first edit', async ({ page }) => {
  await load(page)
  expect(warnings.filter((w) => w.includes(LOST))).toEqual([])

  await removeTile(page, 'notes')
  await removeTile(page, 'tasks')
  const lost = warnings.filter((w) => w.includes(LOST))
  expect(lost).toHaveLength(1)
  expect(lost[0]).toContain('docs/guide/saving-layouts.md')
})
