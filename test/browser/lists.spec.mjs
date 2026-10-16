// <ts-watchlist> and <ts-open-positions> in real engines (RFC 0003 §21.3): table semantics with signs and arrows,
// the range bar's geometry and text alternative, live ticks that touch only what moved without losing focus or
// scroll, the opt-in actions, and no sideways overflow at phone widths, in light, dark and a monospace preset.
import { test, expect } from '@playwright/test'

const PAGE = '/test/browser/fixtures/lists.html'

test.beforeEach(async ({ page }) => {
  // Network off: only the dev server answers.
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
})

async function open(page, query = '') {
  await page.goto(`${PAGE}?${query}`)
  await page.waitForFunction(() => window.__ready === true)
  await page.evaluate(() => window.__l.nextFrame())
}

const tick = async (page, step) => {
  await page.evaluate((k) => window.__l.tick(k), step)
  await page.evaluate(() => window.__l.nextFrame())
}

const WATCH = 'kind=watchlist'
const POS = 'kind=positions'

test.describe('<ts-watchlist> is a table', () => {
  test('with header cells, a row header for each symbol, a caption and a named scroller', async ({ page }) => {
    await open(page, `${WATCH}&size=Tall&width=304`)
    const info = await page.evaluate(() => {
      const root = window.__l.el.shadowRoot
      return {
        cols: [...root.querySelectorAll('thead th[scope="col"]')].map((th) => th.textContent),
        rowHeads: root.querySelectorAll('tbody th[scope="row"]').length,
        rows: root.querySelectorAll('tbody').length,
        caption: root.querySelector('caption').textContent,
        scroller: { tabindex: root.querySelector('[data-k="scroll"]').getAttribute('tabindex'), label: root.querySelector('[data-k="scroll"]').getAttribute('aria-label') },
        headCells: [...root.querySelectorAll('thead th')].map((th) => th.getBoundingClientRect().height),
      }
    })
    expect(info.cols).toEqual(['Instrument', 'Last price and change'])
    expect(info.rows).toBe(14)
    expect(info.rowHeads).toBe(14)
    expect(info.caption).toBe('Watchlist, 14 instruments')
    expect(info.scroller).toEqual({ tabindex: '0', label: 'Watchlist, instruments' })
    // The header row is for a screen reader and takes no room.
    for (const h of info.headCells) expect(h).toBeLessThan(1)
  })

  test('shows a gain and a loss with a sign and an arrow that assistive technology skips', async ({ page }) => {
    await open(page, `${WATCH}&size=Tall&width=304`)
    const changes = await page.evaluate(() =>
      [...window.__l.el.shadowRoot.querySelectorAll('.chg')].map((c) => ({
        arrow: c.querySelector('.ar').textContent,
        hidden: c.querySelector('.ar').getAttribute('aria-hidden'),
        cls: c.getAttribute('class'),
        abs: c.querySelector('.abs').textContent,
        pct: c.querySelector('.pct').textContent,
      })),
    )
    expect(changes.some((c) => c.arrow === '▲') && changes.some((c) => c.arrow === '▼')).toBe(true)
    for (const c of changes) {
      expect(c.hidden).toBe('true')
      if (c.arrow === '▲') {
        expect(c.abs).toMatch(/^\+/)
        expect(c.cls).toContain('pos')
      } else {
        expect(c.arrow).toBe('▼')
        expect(c.abs).toMatch(/^−/)
        expect(c.cls).toContain('neg')
      }
    }
  })

  test('draws the range bar with a text alternative, and none for an instrument with no range', async ({ page }) => {
    await open(page, `${WATCH}&size=Tall&width=304`)
    const bars = await page.evaluate(() =>
      [...window.__l.el.shadowRoot.querySelectorAll('tbody')].map((tb) => {
        const bar = tb.querySelector('[part="bar"]')
        const r = bar.getBoundingClientRect()
        const dot = bar.querySelector('.pt').getBoundingClientRect()
        return { hidden: bar.hasAttribute('hidden'), role: bar.getAttribute('role'), label: bar.getAttribute('aria-label'), width: r.width, dotInside: dot.left >= r.left - 6.5 && dot.right <= r.right + 6.5 }
      }),
    )
    // The fifth instrument (SIGMA METALS) has no range.
    expect(bars.filter((b) => b.hidden)).toHaveLength(1)
    expect(bars[5].hidden).toBe(true)
    for (const b of bars.filter((x) => !x.hidden)) {
      expect(b.role).toBe('img')
      expect(b.label).toMatch(/^Day range [\d,.]+ to [\d,.]+, now [\d,.]+$/)
      expect(b.width).toBeGreaterThan(100)
      expect(b.dotInside).toBe(true)
    }
  })

  test('S shows the first instrument; M adds a sparkline with a text alternative', async ({ page }) => {
    await open(page, `${WATCH}&size=S&width=304`)
    expect(await page.locator('ts-watchlist tbody').count()).toBe(1)
    expect(await page.evaluate(() => window.__l.el.shadowRoot.querySelector('caption').textContent)).toBe('Watchlist, 14 instruments, showing the first')
    await open(page, `${WATCH}&size=M&width=624`)
    const sparks = await page.evaluate(() => [...window.__l.el.shadowRoot.querySelectorAll('svg[part="chart"]')].map((s) => ({ role: s.getAttribute('role'), label: s.getAttribute('aria-label'), d: s.firstChild.getAttribute('d'), w: s.getBoundingClientRect().width })))
    expect(sparks).toHaveLength(14)
    for (const s of sparks) {
      expect(s.role).toBe('img')
      expect(s.label).toMatch(/ trend, from [\d,.]+ to [\d,.]+$/)
      expect(s.d.startsWith('M')).toBe(true)
      expect(s.w).toBeGreaterThan(40)
    }
  })

  test('applies each instrument\'s own decimals', async ({ page }) => {
    await open(page, `${WATCH}&size=Tall&width=304`)
    const lasts = await page.evaluate(() => [...window.__l.el.shadowRoot.querySelectorAll('.last')].map((l) => l.textContent))
    // The 4th (DELTA AUTO) has none, the 15th (XI USDINR) has four: the sheet is 14 long, so only the first kind shows.
    expect(lasts[3]).toMatch(/^[\d,]+$/)
    expect(lasts[0]).toMatch(/\.\d{2}$/)
  })
})

