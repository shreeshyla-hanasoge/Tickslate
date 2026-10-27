// The mini chart's instrument picker and the base widget's Expand button (RFC 0005 §2, issue #69): each is named, each
// fires one request and changes nothing itself, and each does nothing while the grid is being edited. The pure parts are
// in test/mini-chart.test.mjs; this drives the real controls on an activatable tile, where the lift matters.
import { test, expect } from '@playwright/test'

const PAGE = '/test/browser/fixtures/mini-chart.html'

let errors
test.beforeEach(async ({ page }) => {
  errors = []
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(PAGE)
  await page.waitForFunction(() => window.__ready === true)
  await page.evaluate(async () => {
    const choices = [{ id: 'abc', label: 'ABC Corp' }, { id: 'xyz', label: 'XYZ Ltd' }]
    const data = window.__mc.dataFor('ts-mini-chart')
    data.charts[0].instruments = choices
    data.charts[0].instrumentId = 'abc'
    data.charts[1].instruments = choices
    data.charts[1].instrumentId = 'xyz'
    window.__actions = []
    for (const id of ['m', 'l', 'xl']) {
      const el = document.getElementById(id)
      el.actions = ['instrument', 'expand']
      el.setAttribute('item', `tile-${id}`)
      el.setAttribute('activatable', '')
      el.data = structuredClone(data)
      el.addEventListener('ts-action', (e) => window.__actions.push({ tile: id, ...e.detail }))
    }
    await window.__mc.nextFrame()
  })
})
test.afterEach(() => expect(errors).toEqual([]))

const inside = (page, id) => page.locator(`#${id}`)

test('the picker is a named select at M, L and XL, two of them at XL', async ({ page }) => {
  await expect(inside(page, 'm').getByRole('combobox', { name: 'Instrument', exact: true })).toHaveValue('abc')
  await expect(inside(page, 'l').getByRole('combobox', { name: 'Instrument', exact: true })).toHaveValue('abc')
  await expect(inside(page, 'xl').getByRole('combobox', { name: 'Instrument, chart 1 of 2' })).toHaveValue('abc')
  await expect(inside(page, 'xl').getByRole('combobox', { name: 'Instrument, chart 2 of 2' })).toHaveValue('xyz')
})

test('choosing fires one instrument request and the widget does not switch itself', async ({ page }) => {
  await inside(page, 'm').getByRole('combobox', { name: 'Instrument' }).selectOption('xyz')
  expect(await page.evaluate(() => window.__actions)).toEqual([{ tile: 'm', action: 'instrument', id: 'abc', value: 'xyz' }])
  expect(await page.evaluate(() => document.getElementById('m').data.charts[0].instrumentId)).toBe('abc')
})

test('preventDefault puts the picker back; new data wins', async ({ page }) => {
  await page.evaluate(() => document.getElementById('l').addEventListener('ts-action', (e) => e.preventDefault()))
  const select = inside(page, 'l').getByRole('combobox', { name: 'Instrument' })
  await select.selectOption('xyz')
  await expect(select).toHaveValue('abc')
})

test('Expand is named for the tile, absent without the opt-in, and fires one request', async ({ page }) => {
  for (const id of ['m', 'l', 'xl']) await expect(inside(page, id).getByRole('button', { name: 'Expand Watch' })).toBeVisible()
  await inside(page, 'l').getByRole('button', { name: 'Expand Watch' }).click()
  expect(await page.evaluate(() => window.__actions)).toEqual([{ tile: 'l', action: 'expand', id: 'tile-l' }])
  await page.evaluate(() => { document.getElementById('m').actions = ['instrument'] })
  await expect(inside(page, 'm').getByRole('button', { name: /Expand/ })).toHaveCount(0)
})

test('both are inert in edit mode', async ({ page }) => {
  await page.evaluate(() => {
    const grid = document.createElement('ts-grid')
    grid.setAttribute('editing', '')
    const tile = document.getElementById('l')
    tile.before(grid)
    grid.append(tile)
  })
  await page.evaluate(() => {
    const root = document.getElementById('l').shadowRoot
    const select = root.querySelector('select')
    select.value = 'xyz'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    root.querySelector('[part=expand]').click()
  })
  expect(await page.evaluate(() => window.__actions)).toEqual([])
  expect(await page.evaluate(() => document.getElementById('l').shadowRoot.querySelector('select').value)).toBe('abc')
})

test('a coarse pointer gets 44px targets for both', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 700, height: 900 } })
  const page = await context.newPage()
  await page.goto(PAGE)
  await page.waitForFunction(() => window.__ready === true)
  // Only an engine that reports a coarse pointer for a touch context (the mobile projects) can show the floor.
  test.skip(!(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)), 'this engine reports a fine pointer')
  const sizes = await page.evaluate(async () => {
    const data = window.__mc.dataFor('ts-mini-chart')
    data.charts[0].instruments = [{ id: 'abc', label: 'ABC Corp' }, { id: 'xyz', label: 'XYZ Ltd' }]
    data.charts[0].instrumentId = 'abc'
    const el = document.getElementById('l')
    el.actions = ['instrument', 'expand']
    el.data = data
    await window.__mc.nextFrame()
    const root = el.shadowRoot
    const box = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] }
    return { select: box(root.querySelector('select')), expand: box(root.querySelector('[part=expand]')) }
  })
  for (const [w, h] of Object.values(sizes)) { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44) }
  await context.close()
})
