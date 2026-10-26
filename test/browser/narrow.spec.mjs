// Narrow tiles and the trading example's tables (RFC 0004 §11.1 and §11.3): a heading that cannot fit its label ends in
// an ellipsis and keeps the whole text in the DOM, its title and its accessible name; and the trading example's fills table
// is readable at 390 px, with a content column that takes only its text at 1280.
import { test, expect } from '@playwright/test'

const PAGE = '/examples/trading.html'

// Two Tall tiles side by side on the phone grid, in both profiles so the test does not depend on the hour.
const TALL_PAIR = {
  version: 1,
  device: 'phone',
  profiles: {
    market: [{ id: 'capitalFunding', size: 'Tall' }, { id: 'watchlist', size: 'Tall' }, { id: 'todayPnl', size: 'M' }],
    closed: [{ id: 'capitalFunding', size: 'Tall' }, { id: 'watchlist', size: 'Tall' }, { id: 'todayPnl', size: 'M' }],
  },
}

test.beforeEach(async ({ page }) => {
  // Network off: only the dev server answers.
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
})

async function open(page, width, scheme = 'light') {
  await page.emulateMedia({ colorScheme: scheme })
  await page.setViewportSize({ width, height: 900 })
  await page.goto(PAGE)
  await page.waitForFunction(() => document.querySelector('ts-table')?.shadowRoot?.querySelector('tbody tr'))
}

// What a heading shows and what it is called, read in the page: the visible text, whether CSS is cutting it, its name, its title.
const headingOf = (page, selector) =>
  page.evaluate((sel) => {
    const tile = document.querySelector(sel)
    const heading = tile.shadowRoot.querySelector('[part="label"]')
    const style = getComputedStyle(heading)
    const box = heading.getBoundingClientRect()
    const outer = tile.getBoundingClientRect()
    return {
      text: heading.textContent,
      name: heading.getAttribute('aria-label') ?? heading.textContent,
      title: heading.getAttribute('title'),
      tileName: tile.shadowRoot.querySelector('.tile').getAttribute('aria-label'),
      cut: heading.scrollWidth > heading.clientWidth + 0.5,
      textOverflow: style.textOverflow,
      overflow: style.overflowX,
      whiteSpace: style.whiteSpace,
      dir: style.direction,
      inside: box.left >= outer.left - 0.5 && box.right <= outer.right + 0.5,
      tileWidth: Math.round(outer.width),
    }
  }, selector)

test.describe('two Tall tiles side by side at 390 px', () => {
  for (const scheme of ['light', 'dark']) {
    test(`no heading is clipped, and the full label is the name (${scheme})`, async ({ page }) => {
      await open(page, 390, scheme)
      await page.evaluate((layout) => {
        document.getElementById('board').layout = layout
      }, TALL_PAIR)
      await page.waitForFunction(() => document.querySelector('[item="watchlist"]').getBoundingClientRect().width > 0)
      const funding = await headingOf(page, '[item="capitalFunding"]')
      const watch = await headingOf(page, '[item="watchlist"]')
      // Side by side: both are half the grid, well under 200 px.
      expect(funding.tileWidth).toBeLessThan(200)
      expect(watch.tileWidth).toBeLessThan(200)
      for (const [h, label] of [[funding, 'Funding'], [watch, 'Watchlist']]) {
        expect(h.text).toBe(label)
        expect(h.name).toBe(label)
        expect(h.title).toBe(label)
        expect(h.tileName).toContain(label)
        expect(h.inside).toBe(true)
        // On a touch screen the Watchlist's + button is 44 px, which can leave the label short of room: it then ends in an
        // ellipsis (never clips), and its text, title and name are still whole.
        if (h.cut) {
          expect(h.textOverflow).toBe('ellipsis')
          expect(h.overflow).toBe('hidden')
        }
      }
      await expect(page.getByRole('heading', { name: 'Funding', exact: true })).toHaveCount(1)
      await expect(page.getByRole('heading', { name: 'Watchlist', exact: true })).toHaveCount(1)
    })
  }

  test('a longer label ends in an ellipsis, keeps its whole text, and is still the name', async ({ page }) => {
    await open(page, 390)
    await page.evaluate((layout) => {
      const grid = document.getElementById('board')
      grid.layout = layout
      document.querySelector('[item="capitalFunding"]').setAttribute('label', 'Capital funding and margin')
      document.querySelector('[item="watchlist"]').setAttribute('label', 'Watchlist: banks and metals')
    }, TALL_PAIR)
    await page.waitForFunction(() => document.querySelector('[item="watchlist"]').shadowRoot.querySelector('[part="label"]').textContent === 'Watchlist: banks and metals')
    for (const [item, label] of [['capitalFunding', 'Capital funding and margin'], ['watchlist', 'Watchlist: banks and metals']]) {
      const h = await headingOf(page, `[item="${item}"]`)
      expect(h.cut, 'the label is wider than the room it gets').toBe(true)
      expect(h.textOverflow).toBe('ellipsis')
      expect(h.overflow).toBe('hidden')
      expect(h.whiteSpace).toBe('nowrap')
      expect(h.inside).toBe(true)
      expect(h.text).toBe(label)
      expect(h.name).toBe(label)
      expect(h.title).toBe(label)
      await expect(page.getByRole('heading', { name: label, exact: true })).toHaveCount(1)
    }
  })
})