test.describe('live ticks', () => {
  test('change only the cells that moved, and rebuild no row', async ({ page }) => {
    await open(page, `${WATCH}&size=Tall&width=304`)
    await page.evaluate(() => {
      const root = window.__l.el.shadowRoot
      root.querySelectorAll('tbody').forEach((tb, i) => { tb.__mark = i; tb.querySelectorAll('td, th').forEach((c, j) => { c.__mark = `${i}.${j}` }) })
      window.__before = [...root.querySelectorAll('tbody')].map((tb) => tb.textContent)
      window.__muts = []
      window.__obs = new MutationObserver((list) => window.__muts.push(...list.map((m) => m.target.getRootNode() === root ? (m.target.closest ? m.target.closest('tbody') : m.target.parentElement.closest('tbody')) : null)))
      window.__obs.observe(root, { subtree: true, characterData: true, childList: true, attributes: true })
    })
    await tick(page, 3)
    const result = await page.evaluate(() => {
      const root = window.__l.el.shadowRoot
      window.__obs.takeRecords()
      const bodies = [...root.querySelectorAll('tbody')]
      return {
        kept: bodies.every((tb, i) => tb.__mark === i && [...tb.querySelectorAll('td, th')].every((c, j) => c.__mark === `${i}.${j}`)),
        changed: bodies.map((tb, i) => (tb.textContent === window.__before[i] ? -1 : i)).filter((i) => i >= 0),
        total: bodies.length,
      }
    })
    expect(result.kept).toBe(true)
    // Only one in three instruments ticks at a step, so most rows are untouched.
    expect(result.changed.length).toBeGreaterThan(0)
    expect(result.changed.length).toBeLessThan(result.total)
    expect(result.changed.every((i) => (i + 3) % 3 === 0)).toBe(true)
  })

  test('keep the scroll position and the focus while the prices tick', async ({ page }) => {
    await open(page, `${WATCH}&size=Tall&width=304&n=40&actions`)
    const scroller = page.locator('ts-watchlist [data-k="scroll"]')
    await scroller.evaluate((el) => { el.scrollTop = 260 })
    await page.locator('ts-watchlist .add').focus()
    for (let k = 1; k <= 6; k++) await tick(page, k)
    expect(await scroller.evaluate((el) => el.scrollTop)).toBe(260)
    await expect(page.locator('ts-watchlist .add')).toBeFocused()
    await scroller.focus()
    for (let k = 7; k <= 9; k++) await tick(page, k)
    await expect(scroller).toBeFocused()
  })

  test('a position\'s price moves its dot along the bar and rewrites only its own marks', async ({ page }) => {
    await open(page, `${POS}&size=M&width=624`)
    const before = await page.evaluate(() => {
      const bar = window.__l.el.shadowRoot.querySelectorAll('tbody')[0].querySelector('[part="bar"]')
      window.__bar = bar
      return { n: bar.style.getPropertyValue('--n'), e: bar.style.getPropertyValue('--e'), x: bar.querySelector('.pt').getBoundingClientRect().left }
    })
    await page.evaluate(() => { window.__l.el.data = { ...window.__l.el.data, positions: window.__l.el.data.positions.map((p, i) => (i === 0 ? { ...p, ltp: p.stop + (p.target - p.stop) * 0.9 } : p)) } })
    await page.evaluate(() => window.__l.nextFrame())
    const after = await page.evaluate(() => {
      const bar = window.__l.el.shadowRoot.querySelectorAll('tbody')[0].querySelector('[part="bar"]')
      return { same: bar === window.__bar, n: bar.style.getPropertyValue('--n'), e: bar.style.getPropertyValue('--e'), x: bar.querySelector('.pt').getBoundingClientRect().left }
    })
    expect(after.same).toBe(true)
    expect(after.n).toBe('90')
    expect(after.e).toBe(before.e)
    expect(after.x).toBeGreaterThan(before.x)
  })
})

