// Tile activation and point selection in real engines (RFC 0003 §7):
// href, activatable, stretched-link pattern, slotted content, focus ring,
// keyboard (Enter/Space), chart point selection and edit-mode suppression.
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

const actionsOf = (page) => page.evaluate(() => window.__actions)
// Read from the page, not from page.url(): a same-document hash change reaches the test process a moment after the click does.
const hashOf = (page) => page.evaluate(() => location.hash)
const centre = (box) => [box.x + box.width / 2, box.y + box.height / 2]
// A real pointer click at the element's centre. locator.click() would wait forever on an element the tile overlay sits above, which is the very thing under test.
const clickOn = async (page, locator) => {
  // The mouse only reaches what is on screen, and a phone stacks the tiles below the fold.
  await locator.scrollIntoViewIfNeeded()
  await page.mouse.click(...centre(await locator.boundingBox()))
}

test.describe('href stretched link pattern', () => {
  test('an href attribute makes the label a link and stretches across the tile', async ({ page }) => {
    await load(page)
    await page.evaluate(() => {
      const card = document.querySelector('ts-card[item="notes"]')
      card.setAttribute('href', '#notes-detail')
    })

    const card = page.locator('ts-card[item="notes"]')
    await expect(card.locator('[part~="link"]')).toHaveAttribute('href', '#notes-detail')

    // Away from the label text, in the tile's far corner.
    const box = await card.boundingBox()
    await page.mouse.click(box.x + box.width - 20, box.y + box.height - 20)

    await expect(page).toHaveURL(/#notes-detail$/)
  })

  test('clicking slotted text inside an href tile follows the link', async ({ page }) => {
    await load(page)
    await page.evaluate(() => document.querySelector('ts-card[item="notes"]').setAttribute('href', '#from-value'))

    // The seeded card has <span slot="value">42</span>; a user clicks the number, not the corner.
    await clickOn(page, page.locator('ts-card[item="notes"] [slot="value"]'))
    await expect(page).toHaveURL(/#from-value$/)
  })

  test('inner buttons inside an href tile still receive clicks without triggering the link', async ({ page }) => {
    await load(page)
    await page.evaluate(() => {
      window.__innerClicked = 0
      const card = document.querySelector('ts-card[item="notes"]')
      card.setAttribute('href', '#should-not-reach')
      card.innerHTML = '<button type="button" id="inner-btn" slot="actions">Action</button>'
      card.querySelector('#inner-btn').addEventListener('click', () => {
        window.__innerClicked++
      })
    })

    await page.locator('#inner-btn').click()

    expect(await page.evaluate(() => window.__innerClicked)).toBe(1)
    expect(await hashOf(page)).not.toBe('#should-not-reach')
  })

  test('a rejected href renders no link, and does not stop activatable from working', async ({ page }) => {
    await load(page)
    await page.evaluate(() => {
      const card = document.querySelector('ts-card[item="tasks"]')
      card.setAttribute('href', 'javascript:window.__pwned = true')
      card.setAttribute('activatable', '')
    })

    const link = page.locator('ts-card[item="tasks"] [part~="link"]')
    await expect(link).toHaveJSProperty('localName', 'button')
    await link.focus()
    await page.keyboard.press('Enter')
    expect(await actionsOf(page)).toEqual([{ action: 'open', id: 'tasks' }])
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined()
  })

  test('a protocol-relative href is rejected like an unsupported scheme', async ({ page }) => {
    await load(page)
    await page.evaluate(() => document.querySelector('ts-card[item="notes"]').setAttribute('href', '//evil.example/x'))
    await expect(page.locator('ts-card[item="notes"] [part~="link"]')).toHaveCount(0)
  })
})

test.describe('activatable attribute and keyboard support', () => {
  test('clicking an activatable tile fires ts-action { action: "open", id }', async ({ page }) => {
    await load(page)
    await page.evaluate(() => {
      document.querySelector('ts-metric[item="sales"]').setAttribute('activatable', '')
    })

    const box = await page.locator('ts-metric[item="sales"]').boundingBox()
    await page.mouse.click(...centre(box))

    expect(await actionsOf(page)).toEqual([{ action: 'open', id: 'sales' }])
  })

  test('clicking slotted value text of an activatable card opens it once', async ({ page }) => {
    await load(page)
    await page.evaluate(() => document.querySelector('ts-card[item="notes"]').setAttribute('activatable', ''))

    await clickOn(page, page.locator('ts-card[item="notes"] [slot="value"]'))

    expect(await actionsOf(page)).toEqual([{ action: 'open', id: 'notes' }])
  })

  test('plain slotted content in the default slot does not block the tile', async ({ page }) => {
    await load(page)
    await page.evaluate(() => document.querySelector('ts-card[item="queue"]').setAttribute('activatable', ''))

    // The queue card's list is plain content in the default slot.
    await clickOn(page, page.locator('ts-card[item="queue"] li').first())
    expect(await actionsOf(page)).toEqual([{ action: 'open', id: 'queue' }])
  })

  test('a slotted button gets its own click and does not open the tile', async ({ page }) => {
    await load(page)
    await page.evaluate(() => {
      window.__innerClicked = 0
      const card = document.querySelector('ts-card[item="notes"]')
      card.setAttribute('activatable', '')
      card.insertAdjacentHTML('beforeend', '<button type="button" id="slotted-btn" slot="footer">More</button>')
      card.querySelector('#slotted-btn').addEventListener('click', () => {
        window.__innerClicked++
      })
    })

    await page.locator('#slotted-btn').click()

    expect(await page.evaluate(() => window.__innerClicked)).toBe(1)
    expect(await actionsOf(page)).toEqual([])
  })

  test('a slotted link and an element with tabindex keep their own clicks', async ({ page }) => {
    await load(page)
    await page.evaluate(() => {
      window.__innerClicked = 0
      const card = document.querySelector('ts-card[item="notes"]')
      card.setAttribute('activatable', '')
      card.insertAdjacentHTML('beforeend', '<a href="#own" id="slotted-a" slot="footer">Own</a><span tabindex="0" id="slotted-ti" slot="footer">Focusable</span>')
      card.querySelector('#slotted-ti').addEventListener('click', () => {
        window.__innerClicked++
      })
    })

    await page.locator('#slotted-a').click()
    await expect(page).toHaveURL(/#own$/)
    await page.locator('#slotted-ti').click()

    expect(await page.evaluate(() => window.__innerClicked)).toBe(1)
    expect(await actionsOf(page)).toEqual([])
  })

  test('Enter and Space activate the tile when focused, and the focus ring is on the link overlay', async ({ page }) => {
    await load(page)
    await page.evaluate(() => {
      document.querySelector('ts-card[item="tasks"]').setAttribute('activatable', '')
    })

    const card = page.locator('ts-card[item="tasks"]')
    // Focus from script, because WebKit's Tab skips buttons unless the user has opted in; with no pointer used yet it still matches :focus-visible.
    await card.locator('[part~="link"]').focus()

    const ring = await card.evaluate((el) => {
      const style = getComputedStyle(el.shadowRoot.querySelector('[part~="link"]'), '::after')
      return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth }
    })
    expect(ring.outlineStyle).not.toBe('none')
    expect(ring.outlineWidth).toBe('2px')

    await page.keyboard.press('Enter')
    expect(await actionsOf(page)).toEqual([{ action: 'open', id: 'tasks' }])

    await page.keyboard.press('Space')
    expect(await actionsOf(page)).toEqual([
      { action: 'open', id: 'tasks' },
      { action: 'open', id: 'tasks' },
    ])
  })
})

test.describe('chart point selection', () => {
  const series = (n, x0 = 1700000000000, step = 3600000) => ({
    series: [{ name: 'Requests', points: Array.from({ length: n }, (_, i) => ({ x: x0 + i * step, y: 10 + (i % 7) })) }],
  })

  async function setChart(page, data) {
    await page.evaluate((d) => {
      const chart = document.querySelector('ts-chart[item="traffic"]')
      chart.data = d
      chart.actions = ['select']
    }, data)
  }

  test('chart points fire ts-action { action: "select", value } on click and Enter', async ({ page }) => {
    await load(page)
    await setChart(page, { series: [{ name: 'Requests', points: [{ x: 1, y: 10 }, { x: 2, y: 20 }, { x: 3, y: 15 }] }] })

    const points = page.locator('ts-chart[item="traffic"] .pt')
    await expect(points).toHaveCount(3)

    await points.first().click()
    let actions = await actionsOf(page)
    expect(actions.length).toBe(1)
    expect(actions[0].action).toBe('select')
    expect(actions[0].index).toBe(0)

    await points.nth(1).focus()
    await page.keyboard.press('Enter')
    actions = await actionsOf(page)
    expect(actions.length).toBe(2)
    expect(actions[1].index).toBe(1)

    await page.keyboard.press('Space')
    expect((await actionsOf(page)).length).toBe(3)
  })

  test('a time axis names points by date, in the page locale, and keeps the raw x in the event', async ({ page }) => {
    await load(page)
    await setChart(page, series(3, 1700000000000, 86400000))

    const first = page.locator('ts-chart[item="traffic"] .pt').first()
    const label = await first.getAttribute('aria-label')
    expect(label).not.toMatch(/\d{9,}/)
    expect(label).toMatch(/2023/)
    expect(label).toContain('Requests')

    await first.click()
    expect((await actionsOf(page))[0].value).toBe(1700000000000)
  })

  test('200 points are one tab stop, and the arrow keys move between them', async ({ page }) => {
    await load(page)
    await setChart(page, series(200))
    const chart = page.locator('ts-chart[item="traffic"]')
    await expect(chart.locator('.pt')).toHaveCount(200)

    expect(await chart.locator('.pt[tabindex="0"]').count()).toBe(1)
    expect(await chart.locator('.pt[tabindex="-1"]').count()).toBe(199)

    // One Tab from the control before the chart lands on its scrubber (RFC 0004 §1.4), the next on the group of points, and a third leaves it.
    await page.locator('ts-card[item="tasks"]').evaluate((el) => el.setAttribute('tabindex', '0'))
    await page.locator('ts-card[item="tasks"]').focus()
    await page.keyboard.press('Tab')
    expect(await chart.evaluate((el) => el.shadowRoot.activeElement?.getAttribute('data-k') ?? null)).toBe('scrubSlider')
    await page.keyboard.press('Tab')
    const active = () => chart.evaluate((el) => el.shadowRoot.activeElement?.getAttribute('data-index') ?? null)
    expect(await active()).toBe('0')

    await page.keyboard.press('ArrowRight')
    expect(await active()).toBe('1')
    await page.keyboard.press('ArrowDown')
    expect(await active()).toBe('2')
    await page.keyboard.press('ArrowLeft')
    expect(await active()).toBe('1')
    await page.keyboard.press('End')
    expect(await active()).toBe('199')
    await page.keyboard.press('ArrowRight')
    expect(await active()).toBe('199')
    await page.keyboard.press('Home')
    expect(await active()).toBe('0')

    // The tab stop followed the arrows, so Tab and Shift+Tab come back to where the user was.
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    expect(await chart.locator('.pt[tabindex="0"]').count()).toBe(1)
    await page.keyboard.press('Enter')
    expect((await actionsOf(page)).pop().index).toBe(2)
    await page.keyboard.press('Tab')
    expect(await active()).toBeNull()
    await page.keyboard.press('Shift+Tab')
    expect(await active()).toBe('2')
  })
})

test.describe('edit-mode suppression', () => {
  test('activatable tiles, href links and chart points are inert while grid is editing', async ({ page }) => {
    await load(page)
    await page.evaluate(() => {
      document.querySelector('ts-metric[item="sales"]').setAttribute('activatable', '')
      document.querySelector('ts-card[item="notes"]').setAttribute('href', '#suppressed')
      document.querySelector('ts-chart[item="traffic"]').actions = ['select']
    })

    const chart = page.locator('ts-chart[item="traffic"]')
    const points = chart.locator('.pt')
    // The points exist before editing starts, so the assertions below cannot pass for want of buttons.
    expect(await points.count()).toBeGreaterThan(0)
    const pointBox = await points.first().boundingBox()

    await page.evaluate(() => {
      document.getElementById('g').editing = true
    })

    // The grid takes the tiles out of the tab order and the pointer's reach while editing.
    expect(await chart.evaluate((el) => el.inert)).toBe(true)
    await points.first().focus()
    expect(await page.evaluate(() => document.activeElement?.localName)).not.toBe('ts-chart')
    expect(await chart.evaluate((el) => el.shadowRoot.activeElement)).toBeNull()

    await page.mouse.click(...centre(pointBox))
    await page.keyboard.press('Enter')
    await page.keyboard.press('Space')

    const mBox = await page.locator('ts-metric[item="sales"]').boundingBox()
    await page.mouse.click(...centre(mBox))
    const cBox = await page.locator('ts-card[item="notes"]').boundingBox()
    await page.mouse.click(...centre(cBox))

    expect(await actionsOf(page)).toEqual([])
    expect(await hashOf(page)).not.toBe('#suppressed')
    expect(await points.count()).toBeGreaterThan(0)
  })
})