// A tile of a chosen width, so the 11.25 rem rule is read at 150 and 179 px and left alone at 260.
async function tileAt(page, width, dir = 'ltr', label = 'Open positions and exits') {
  return page.evaluate(
    ({ width, dir, label }) => {
      document.getElementById('probe')?.remove()
      const host = document.createElement('div')
      host.id = 'probe'
      host.setAttribute('dir', dir)
      host.style.cssText = `position: fixed; inset-block-start: 0; inset-inline-start: 0; inline-size: ${width}px; block-size: 160px; z-index: 9`
      const card = document.createElement('ts-card')
      card.setAttribute('label', label)
      card.setAttribute('size', 'M')
      card.style.cssText = 'display: block; block-size: 100%'
      host.append(card)
      document.body.append(host)
      return null
    },
    { width, dir, label },
  )
}

test.describe('the heading at chosen tile widths', () => {
  for (const width of [150, 179]) {
    test(`at ${width} px the label ends in an ellipsis and never clips mid-glyph`, async ({ page }) => {
      await open(page, 390)
      await tileAt(page, width)
      await page.waitForFunction(() => document.querySelector('#probe ts-card')?.shadowRoot?.querySelector('[part="label"]')?.textContent)
      const h = await headingOf(page, '#probe ts-card')
      expect(h.tileWidth).toBe(width)
      expect(h.cut).toBe(true)
      expect(h.textOverflow).toBe('ellipsis')
      expect(h.overflow).toBe('hidden')
      expect(h.text).toBe('Open positions and exits')
      expect(h.name).toBe('Open positions and exits')
      expect(h.title).toBe('Open positions and exits')
      expect(h.inside).toBe(true)
    })
  }

  test('at 260 px a label that fits is whole', async ({ page }) => {
    await open(page, 390)
    await tileAt(page, 260, 'ltr', 'Open positions')
    await page.waitForFunction(() => document.querySelector('#probe ts-card')?.shadowRoot?.querySelector('[part="label"]')?.textContent)
    const h = await headingOf(page, '#probe ts-card')
    expect(h.cut).toBe(false)
    expect(h.text).toBe('Open positions')
  })

  test('in a right-to-left grid the heading is cut at its end and stays inside the tile', async ({ page }) => {
    await open(page, 390)
    await tileAt(page, 150, 'rtl')
    await page.waitForFunction(() => document.querySelector('#probe ts-card')?.shadowRoot?.querySelector('[part="label"]')?.textContent)
    const h = await headingOf(page, '#probe ts-card')
    expect(h.dir).toBe('rtl')
    expect(h.cut).toBe(true)
    expect(h.textOverflow).toBe('ellipsis')
    expect(h.inside).toBe(true)
    expect(h.text).toBe('Open positions and exits')
  })

  test('the title follows the label when it changes, and is written only then', async ({ page }) => {
    await open(page, 390)
    await tileAt(page, 150)
    await page.waitForFunction(() => document.querySelector('#probe ts-card')?.shadowRoot?.querySelector('[part="label"]')?.textContent)
    const writes = await page.evaluate(async () => {
      const card = document.querySelector('#probe ts-card')
      const heading = card.shadowRoot.querySelector('[part="label"]')
      let count = 0
      new MutationObserver((records) => {
        count += records.filter((r) => r.attributeName === 'title').length
      }).observe(heading, { attributes: true, attributeFilter: ['title'] })
      card.data = { live: true }
      card.data = { live: true, asOf: Date.now() }
      await new Promise((r) => setTimeout(r, 100))
      const same = count
      card.setAttribute('label', 'Another long label here')
      await new Promise((r) => setTimeout(r, 100))
      return { same, after: count, title: card.shadowRoot.querySelector('[part="label"]').getAttribute('title') }
    })
    expect(writes.same).toBe(0)
    expect(writes.after).toBe(1)
    expect(writes.title).toBe('Another long label here')
  })
})