test.describe('<ts-open-positions>', () => {
  test('is a table with the figures signed and the side in words', async ({ page }) => {
    await open(page, `${POS}&size=M&width=624`)
    const info = await page.evaluate(() => {
      const root = window.__l.el.shadowRoot
      return {
        cols: [...root.querySelectorAll('thead th[scope="col"]:not([hidden])')].map((th) => th.textContent),
        caption: root.querySelector('caption').textContent,
        sides: [...root.querySelectorAll('.side')].map((s) => s.textContent),
        pnls: [...root.querySelectorAll('td.pnl')].map((td) => ({ arrow: td.querySelector('.ar').textContent, hidden: td.querySelector('.ar').getAttribute('aria-hidden'), text: td.lastChild.textContent, cls: td.getAttribute('class') })),
        mtm: root.querySelector('[data-k="mtmBox"]').textContent,
      }
    })
    expect(info.cols).toEqual(['Instrument', 'Last price', 'P&L'])
    expect(info.caption).toBe('Open positions, 9 positions')
    expect(new Set(info.sides)).toEqual(new Set(['Long', 'Short']))
    for (const p of info.pnls) {
      expect(p.hidden).toBe('true')
      if (p.arrow === '▲') {
        expect(p.text).toMatch(/^\+₹/)
        expect(p.cls).toContain('pos')
      } else {
        expect(p.arrow).toBe('▼')
        expect(p.text).toMatch(/^−₹/)
        expect(p.cls).toContain('neg')
      }
    }
    expect(info.mtm).toMatch(/^[▲▼][+−]₹/)
  })

  test('draws the bar from the stop to the target, the loss side first, with the entry tick and the dot', async ({ page }) => {
    await open(page, `${POS}&size=M&width=624`)
    const bars = await page.evaluate(() =>
      [...window.__l.el.shadowRoot.querySelectorAll('tbody')].map((tb) => {
        const bar = tb.querySelector('[part="bar"]')
        const box = bar.getBoundingClientRect()
        const at = (sel) => { const r = bar.querySelector(sel).getBoundingClientRect(); return { left: r.left - box.left, right: r.right - box.left, w: r.width } }
        return { hidden: bar.hasAttribute('hidden'), label: bar.getAttribute('aria-label'), role: bar.getAttribute('role'), width: box.width, loss: at('.zl'), profit: at('.zp'), tick: at('.tk'), dot: at('.pt') }
      }),
    )
    // The fifth position has no stop and the seventh no target: no bar, and nothing invented.
    expect(bars.filter((b) => b.hidden).length).toBe(2)
    expect(bars[4].hidden).toBe(true)
    expect(bars[6].hidden).toBe(true)
    for (const b of bars.filter((x) => !x.hidden)) {
      expect(b.role).toBe('img')
      expect(b.label).toMatch(/^Between stop [\d,.]+ and target [\d,.]+, entry [\d,.]+, now [\d,.]+$/)
      // The loss zone starts the bar, the profit zone ends it, and they meet at the entry tick.
      expect(b.loss.left).toBeLessThan(1)
      expect(b.profit.right).toBeGreaterThan(b.width - 1)
      expect(Math.abs(b.loss.right - b.profit.left)).toBeLessThan(1)
      expect(Math.abs(b.tick.left + b.tick.w / 2 - b.loss.right)).toBeLessThan(1.5)
      // The dot is a circle somewhere along the bar.
      expect(b.dot.w).toBeGreaterThan(8)
      expect(b.dot.left + b.dot.w / 2).toBeGreaterThanOrEqual(-0.5)
      expect(b.dot.left + b.dot.w / 2).toBeLessThanOrEqual(b.width + 0.5)
    }
  })

  test('is the same bar for a short: its stop is a higher price, and it is still on the left', async ({ page }) => {
    await open(page, `${POS}&size=M&width=624`)
    const info = await page.evaluate(() => {
      const [long, short] = [...window.__l.el.shadowRoot.querySelectorAll('tbody')].slice(0, 2).map((tb) => tb.querySelector('[part="bar"]').getAttribute('aria-label'))
      const num = (s, word) => Number(new RegExp(`${word} ([\\d,.]+)`).exec(s)[1].replace(/,/g, ''))
      return { long: [num(long, 'stop'), num(long, 'target')], short: [num(short, 'stop'), num(short, 'target')], sides: [...window.__l.el.shadowRoot.querySelectorAll('.side')].slice(0, 2).map((s) => s.textContent) }
    })
    expect(info.sides).toEqual(['Long', 'Short'])
    expect(info.long[0]).toBeLessThan(info.long[1])
    expect(info.short[0]).toBeGreaterThan(info.short[1])
  })

  test('Wide has no bar and L adds the price path and the margin', async ({ page }) => {
    await open(page, `${POS}&size=Wide&width=624`)
    expect(await page.locator('ts-open-positions [part="bar"]').count()).toBe(0)
    await open(page, `${POS}&size=L&width=936`)
    const info = await page.evaluate(() => {
      const root = window.__l.el.shadowRoot
      return {
        sparks: [...root.querySelectorAll('svg[part="chart"]')].map((s) => ({ label: s.getAttribute('aria-label'), d: s.firstChild.getAttribute('d') })),
        sum: root.querySelector('[data-k="sum"]').textContent,
      }
    })
    expect(info.sparks).toHaveLength(9)
    for (const s of info.sparks) {
      expect(s.label).toMatch(/, price since entry, from [\d,.]+ to [\d,.]+$/)
      expect(s.d.startsWith('M')).toBe(true)
    }
    expect(info.sum).toContain('Margin')
    expect(info.sum).toContain('₹1,84,500.50')
  })
})

