// <ts-table> in real engines (RFC 0003 §16): cells change in place without losing focus or scroll,
// the header stays under a scrolling body, sorting and selecting work from the keyboard, and the
// column budget follows the width.
import { test, expect } from '@playwright/test'

const PAGE = '/test/browser/fixtures/table.html'

test.beforeEach(async ({ page }) => {
  // Network off: only the dev server answers.
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
})

async function open(page, query = '') {
  await page.goto(`${PAGE}?${query}`)
  await page.waitForFunction(() => window.__ready === true)
  await page.evaluate(() => window.__t.nextFrame())
}

const rowsOf = (page) => page.locator('ts-table tbody tr')
const headers = (page) => page.locator('ts-table thead th')
// The text of each body row's cells, read in one go.
const grid = (page) => page.evaluate(() => [...window.__t.el.shadowRoot.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent)))

test.describe('a real table', () => {
  test('is a table with header cells, a caption, and a sorted summary', async ({ page }) => {
    await open(page)
    const info = await page.evaluate(() => {
      const root = window.__t.el.shadowRoot
      return {
        table: !!root.querySelector('table thead tr th[scope="col"]'),
        caption: root.querySelector('caption').textContent,
        scroller: { tabindex: root.querySelector('[data-k="scroll"]').getAttribute('tabindex'), label: root.querySelector('[data-k="scroll"]').getAttribute('aria-label') },
        sorted: [...root.querySelectorAll('th')].map((th) => th.getAttribute('aria-sort')),
      }
    })
    expect(info.table).toBe(true)
    expect(info.caption).toBe('Strategies, 16 rows, sorted by P&L, descending')
    expect(info.scroller).toEqual({ tabindex: '0', label: 'Strategies' })
    expect(info.sorted.filter((s) => s === 'descending')).toHaveLength(1)
    expect(info.sorted.filter((s) => s === 'none').length).toBeGreaterThan(0)
  })

  test('signed columns carry a sign and an arrow that assistive technology skips', async ({ page }) => {
    await open(page, 'width=900&size=XL')
    const cells = await page.evaluate(() => {
      const root = window.__t.el.shadowRoot
      const col = [...root.querySelectorAll('thead th')].findIndex((th) => th.textContent.startsWith('P&L'))
      return [...root.querySelectorAll('tbody tr')].map((tr) => {
        const td = tr.children[col]
        return { text: td.textContent, cls: td.getAttribute('class'), arrowHidden: td.querySelector('.ar').getAttribute('aria-hidden'), arrow: td.querySelector('.ar').textContent }
      })
    })
    expect(cells.length).toBe(16)
    for (const c of cells) {
      expect(c.arrowHidden).toBe('true')
      if (c.arrow === '▲') {
        expect(c.text).toMatch(/^▲\+₹/)
        expect(c.cls).toContain('pos')
      } else {
        expect(c.arrow).toBe('▼')
        expect(c.text).toMatch(/^▼−₹/)
        expect(c.cls).toContain('neg')
      }
    }
  })
})

test.describe('live updates', () => {
  test('change the cells that moved and rebuild no row', async ({ page }) => {
    await open(page, 'sort=0')
    // Tag every row and cell, then tick: the same elements must carry the new figures.
    await page.evaluate(() => {
      const root = window.__t.el.shadowRoot
      root.querySelectorAll('tbody tr').forEach((tr, i) => { tr.__mark = `r${i}`; [...tr.children].forEach((td, j) => { td.__mark = `c${i}.${j}` }) })
      window.__before = [...root.querySelectorAll('tbody td')].map((td) => td.textContent)
    })
    await page.evaluate(() => window.__t.tick(40))
    await page.evaluate(() => window.__t.nextFrame())
    const after = await page.evaluate(() => {
      const root = window.__t.el.shadowRoot
      const now = [...root.querySelectorAll('tbody td')].map((td) => td.textContent)
      return {
        kept: [...root.querySelectorAll('tbody tr')].every((tr, i) => tr.__mark === `r${i}`) && [...root.querySelectorAll('tbody tr')].every((tr, i) => [...tr.children].every((td, j) => td.__mark === `c${i}.${j}`)),
        changed: now.map((t, i) => (t === window.__before[i] ? -1 : i)).filter((i) => i >= 0),
        count: now.length,
      }
    })
    expect(after.kept).toBe(true)
    // Row s3's P&L and its return, and nothing else.
    expect(after.changed).toHaveLength(2)
  })

  test('keep the scroll position and the focus on a header button', async ({ page }) => {
    await open(page, 'sort=0&rows=60&size=M')
    const scroller = page.locator('ts-table [data-k="scroll"]')
    await scroller.evaluate((el) => { el.scrollTop = 220 })
    const sortBtn = headers(page).nth(1).locator('button')
    await sortBtn.focus()
    for (let n = 1; n <= 8; n++) {
      await page.evaluate((k) => window.__t.tick(k), n * 10)
      await page.evaluate(() => window.__t.nextFrame())
    }
    expect(await scroller.evaluate((el) => el.scrollTop)).toBe(220)
    await expect(sortBtn).toBeFocused()
  })

  test('keep the focus on a row while the host\'s new sort reorders the rows around it', async ({ page }) => {
    await open(page, 'select&rows=30&size=L&width=800')
    await page.locator('ts-table tbody tr').nth(5).locator('.rowbtn').focus()
    const before = await page.evaluate(() => {
      const root = window.__t.el.shadowRoot
      window.__focused = root.activeElement
      return [...root.querySelectorAll('tbody tr')].indexOf(root.activeElement.closest('tr'))
    })
    expect(before).toBe(5)
    await page.evaluate(() => { window.__t.el.data = { ...window.__t.el.data, sort: { key: 'trades', dir: 'asc' } } })
    await page.evaluate(() => window.__t.nextFrame())
    const after = await page.evaluate(() => {
      const root = window.__t.el.shadowRoot
      return { same: root.activeElement === window.__focused, at: [...root.querySelectorAll('tbody tr')].indexOf(root.activeElement.closest('tr')) }
    })
    expect(after.same).toBe(true)
    // The rows did move around it, or this proved nothing.
    expect(after.at).not.toBe(5)
  })

  test('are never painted with a column the width will then drop', async ({ page }) => {
    await open(page, 'size=Tall&width=190')
    const labels = await headers(page).allTextContents()
    expect(labels.length).toBeLessThan(6)
    const widths = await page.evaluate(() => [...window.__t.el.shadowRoot.querySelectorAll('thead th')].map((th) => th.getBoundingClientRect().width))
    for (const w of widths) expect(w).toBeGreaterThanOrEqual(55.5)
  })
})