// Every cell of the fills table, read against the tile that holds it.
const fillsOf = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('ts-table')
    const root = el.shadowRoot
    const scroll = root.querySelector('[data-k="scroll"]')
    const tile = root.querySelector('.tile').getBoundingClientRect()
    const cells = [...root.querySelectorAll('th, td')].map((cell) => {
      const box = cell.getBoundingClientRect()
      const value = cell.querySelector('.sort > span, td > span:last-child, th > span') || cell
      return {
        text: cell.textContent.trim(),
        // Cut by its own cell: a figure or a symbol the cell is too narrow for.
        cut: cell.scrollWidth > cell.clientWidth + 1,
        inside: box.left >= tile.left - 0.5 && box.right <= tile.right + 0.5,
        width: Math.round(box.width),
        tag: cell.localName,
        key: cell.getAttribute('data-key'),
        value: value.textContent,
      }
    })
    return {
      heads: [...root.querySelectorAll('thead th')].map((th) => th.getAttribute('data-key')),
      scrolls: scroll.scrollWidth > scroll.clientWidth + 1,
      clientWidth: scroll.clientWidth,
      tile: Math.round(tile.width),
      cells,
    }
  })

test.describe('the fills table in the trading example', () => {
  test('at 390 px every cell is whole and inside its tile, with the full instrument shown', async ({ page }) => {
    await open(page, 390)
    await page.locator('ts-table').scrollIntoViewIfNeeded()
    await page.waitForFunction(() => {
      const scroll = document.querySelector('ts-table').shadowRoot.querySelector('[data-k="scroll"]')
      return scroll.scrollWidth <= scroll.clientWidth + 1
    })
    const f = await fillsOf(page)
    expect(f.scrolls).toBe(false)
    expect(f.heads[0]).toBe('sym')
    expect(f.heads).toContain('pnl')
    expect(f.cells.length).toBeGreaterThan(f.heads.length)
    for (const cell of f.cells) {
      expect(cell.inside, `${cell.text} is inside the tile`).toBe(true)
      expect(cell.cut, `${cell.text} is not cut`).toBe(false)
    }
    // Instruments are the long text; none ends in an ellipsis.
    const symbols = f.cells.filter((c) => c.tag === 'td').slice(0, 1)
    expect(symbols[0].text).toMatch(/^[A-Z0-9 ]{8,}$/)
  })

  test('at 390 px the table is already fitted when it has not been scrolled to (a full-page screenshot reads it so)', async ({ page }) => {
    await open(page, 390)
    // Not scrolled to, not nearby: the first fit is still owed, and drawn.
    await page.waitForFunction(() => {
      const scroll = document.querySelector('ts-table').shadowRoot.querySelector('[data-k="scroll"]')
      return scroll.scrollWidth <= scroll.clientWidth + 1
    })
    const f = await fillsOf(page)
    expect(f.scrolls).toBe(false)
    expect(f.heads).toContain('pnl')
  })

  test('at 1280 px the instrument column takes only its text, and the other columns share the rest', async ({ page }) => {
    await open(page, 1280)
    await page.locator('ts-table').scrollIntoViewIfNeeded()
    await page.waitForFunction(() => document.querySelector('ts-table').shadowRoot.querySelectorAll('thead th').length === 6)
    const f = await fillsOf(page)
    const width = (key) => f.cells.find((c) => c.tag === 'th' && c.key === key).width
    expect(f.scrolls).toBe(false)
    expect(width('sym')).toBeLessThan(f.clientWidth / 4)
    // The full instrument is there, whole.
    expect(f.cells.filter((c) => c.tag === 'td' && c.cut)).toEqual([])
    // The figures share what is left: each takes more than the 56 px floor.
    for (const key of ['qty', 'price', 'pnl']) expect(width(key)).toBeGreaterThan(100)
  })

  test('a fixed width is a number of CSS pixels, written on the <col>, and a long symbol is whole at L', async ({ page }) => {
    await open(page, 1280)
    await page.locator('ts-table').scrollIntoViewIfNeeded()
    const info = await page.evaluate(async () => {
      const el = document.querySelector('ts-table')
      el.data = {
        columns: [
          { key: 'sym', label: 'Instrument', width: 'content' },
          { key: 'qty', label: 'Qty', format: 'number', width: 96 },
          { key: 'pnl', label: 'P&L', format: 'money', tone: 'sign' },
        ],
        rows: [{ id: 1, sym: 'ALPHA 24300 PE WEEKLY 03 NOV', qty: 75, pnl: 1250.5 }],
      }
      await new Promise((r) => setTimeout(r, 300))
      const root = el.shadowRoot
      const th = [...root.querySelectorAll('thead th')].map((h) => Math.round(h.getBoundingClientRect().width))
      const sym = root.querySelector('tbody td')
      return { cols: [...root.querySelectorAll('col')].map((c) => c.style.inlineSize), th, symCut: sym.scrollWidth > sym.clientWidth + 1, tableWidth: root.querySelector('table').getBoundingClientRect().width }
    })
    expect(info.cols).toEqual(['', '96px', ''])
    expect(info.th[1]).toBe(96)
    expect(info.symCut).toBe(false)
    expect(info.th[0]).toBeLessThan(info.tableWidth / 2 + 1)
  })
})