test.describe('actions are off until listed, and ask rather than act', () => {
  test('the watchlist has no add button by default', async ({ page }) => {
    await open(page, `${WATCH}&size=Tall&width=304`)
    expect(await page.locator('ts-watchlist .add').isVisible()).toBe(false)
    expect(await page.evaluate(() => window.__l.events)).toEqual([])
  })

  test('add-instrument fires from the button, by pointer or keyboard, and changes nothing else', async ({ page }) => {
    await open(page, `${WATCH}&size=Tall&width=304&actions&fit`)
    const add = page.locator('ts-watchlist .add')
    await expect(add).toBeVisible()
    await expect(add).toHaveAttribute('aria-label', 'Add instrument')
    const rows = await page.locator('ts-watchlist tbody').count()
    await add.click()
    await add.focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Space')
    expect(await page.evaluate(() => window.__l.events)).toEqual([{ action: 'add-instrument' }, { action: 'add-instrument' }, { action: 'add-instrument' }])
    expect(await page.locator('ts-watchlist tbody').count()).toBe(rows)
  })

  test('the add button is at least 44px on a touch screen, and stays inside the header', async ({ page, hasTouch }) => {
    await open(page, `${WATCH}&size=Tall&width=170&actions&fit`)
    const box = await page.locator('ts-watchlist .add').boundingBox()
    if (hasTouch) {
      expect(box.width).toBeGreaterThanOrEqual(43.5)
      expect(box.height).toBeGreaterThanOrEqual(43.5)
    }
    const tile = await page.locator('ts-watchlist').boundingBox()
    expect(box.x + box.width).toBeLessThanOrEqual(tile.x + tile.width)
  })

  test('positions have no buttons by default', async ({ page }) => {
    await open(page, `${POS}&size=M&width=624`)
    expect(await page.evaluate(() => window.__l.el.shadowRoot.querySelectorAll('tbody button, .exitall:not([hidden])').length)).toBe(0)
  })

  test('exit-position fires with the position\'s id, from the pointer and the keyboard', async ({ page }) => {
    await open(page, `${POS}&size=M&width=624&actions&fit`)
    const buttons = page.locator('ts-open-positions .exit')
    await expect(buttons).toHaveCount(9)
    await expect(buttons.nth(1)).toHaveAttribute('aria-label', /^Exit IOTA 24400 PE, Short 75$/)
    await buttons.nth(1).click()
    await buttons.nth(2).focus()
    await page.keyboard.press('Enter')
    expect(await page.evaluate(() => window.__l.events)).toEqual([{ action: 'exit-position', id: 'p1' }, { action: 'exit-position', id: 'p2' }])
    // Asking does not close anything: the rows are the host's to change.
    await expect(buttons).toHaveCount(9)
  })

  test('exit-all fires with no detail', async ({ page }) => {
    await open(page, `${POS}&size=M&width=624&actions&fit`)
    const all = page.locator('ts-open-positions .exitall')
    await expect(all).toBeVisible()
    await expect(all).toHaveText('Exit all')
    await all.click()
    expect(await page.evaluate(() => window.__l.events)).toEqual([{ action: 'exit-all' }])
  })

  test('closing the position whose Exit button has focus moves focus to the neighbour\'s button, never to the page', async ({ page }) => {
    await open(page, `${POS}&size=M&width=624&actions&fit`)
    await page.locator('ts-open-positions .exit').nth(2).focus()
    await page.evaluate(() => { window.__l.el.data = { ...window.__l.el.data, positions: window.__l.el.data.positions.filter((p) => p.id !== 'p2') } })
    await page.evaluate(() => window.__l.nextFrame())
    const where = await page.evaluate(() => {
      const root = window.__l.el.shadowRoot
      const a = root.activeElement
      return { isExit: !!a && a.classList.contains('exit'), label: a && a.getAttribute('aria-label'), body: document.activeElement === document.body }
    })
    expect(where.isExit).toBe(true)
    expect(where.label).toMatch(/^Exit /)
    // With every position gone, focus lands on Exit all or the list, not the page.
    await page.evaluate(() => { window.__l.el.shadowRoot.querySelector('.exit').focus(); window.__l.el.data = { ...window.__l.el.data, positions: [] } })
    await page.evaluate(() => window.__l.nextFrame())
    const end = await page.evaluate(() => { const a = window.__l.el.shadowRoot.activeElement; return a ? a.getAttribute('data-k') : null })
    expect(end).toBe('scroll')
  })

  test('a pending position\'s button is aria-disabled and asks for nothing; Exit all names its count', async ({ page }) => {
    await open(page, `${POS}&size=M&width=624&actions&fit`)
    await page.evaluate(() => { const d = window.__l.el.data; window.__l.el.data = { ...d, positions: d.positions.map((p, i) => (i === 0 ? { ...p, pending: true } : p)) } })
    await page.evaluate(() => window.__l.nextFrame())
    const first = page.locator('ts-open-positions .exit').first()
    await expect(first).toHaveAttribute('aria-disabled', 'true')
    await first.click({ force: true })
    expect(await page.evaluate(() => window.__l.events)).toEqual([])
    await expect(page.locator('ts-open-positions .exitall')).toHaveAttribute('aria-label', 'Exit all 9 positions')
  })

  test('stale live data reads as stale in the header and the tile\'s name', async ({ page }) => {
    for (const q of [WATCH, POS]) {
      await open(page, `${q}&size=M&width=624`)
      await page.evaluate(() => { const d = window.__l.el.data; window.__l.el.data = { ...d, asOf: d.asOf - 10 * 60000, live: true } })
      await page.evaluate(() => window.__l.nextFrame())
      const info = await page.evaluate(() => { const r = window.__l.el.shadowRoot; return { dot: r.querySelector('[data-k="dot"]').getAttribute('class'), meta: r.querySelector('[data-k="meta"]').textContent, name: r.querySelector('.tile').getAttribute('aria-label') } })
      expect(info.dot).toContain('stale')
      expect(info.meta).toContain('Stale')
      expect(info.name).toMatch(/, stale$/)
    }
  })

  test('the exit buttons keep focus through a tick', async ({ page }) => {
    await open(page, `${POS}&size=M&width=624&actions&fit`)
    const button = page.locator('ts-open-positions .exit').nth(3)
    await button.focus()
    for (let k = 1; k <= 5; k++) await tick(page, k)
    await expect(button).toBeFocused()
  })
})