test.describe('sticky header', () => {
  test('stays at the top of the scroller while the body scrolls under it', async ({ page }) => {
    await open(page, 'rows=60')
    const scroller = page.locator('ts-table [data-k="scroll"]')
    await scroller.evaluate((el) => { el.scrollTop = 300 })
    const [head, box] = await page.evaluate(() => {
      const root = window.__t.el.shadowRoot
      return [root.querySelector('thead th').getBoundingClientRect().top, root.querySelector('[data-k="scroll"]').getBoundingClientRect().top]
    })
    expect(Math.abs(head - box)).toBeLessThan(1.5)
    const hit = await page.evaluate(() => {
      const root = window.__t.el.shadowRoot
      const th = root.querySelector('thead th')
      const r = th.getBoundingClientRect()
      return root.elementFromPoint(r.left + 8, r.top + r.height / 2).closest('th') === th
    })
    expect(hit).toBe(true)
  })
})

test.describe('sorting', () => {
  test('a header button sorts, again reverses, from the keyboard, and fires sort each time', async ({ page }) => {
    await open(page, 'sort=0&width=800&size=L')
    const idx = (await headers(page).allTextContents()).findIndex((t) => t.startsWith('Capital'))
    const button = headers(page).nth(idx).locator('button')
    await button.focus()
    await page.keyboard.press('Enter')
    await page.evaluate(() => window.__t.nextFrame())
    await expect(headers(page).nth(idx)).toHaveAttribute('aria-sort', 'ascending')
    const money = async () => (await grid(page)).map((r) => Number(r[idx].replace(/[^\d.]/g, '')))
    let values = await money()
    expect(values).toEqual([...values].sort((a, b) => a - b))
    // The focus is still on the button, which was not rebuilt.
    await expect(button).toBeFocused()
    await page.keyboard.press('Space')
    await page.evaluate(() => window.__t.nextFrame())
    await expect(headers(page).nth(idx)).toHaveAttribute('aria-sort', 'descending')
    values = await money()
    expect(values).toEqual([...values].sort((a, b) => b - a))
    await page.keyboard.press('Enter')
    await expect(headers(page).nth(idx)).toHaveAttribute('aria-sort', 'ascending')
    expect(await page.evaluate(() => window.__t.events)).toEqual([
      { action: 'sort', value: 'capital', dir: 'asc' },
      { action: 'sort', value: 'capital', dir: 'desc' },
      { action: 'sort', value: 'capital', dir: 'asc' },
    ])
  })

  test('sorting moves rows without rebuilding them', async ({ page }) => {
    await open(page, 'sort=0&width=800&size=L&fit')
    await page.evaluate(() => { window.__t.el.shadowRoot.querySelectorAll('tbody tr').forEach((tr, i) => { tr.__mark = i }) })
    await headers(page).nth(1).locator('button').click()
    await page.evaluate(() => window.__t.nextFrame())
    const marks = await page.evaluate(() => [...window.__t.el.shadowRoot.querySelectorAll('tbody tr')].map((tr) => tr.__mark))
    expect([...marks].sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i))
    expect(marks).not.toEqual(Array.from({ length: 16 }, (_, i) => i))
  })
})

