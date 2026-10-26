// createDashboard() with the real <ts-grid> and widgets: tiles from a layout,
// update() reaching only the tiles named, the grid's add and restore answering
// with no host code, a removed tile keeping its data, and destroy().
import { test, expect } from '@playwright/test'

const PAGE = '/test/browser/fixtures/dashboard.html'

let errors
test.beforeEach(async ({ page }) => {
  errors = []
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => {
  expect(errors).toEqual([])
})

const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
async function load(page, query = '') {
  await page.goto(PAGE + query)
  await page.waitForFunction(() => window.__ready === true)
  await settle(page)
}
// What a tile shows, read through its shadow root.
const text = (page, id) => page.evaluate((i) => document.querySelector(`ts-grid > [item="${i}"]`).shadowRoot.textContent.replace(/\s+/g, ' ').trim(), id)

test('renders a tile per item of every profile, with its data', async ({ page }) => {
  await load(page)
  const ids = await page.evaluate(() => [...document.querySelectorAll('ts-grid > [item]')].map((el) => `${el.localName}#${el.getAttribute('item')}`))
  expect(ids).toEqual(['ts-metric#revenue', 'ts-progress#usage', 'ts-chart#trend'])
  expect(await page.evaluate(() => document.querySelector('ts-grid').getAttribute('aria-label'))).toBe('Fixture dashboard')
  expect(await text(page, 'revenue')).toContain('1,200')
  expect(await text(page, 'usage')).toContain('Quota used')
  // The closed profile's chart exists but is not on show.
  expect(await page.evaluate(() => document.querySelector('[item="trend"]').getBoundingClientRect().width)).toBe(0)
})

test('update() changes the named tile and leaves the others', async ({ page }) => {
  await load(page)
  const before = await text(page, 'usage')
  await page.evaluate(() => window.__dashboard.update({ revenue: { value: 3400, previous: 1100 } }))
  await settle(page)
  expect(await text(page, 'revenue')).toContain('3,400')
  expect(await text(page, 'usage')).toBe(before)
})

test('the grid adds a tile with no host code, and set() reaches it', async ({ page }) => {
  await load(page)
  const id = await page.evaluate(() => window.__dashboard.grid.add({ type: 'metric', id: 'visits' }))
  expect(id).toBe('visits')
  await settle(page)
  expect(await page.evaluate(() => window.__dashboard.set('visits', { value: 77 }))).toBe(true)
  await settle(page)
  expect(await text(page, 'visits')).toContain('77')
  expect(await page.evaluate(() => window.__dashboard.grid.layout.profiles.market.map((i) => i.id))).toContain('visits')
})

test('with addTypes null the grid add is not answered', async ({ page }) => {
  await load(page, '?add=off')
  expect(await page.evaluate(() => window.__dashboard.grid.add({ type: 'metric', id: 'visits' }))).toBe(null)
})

test('a removed tile keeps its child and its data, and Add back shows the current figures', async ({ page }) => {
  await load(page)
  expect(await page.evaluate(() => window.__dashboard.grid.remove('revenue'))).toBe(true)
  await settle(page)
  expect(await page.evaluate(() => window.__dashboard.grid.hiddenItems.map((h) => h.id))).toContain('revenue')
  await page.evaluate(() => window.__dashboard.set('revenue', { value: 9100, previous: 1100 }))
  expect(await page.evaluate(() => window.__dashboard.grid.restore('revenue'))).toBe(true)
  await settle(page)
  expect(await text(page, 'revenue')).toContain('9,100')
})

test('persist restores an added tile in a new dashboard, with a child for it', async ({ page }) => {
  await load(page, '?persist=dash-fixture')
  await page.evaluate(() => window.__dashboard.grid.add({ type: 'card', id: 'notes' }))
  await settle(page)
  await page.reload()
  await page.waitForFunction(() => window.__ready === true)
  await settle(page)
  expect(await page.evaluate(() => [...document.querySelectorAll('ts-grid > [item]')].map((el) => el.getAttribute('item')))).toContain('notes')
})

test('destroy() takes the grid off the page and is safe twice', async ({ page }) => {
  await load(page)
  await page.evaluate(() => { window.__dashboard.destroy(); window.__dashboard.destroy() })
  expect(await page.evaluate(() => document.querySelector('ts-grid'))).toBe(null)
  expect(await page.evaluate(() => window.__dashboard.set('revenue', 1))).toBe(false)
})
