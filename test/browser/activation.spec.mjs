// Tile activation and point selection in real engines (RFC 0003 §7):
// href, activatable, stretched-link pattern, focus ring, keyboard (Enter/Space),
// chart point selection, and edit-mode suppression.
import { test, expect } from '@playwright/test'

const GRID = '/test/browser/fixtures/grid.html?mode=explicit'

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

async function load(page, query = '') {
  await page.goto(`${GRID}${query}`)
  await page.waitForFunction(() => window.__ready === true)
  await page.evaluate(() => {
    window.__actions = []
    document.addEventListener('ts-action', (e) => {
      window.__actions.push(e.detail)
    })
  })
}

test.describe('href stretched link pattern', () => {
  test('an href attribute makes the label a link and stretches across the tile', async ({ page }) => {
    await load(page)
    await page.evaluate(() => {
      const card = document.querySelector('ts-card[item="notes"]')
      card.setAttribute('href', '#notes-detail')
      card.innerHTML = '<span slot="value">42</span>'
    })

    const card = page.locator('ts-card[item="notes"]')
    const link = card.locator('[part~="link"]')
    await expect(link).toHaveAttribute('href', '#notes-detail')

    // Click on the tile surface (away from the label text)
    const box = await card.boundingBox()
    await page.mouse.click(box.x + box.width - 20, box.y + box.height - 20)

    expect(page.url()).toContain('#notes-detail')
  })

  test('inner buttons inside an href tile still receive clicks without triggering the link', async ({ page }) => {
    await load(page)
    await page.evaluate(() => {
      window.__innerClicked = 0
      const card = document.querySelector('ts-card[item="notes"]')
      card.setAttribute('href', '#should-not-reach')
      card.innerHTML = '<button type="button" id="inner-btn" slot="actions">Action</button>'
      card.querySelector('#inner-btn').addEventListener('click', (e) => {
        e.stopPropagation()
        e.preventDefault()
        window.__innerClicked++
      })
    })

    const innerBtn = page.locator('#inner-btn')
    await innerBtn.click()

    const clicked = await page.evaluate(() => window.__innerClicked)
    expect(clicked).toBe(1)
    expect(page.url()).not.toContain('#should-not-reach')
  })
})

test.describe('activatable attribute and keyboard support', () => {
  test('clicking an activatable tile fires ts-action { action: "open", id }', async ({ page }) => {
    await load(page)
    await page.evaluate(() => {
      const metric = document.querySelector('ts-metric[item="sales"]')
      metric.setAttribute('activatable', '')
    })

    const metric = page.locator('ts-metric[item="sales"]')
    const box = await metric.boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

    const actions = await page.evaluate(() => window.__actions)
    expect(actions).toEqual([{ action: 'open', id: 'sales' }])
  })

  test('Enter and Space activate the tile when focused and focus ring is visible', async ({ page }) => {
    await load(page)
    await page.evaluate(() => {
      const card = document.querySelector('ts-card[item="tasks"]')
      card.setAttribute('activatable', '')
    })

    const card = page.locator('ts-card[item="tasks"]')
    const linkBtn = card.locator('[part~="link"]')
    await linkBtn.focus()

    // Focus ring on the whole tile via :has([part~="link"]:focus-visible)
    const outline = await card.evaluate((el) => {
      const tile = el.shadowRoot.querySelector('.tile')
      const style = window.getComputedStyle(tile)
      return {
        outlineStyle: style.outlineStyle,
      }
    })
    expect(outline.outlineStyle).not.toBe('none')

    await page.keyboard.press('Enter')
    let actions = await page.evaluate(() => window.__actions)
    expect(actions).toEqual([{ action: 'open', id: 'tasks' }])

    await page.keyboard.press('Space')
    actions = await page.evaluate(() => window.__actions)
    expect(actions).toEqual([
      { action: 'open', id: 'tasks' },
      { action: 'open', id: 'tasks' },
    ])
  })
})

test.describe('chart point selection', () => {
  test('chart points fire ts-action { action: "select", value } on click and Enter', async ({ page }) => {
    await load(page)
    await page.evaluate(() => {
      const chart = document.querySelector('ts-chart[item="traffic"]')
      chart.data = {
        series: [
          { name: 'Requests', points: [{ x: 1, y: 10 }, { x: 2, y: 20 }, { x: 3, y: 15 }] },
        ],
      }
      chart.actions = ['select']
    })

    const chart = page.locator('ts-chart[item="traffic"]')
    const points = chart.locator('.pt')
    await expect(points.first()).toBeVisible()
    const count = await points.count()
    expect(count).toBe(3)

    // Click the first point
    await points.first().click()
    let actions = await page.evaluate(() => window.__actions)
    expect(actions.length).toBe(1)
    expect(actions[0].action).toBe('select')
    expect(actions[0].index).toBe(0)

    // Focus the second point and press Enter
    await points.nth(1).focus()
    await page.keyboard.press('Enter')
    actions = await page.evaluate(() => window.__actions)
    expect(actions.length).toBe(2)
    expect(actions[1].action).toBe('select')
    expect(actions[1].index).toBe(1)
  })
})

test.describe('edit-mode suppression', () => {
  test('activatable tiles, href links and chart points are inert while grid is editing', async ({ page }) => {
    await load(page)
    await page.evaluate(() => {
      const metric = document.querySelector('ts-metric[item="sales"]')
      metric.setAttribute('activatable', '')
      const card = document.querySelector('ts-card[item="notes"]')
      card.setAttribute('href', '#suppressed')
      const chart = document.querySelector('ts-chart[item="traffic"]')
      chart.actions = ['select']

      const grid = document.getElementById('g')
      grid.editing = true
    })

    // Try clicking activatable tile
    const metric = page.locator('ts-metric[item="sales"]')
    const mBox = await metric.boundingBox()
    await page.mouse.click(mBox.x + mBox.width / 2, mBox.y + mBox.height / 2)

    // Try clicking chart point
    const point = page.locator('ts-chart[item="traffic"] .pt').first()
    await point.click({ force: true })

    // Try clicking href tile
    const card = page.locator('ts-card[item="notes"]')
    const cBox = await card.boundingBox()
    await page.mouse.click(cBox.x + cBox.width / 2, cBox.y + cBox.height / 2)

    const actions = await page.evaluate(() => window.__actions)
    expect(actions).toEqual([])
    expect(page.url()).not.toContain('#suppressed')
  })
})