test.describe('fits its tile', () => {
  // [kind, size, width]: the S tile at a phone is about 170px, Wide and M about 351px, and a desktop tile twice that.
  const CASES = [
    [WATCH, 'S', 170], [WATCH, 'S', 304], [WATCH, 'Tall', 170], [WATCH, 'Tall', 304], [WATCH, 'M', 351], [WATCH, 'M', 624],
    [POS, 'Wide', 351], [POS, 'Wide', 624], [POS, 'M', 351], [POS, 'M', 624], [POS, 'L', 468], [POS, 'L', 936],
  ]
  for (const [kind, size, width] of CASES) {
    for (const theme of ['light', 'dark']) {
      test(`${kind.slice(5)} ${size} at ${width}px in ${theme}: no sideways scroll, nothing outside the tile, every price whole`, async ({ page }) => {
        await open(page, `${kind}&size=${size}&width=${width}&theme=${theme}&actions&fit`)
        const info = await page.evaluate(() => {
          const el = window.__l.el
          const root = el.shadowRoot
          const scroll = root.querySelector('.scroll')
          const tile = root.querySelector('.tile').getBoundingClientRect()
          const outside = [...root.querySelectorAll('.tile *')].filter((n) => {
            if (n.closest('.scroll') || n.closest('[hidden]') || n.closest('.visually-hidden')) return false
            const r = n.getBoundingClientRect()
            return r.width > 0 && r.right > tile.right + 0.5
          }).length
          // A figure is never cut: no price or profit cell clips its own text.
          const cut = [...root.querySelectorAll('.last, .pnl, .fig, .chg')].filter((n) => n.scrollWidth > n.clientWidth + 1).length
          return { overflow: scroll.scrollWidth - scroll.clientWidth, outside, cut, tile: [tile.width, tile.height] }
        })
        expect(info.overflow, 'the list scrolls sideways').toBeLessThanOrEqual(1)
        expect(info.outside, 'something sticks out of the tile').toBe(0)
        expect(info.cut, 'a figure is clipped').toBe(0)
      })
    }
  }

  // A runner with wider fallback fonts than ours must not push anything out of the tile: the same check, with wide type.
  for (const [kind, size, width] of [[WATCH, 'S', 170], [WATCH, 'Tall', 170], [WATCH, 'M', 351], [POS, 'Wide', 351], [POS, 'M', 351], [POS, 'L', 468], [POS, 'L', 936]]) {
    for (const theme of ['light', 'dark']) {
      test(`${kind.slice(5)} ${size} at ${width}px in ${theme} with wide fonts: still inside the tile`, async ({ page }) => {
        await open(page, `${kind}&size=${size}&width=${width}&theme=${theme}&actions&fit&wide`)
        const info = await page.evaluate(() => {
          const root = window.__l.el.shadowRoot
          const tile = root.querySelector('.tile').getBoundingClientRect()
          const scroll = root.querySelector('.scroll')
          const out = [...root.querySelectorAll('.tile *')].filter((n) => !n.closest('.scroll') && !n.closest('[hidden]') && !n.closest('.visually-hidden') && n.getBoundingClientRect().width > 0 && n.getBoundingClientRect().right > tile.right + 0.5)
          return { overflow: scroll.scrollWidth - scroll.clientWidth, out: out.map((n) => `${n.className || n.localName} +${Math.round(n.getBoundingClientRect().right - tile.right)}`) }
        })
        expect(info.out, 'sticks out of the tile').toEqual([])
        expect(info.overflow, 'the list scrolls sideways').toBeLessThanOrEqual(1)
      })
    }
  }

  test('under the terminal preset (a monospace face) the figures still fit', async ({ page }) => {
    for (const [kind, size, width] of [[WATCH, 'Tall', 170], [WATCH, 'M', 351], [POS, 'M', 351], [POS, 'L', 468]]) {
      await open(page, `${kind}&size=${size}&width=${width}&preset=terminal&actions&fit`)
      const info = await page.evaluate(() => {
        const root = window.__l.el.shadowRoot
        const scroll = root.querySelector('.scroll')
        return { overflow: scroll.scrollWidth - scroll.clientWidth, cut: [...root.querySelectorAll('.last, .pnl, .fig, .chg')].filter((n) => n.scrollWidth > n.clientWidth + 1).length }
      })
      expect(info.overflow, `${kind} ${size} ${width}`).toBeLessThanOrEqual(1)
      expect(info.cut, `${kind} ${size} ${width}`).toBe(0)
    }
  })
})

test.describe('the bar under forced colours', () => {
  test('keeps an outline, so its track is not lost', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' })
    await open(page, `${POS}&size=M&width=624`)
    const border = await page.evaluate(() => getComputedStyle(window.__l.el.shadowRoot.querySelector('[part="bar"]')).borderTopWidth)
    expect(border).toBe('1px')
  })
})