test.describe('selecting', () => {
  test('is off by default: no row has a button', async ({ page }) => {
    await open(page)
    await expect(page.locator('ts-table .rowbtn')).toHaveCount(0)
    expect(await page.evaluate(() => window.__t.el.shadowRoot.querySelectorAll('tbody button').length)).toBe(0)
  })

  test('with actions it adds one button per row that fires select from a click and from Enter', async ({ page }) => {
    await open(page, 'select&width=800&size=L')
    expect(await page.evaluate(() => window.__t.el.shadowRoot.querySelectorAll('tbody tr button').length)).toBe(16)
    const row = await page.evaluate(() => {
      const tr = window.__t.el.shadowRoot.querySelectorAll('tbody tr')[2]
      const b = tr.querySelector('button')
      const r = tr.getBoundingClientRect()
      const br = b.getBoundingClientRect()
      return { label: b.getAttribute('aria-label'), covers: Math.abs(br.width - r.width) < 1.5 && Math.abs(br.height - r.height) < 1.5 }
    })
    expect(row.label).toMatch(/^Select \w/)
    // The button covers its whole row, so a click anywhere on it selects.
    expect(row.covers).toBe(true)
    await page.locator('ts-table tbody tr').nth(2).locator('button').click({ position: { x: 40, y: 8 } })
    await page.locator('ts-table tbody tr').nth(4).locator('button').focus()
    await page.keyboard.press('Enter')
    const events = await page.evaluate(() => window.__t.events)
    expect(events).toHaveLength(2)
    expect(events.every((e) => e.action === 'select' && /^s\d+$/.test(e.id))).toBe(true)
  })

  test('a sort press while selecting still sorts and does not select', async ({ page }) => {
    await open(page, 'select&width=800&size=L&fit')
    await headers(page).nth(1).locator('button').click()
    const events = await page.evaluate(() => window.__t.events)
    expect(events.map((e) => e.action)).toEqual(['sort'])
  })
})

test.describe('the column budget', () => {
  test('hides columns by priority as the width shrinks, none under 56px, never scrolls sideways, and brings them back', async ({ page }) => {
    await open(page, 'size=XL&width=900')
    const shown = async () => headers(page).allTextContents().then((all) => all.map((t) => t.replace(/[↑↓]/g, '').trim()))
    expect(await shown()).toEqual(['Strategy', 'P&L', 'Return', 'Capital', 'Trades', 'Avg hold'])
    await page.evaluate(() => window.__t.width(300))
    await page.waitForFunction(() => window.__t.el.shadowRoot.querySelectorAll('thead th').length < 6)
    await page.evaluate(() => window.__t.nextFrame())
    const kept = await shown()
    // The lowest priority numbers stay, in data order: Strategy (0) and P&L (1) first.
    expect(kept.slice(0, 2)).toEqual(['Strategy', 'P&L'])
    expect(kept).not.toContain('Avg hold')
    const info = await page.evaluate(() => {
      const root = window.__t.el.shadowRoot
      const scroll = root.querySelector('[data-k="scroll"]')
      return { widths: [...root.querySelectorAll('thead th')].map((th) => th.getBoundingClientRect().width), over: scroll.scrollWidth - scroll.clientWidth, caption: root.querySelector('caption').textContent }
    })
    for (const w of info.widths) expect(w).toBeGreaterThanOrEqual(55.5)
    expect(info.over).toBeLessThanOrEqual(1)
    expect(info.caption).toMatch(/columns? hidden$/)
    await page.evaluate(() => window.__t.width(900))
    await page.waitForFunction(() => window.__t.el.shadowRoot.querySelectorAll('thead th').length === 6)
    expect((await grid(page))[0]).toHaveLength(6)
  })

  test('a long money value does not run into the next column', async ({ page }) => {
    await open(page, 'size=XL&width=900&scale=100000')
    const overlap = await page.evaluate(() => {
      const cells = [...window.__t.el.shadowRoot.querySelectorAll('tbody tr:first-child td')].map((td) => td.getBoundingClientRect())
      return cells.some((r, i) => i > 0 && r.left < cells[i - 1].right - 1)
    })
    expect(overlap).toBe(false)
    // Money is never cut short: a figure's own width is kept.
    const clipped = await page.evaluate(() => [...window.__t.el.shadowRoot.querySelectorAll('tbody td.n')].filter((td) => td.scrollWidth > td.clientWidth + 1).length)
    expect(clipped).toBe(0)
  })
})

test.describe('the empty table', () => {
  test('shows the header and says there are no rows', async ({ page }) => {
    await open(page)
    await page.evaluate(() => { window.__t.el.data = { columns: [{ key: 'a', label: 'A' }], rows: [] } })
    await page.evaluate(() => window.__t.nextFrame())
    await expect(headers(page)).toHaveCount(1)
    await expect(rowsOf(page)).toHaveCount(0)
    expect(await page.evaluate(() => window.__t.el.shadowRoot.querySelector('[data-k="none"]').textContent)).toBe('No rows yet')
  })
})
