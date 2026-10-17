// <ts-edge-stats> and <ts-capital-funding> in real engines (RFC 0003 §21.2): the stat S shows, four stats and the histogram,
// signs and arrows, ∞ and dashes, shortfalls that read without colour, the opt-in Rebalance, live updates that keep the
// elements they had, and no overflow at phone widths, in light, dark, a monospace preset and with wide fonts.
import { test, expect } from '@playwright/test'

const PAGE = '/test/browser/fixtures/edge-funding.html'

test.beforeEach(async ({ page }) => {
  // Network off: only the dev server answers.
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
})

async function open(page, query = '') {
  await page.goto(`${PAGE}?${query}`)
  await page.waitForFunction(() => window.__ready === true)
  await page.evaluate(() => window.__e.nextFrame())
}

const EDGE = 'kind=edge'
const FUND = 'kind=funding'
const text = (page, selector) => page.evaluate((s) => window.__e.el.shadowRoot.querySelector(s)?.textContent ?? null, selector)

test.describe('<ts-edge-stats>', () => {
  test('S shows the stat the stat attribute names, win rate by default', async ({ page }) => {
    await open(page, `${EDGE}&size=S&width=304`)
    expect(await text(page, '[data-k="l0"]')).toBe('Win rate')
    expect(await text(page, '[data-k="v0V"]')).toBe('50%')
    for (const [stat, label] of [['profit-factor', 'Profit factor'], ['avg-win-loss', 'Avg win / loss'], ['expectancy', 'Expectancy']]) {
      await open(page, `${EDGE}&size=S&width=304&stat=${stat}`)
      expect(await text(page, '[data-k="l0"]'), stat).toBe(label)
    }
  })

  test('the stat property switches what S shows, and an unknown value reads as win rate', async ({ page }) => {
    await open(page, `${EDGE}&size=S&width=304`)
    await page.evaluate(() => { window.__e.el.stat = 'expectancy' })
    await page.evaluate(() => window.__e.nextFrame())
    expect(await text(page, '[data-k="l0"]')).toBe('Expectancy')
    await page.evaluate(() => { window.__e.el.setAttribute('stat', 'nonsense') })
    await page.evaluate(() => window.__e.nextFrame())
    expect(await text(page, '[data-k="l0"]')).toBe('Win rate')
  })

  test('Wide shows four stats, M adds the histogram with a name that states the result', async ({ page }) => {
    await open(page, `${EDGE}&size=Wide&width=624`)
    const wide = await page.evaluate(() => {
      const root = window.__e.el.shadowRoot
      return { labels: [...root.querySelectorAll('.cell > .lb')].map((n) => n.textContent), bars: root.querySelectorAll('[data-k="bars"]').length }
    })
    expect(wide.labels).toEqual(['Win rate', 'Profit factor', 'Avg win / loss', 'Expectancy'])
    expect(wide.bars).toBe(0)
    await open(page, `${EDGE}&size=M&width=624`)
    const m = await page.evaluate(() => {
      const bars = window.__e.el.shadowRoot.querySelector('[data-k="bars"]')
      return { role: bars.getAttribute('role'), label: bars.getAttribute('aria-label'), n: bars.children.length, loss: bars.querySelectorAll('.hb.loss').length }
    })
    expect(m.role).toBe('img')
    expect(m.label).toMatch(/^Result distribution: \d+ trades above zero, \d+ trades below zero, most in /)
    expect(m.n).toBe(7)
    expect(m.loss).toBe(3)
  })

  test('a loss bucket is hatched as well as red, and a profit bucket is solid', async ({ page }) => {
    await open(page, `${EDGE}&size=M&width=624`)
    const fills = await page.evaluate(() => {
      const root = window.__e.el.shadowRoot
      const style = (sel) => getComputedStyle(root.querySelector(sel))
      return { loss: style('.hb.loss .hbar').backgroundImage, profit: style('.hb:not(.loss):not(.zero) .hbar').backgroundImage }
    })
    expect(fills.loss).toContain('repeating-linear-gradient')
    expect(fills.profit).toBe('none')
  })

  test('money carries a sign and an arrow that assistive technology skips; the minus is the true one', async ({ page }) => {
    await open(page, `${EDGE}&size=Wide&width=624&stat=expectancy`)
    const info = await page.evaluate(() => {
      const root = window.__e.el.shadowRoot
      const row = (k) => ({ ar: root.querySelector(`[data-k="${k}Ar"]`).textContent, hidden: root.querySelector(`[data-k="${k}Ar"]`).getAttribute('aria-hidden'), figure: root.querySelector(`[data-k="${k}V"]`).textContent, cls: root.querySelector(`[data-k="${k}"]`).getAttribute('class') })
      return { win: row('v2'), loss: row('s2') }
    })
    expect(info.win).toMatchObject({ ar: '▲', hidden: 'true' })
    expect(info.win.figure).toMatch(/^\+₹/)
    expect(info.win.cls).toContain('pos')
    expect(info.loss).toMatchObject({ ar: '▼', hidden: 'true' })
    expect(info.loss.figure).toMatch(/^−₹/)
    expect(info.loss.cls).toContain('neg')
  })

  test('lakh-sized money is grouped for en-IN in the tile\'s name', async ({ page }) => {
    await open(page, `${EDGE}&size=Wide&width=624&big`)
    const label = await page.evaluate(() => window.__e.el.shadowRoot.querySelector('.tile').getAttribute('aria-label'))
    expect(label).toMatch(/\+₹\d{1,2},\d{2},\d{3}\.\d{2}/)
  })

  test('all wins show ∞ with the words "no losses" as its text, and no trades show the empty state', async ({ page }) => {
    await open(page, `${EDGE}&size=S&width=304&stat=profit-factor&inf`)
    expect(await text(page, '[data-k="v0V"]')).toBe('∞')
    expect(await page.evaluate(() => window.__e.el.shadowRoot.querySelector('[data-k="v0V"]').getAttribute('aria-label'))).toBe('no losses')
    for (const size of ['S', 'Wide', 'M']) {
      await open(page, `${EDGE}&size=${size}&width=351&empty`)
      const info = await page.evaluate(() => {
        const root = window.__e.el.shadowRoot
        const visible = (sel) => {
          const n = root.querySelector(sel)
          return !!n && getComputedStyle(n).display !== 'none'
        }
        return { none: root.querySelector('[data-k="none"]').textContent, noneShown: visible('[data-k="none"]'), stats: visible('[data-k="stats"]'), body: visible('[data-k="body"]') }
      })
      expect(info.none, size).toBe('No trades yet')
      expect(info.noneShown, size).toBe(true)
      expect(info.stats || info.body, size).toBe(false)
    }
  })

  test('has no actions of its own', async ({ page }) => {
    await open(page, `${EDGE}&size=Wide&width=624`)
    expect(await page.locator('ts-edge-stats').evaluate((el) => el.shadowRoot.querySelectorAll('button').length)).toBe(0)
  })
})

test.describe('<ts-capital-funding>', () => {
  test('marks a shortfall with stripes and the words "short <amount>"', async ({ page }) => {
    await open(page, `${FUND}&size=Tall&width=304`)
    const info = await page.evaluate(() => {
      const root = window.__e.el.shadowRoot
      const first = root.querySelector('.ac')
      return {
        words: [...first.querySelectorAll('.st')].map((n) => n.textContent).filter(Boolean),
        bar: getComputedStyle(first.querySelector('.fb')).backgroundImage,
        full: getComputedStyle(root.querySelectorAll('.ac')[1].querySelector('.fb')).backgroundImage,
      }
    })
    expect(info.words).toContain('short ₹31,359.60')
    expect(info.words).toContain('short ₹6,359.60')
    expect(info.bar).toContain('repeating-linear-gradient')
    expect(info.full).toBe('none')
  })

  test('each bar is an image with a name that states its result', async ({ page }) => {
    await open(page, `${FUND}&size=Tall&width=304`)
    const labels = await page.evaluate(() => [...window.__e.el.shadowRoot.querySelectorAll('[role="img"]')].map((n) => n.getAttribute('aria-label')))
    expect(labels[0]).toBe('Broker A: ₹18,640.40 of ₹50,000.00 funded, short ₹31,359.60')
    expect(labels).toContain('Broker B: ₹3,50,000.00 of ₹3,50,000.00 funded')
  })

  test('money is grouped in lakhs, and the first allocations draw the balance in order', async ({ page }) => {
    await open(page, `${FUND}&size=L&width=624`)
    const info = await page.evaluate(() => {
      const root = window.__e.el.shadowRoot
      const [a, b] = root.querySelectorAll('.ac')
      return { balanceB: b.querySelector('.am .n').textContent, shorts: [...a.querySelectorAll('.al .st')].map((n) => n.textContent) }
    })
    expect(info.balanceB).toContain('₹4,52,800.50')
    expect(info.shorts).toEqual(['short ₹6,359.60', 'short ₹25,000.00'])
  })

  test('a given funded amount consumes the balance for the allocations after it', async ({ page }) => {
    await open(page, `${FUND}&size=L&width=624`)
    // Broker C: 125,000 balance; Pairs is funded 40,000 by the host, so Calendar spread takes 60,000 and the last takes the remaining 25,000 of 30,000.
    const shorts = await page.evaluate(() => [...window.__e.el.shadowRoot.querySelectorAll('.ac')[2].querySelectorAll('.al')].map((n) => n.querySelector('.alsub .st')?.textContent || ''))
    expect(shorts).toEqual(['short ₹40,000.00', '', 'short ₹5,000.00'])
  })

  test('L adds each allocation\'s detail and signed P&L; Tall leaves them out', async ({ page }) => {
    await open(page, `${FUND}&size=L&width=624`)
    const l = await page.evaluate(() => {
      const root = window.__e.el.shadowRoot
      const row = root.querySelector('.al')
      const pn = row.querySelector('.pn')
      return { detail: row.querySelector('.ad').textContent, pn: pn.textContent, arrow: pn.firstChild.getAttribute('aria-hidden'), hidden: pn.hasAttribute('hidden') }
    })
    expect(l.detail).toBe('NIFTY 50 · 5m')
    expect(l.pn).toBe('▲+₹1,240.50')
    expect(l.arrow).toBe('true')
    expect(l.hidden).toBe(false)
    await open(page, `${FUND}&size=Tall&width=304`)
    const tall = await page.evaluate(() => {
      const row = window.__e.el.shadowRoot.querySelector('.al')
      return { detail: row.querySelector('.ad').textContent, pn: row.querySelector('.pn').hasAttribute('hidden') }
    })
    expect(tall).toEqual({ detail: '', pn: true })
  })

  test('a live allocation has a dot and says "live" to assistive technology', async ({ page }) => {
    await open(page, `${FUND}&size=Tall&width=304`)
    const info = await page.evaluate(() => {
      const row = window.__e.el.shadowRoot.querySelector('.al')
      return { dot: row.querySelector('.dot').getAttribute('aria-hidden'), word: row.querySelector('.visually-hidden').textContent }
    })
    expect(info).toEqual({ dot: 'true', word: 'live' })
  })

  test('S shows the first account: its share, a striped bar and what is short', async ({ page }) => {
    await open(page, `${FUND}&size=S&width=304`)
    expect(await text(page, '[data-k="name"]')).toBe('Broker A')
    expect(await text(page, '[data-k="shareV"]')).toBe('37%')
    expect(await text(page, '[data-k="status"]')).toBe('short ₹31,359.60')
    const bar = await page.evaluate(() => getComputedStyle(window.__e.el.shadowRoot.querySelector('[data-k="bar"]')).backgroundImage)
    expect(bar).toContain('repeating-linear-gradient')
  })

  test('a live update keeps the elements it had, moves the one figure and does not steal focus', async ({ page }) => {
    await open(page, `${FUND}&size=Tall&width=304&actions`)
    await page.evaluate(() => {
      const root = window.__e.el.shadowRoot
      window.__keep = root.querySelector('.ac')
      window.__scroll = root.querySelector('[data-k="scroll"]')
      // preventScroll: focusing would otherwise scroll its button into view, and the position under test is the one set here.
      root.querySelector('.reb').focus({ preventScroll: true })
      window.__scroll.scrollTop = 40
    })
    await page.evaluate(() => window.__e.tick(3))
    await page.evaluate(() => window.__e.nextFrame())
    const info = await page.evaluate(() => {
      const root = window.__e.el.shadowRoot
      return { same: root.querySelector('.ac') === window.__keep, balance: window.__keep.querySelector('.am .n').textContent, scroll: window.__scroll.scrollTop, focused: root.activeElement?.className ?? '' }
    })
    expect(info.same).toBe(true)
    expect(info.balance).toContain('₹19,016.90')
    expect(info.scroll).toBe(40)
    expect(info.focused).toContain('reb')
  })
})

test.describe('Rebalance is off until listed, and asks rather than acts', () => {
  test('there is no button by default, at any size', async ({ page }) => {
    for (const size of ['S', 'Tall', 'L']) {
      await open(page, `${FUND}&size=${size}&width=304`)
      const visible = await page.evaluate(() => [...window.__e.el.shadowRoot.querySelectorAll('.reb')].filter((b) => !b.hasAttribute('hidden')).length)
      expect(visible, size).toBe(0)
    }
  })

  test('fires with the account\'s id from the pointer and the keyboard, and changes nothing else', async ({ page }) => {
    await open(page, `${FUND}&size=Tall&width=304&actions`)
    const buttons = page.locator('ts-capital-funding .reb')
    await expect(buttons).toHaveCount(3)
    await buttons.nth(1).click()
    await buttons.nth(2).focus()
    await page.keyboard.press('Enter')
    await buttons.nth(0).focus()
    await page.keyboard.press('Space')
    expect(await page.evaluate(() => window.__e.events)).toEqual([
      { action: 'rebalance', id: 'b' },
      { action: 'rebalance', id: 'c' },
      { action: 'rebalance', id: 'a' },
    ])
    const names = await buttons.evaluateAll((all) => all.map((b) => b.getAttribute('aria-label')))
    expect(names).toEqual(['Rebalance Broker A', 'Rebalance Broker B', 'Rebalance Broker C'])
  })

  test('nothing fires while the grid is editing', async ({ page }) => {
    await open(page, `${FUND}&size=Tall&width=304&actions`)
    await page.evaluate(() => { window.__e.el._isEditing = () => true })
    await page.locator('ts-capital-funding .reb').first().click({ force: true })
    await page.locator('ts-capital-funding .reb').first().focus()
    await page.keyboard.press('Enter')
    expect(await page.evaluate(() => window.__e.events)).toEqual([])
    await page.evaluate(() => { window.__e.el._isEditing = () => false })
    await page.locator('ts-capital-funding .reb').first().click()
    expect(await page.evaluate(() => window.__e.events)).toEqual([{ action: 'rebalance', id: 'a' }])
  })

  test('S has an icon button for the first account', async ({ page }) => {
    await open(page, `${FUND}&size=S&width=170&actions`)
    const button = page.locator('ts-capital-funding .reb')
    await expect(button).toHaveAttribute('aria-label', 'Rebalance Broker A')
    await button.click()
    expect(await page.evaluate(() => window.__e.events)).toEqual([{ action: 'rebalance', id: 'a' }])
  })

  test('the button is at least 44px on a touch screen', async ({ page, hasTouch }) => {
    await open(page, `${FUND}&size=Tall&width=304&actions`)
    const box = await page.locator('ts-capital-funding .reb').first().boundingBox()
    if (hasTouch) expect(box.height).toBeGreaterThanOrEqual(43.5)
    await open(page, `${FUND}&size=S&width=170&actions`)
    const icon = await page.locator('ts-capital-funding .reb').boundingBox()
    if (hasTouch) {
      expect(icon.width).toBeGreaterThanOrEqual(43.5)
      expect(icon.height).toBeGreaterThanOrEqual(43.5)
    }
  })
})

test.describe('fits its tile', () => {
  // [query, size, width]: the S tile at a phone is about 170px, Wide and M about 351px, and a desktop tile twice that.
  const CASES = [
    [EDGE, 'S', 170], [EDGE, 'S', 304], [EDGE, 'Wide', 351], [EDGE, 'Wide', 624], [EDGE, 'M', 351], [EDGE, 'M', 624],
    [FUND, 'S', 170], [FUND, 'S', 304], [FUND, 'Tall', 140], [FUND, 'Tall', 170], [FUND, 'Tall', 304], [FUND, 'L', 468], [FUND, 'L', 936],
  ]

  // Nothing sticks out of the tile sideways or downwards, no scroller scrolls sideways, and no figure is cut.
  const measure = () => {
    const root = window.__e.el.shadowRoot
    const tile = root.querySelector('.tile')
    const box = tile.getBoundingClientRect()
    const inScroller = (n) => n.closest('.scroll') || n.closest('[hidden]') || n.closest('.visually-hidden')
    // What an ellipsis cuts off is inside a box that ends within the tile: what is drawn is within it.
    const clipped = (n) => {
      for (let p = n.parentElement; p && p !== tile; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== 'visible' && p.getBoundingClientRect().right <= box.right + 0.5) return true
      }
      return false
    }
    const out = [...root.querySelectorAll('.tile *')].filter((n) => {
      if (inScroller(n) || clipped(n)) return false
      const r = n.getBoundingClientRect()
      return r.width > 0 && (r.right > box.right + 0.5 || r.bottom > box.bottom + 0.5)
    })
    const scroll = root.querySelector('.scroll')
    const cut = [...root.querySelectorAll('.n, .big, .nv, .st')].filter((n) => !inScroller(n) && n.scrollWidth > n.clientWidth + 1)
    const cutInside = scroll ? [...scroll.querySelectorAll('.n, .st')].filter((n) => !n.closest('[hidden]') && n.scrollWidth > n.clientWidth + 1) : []
    return {
      out: out.map((n) => `${n.className || n.localName}`),
      overflow: scroll ? scroll.scrollWidth - scroll.clientWidth : 0,
      tileScroll: tile.scrollHeight - tile.clientHeight,
      cut: [...cut, ...cutInside].map((n) => n.className),
    }
  }

  for (const [kind, size, width] of CASES) {
    for (const theme of ['light', 'dark']) {
      test(`${kind.slice(5)} ${size} at ${width}px in ${theme}: nothing outside the tile, no sideways scroll, every figure whole`, async ({ page }) => {
        await open(page, `${kind}&size=${size}&width=${width}&theme=${theme}&actions&fit&big`)
        const info = await page.evaluate(measure)
        expect(info.out, 'sticks out of the tile').toEqual([])
        expect(info.overflow, 'the list scrolls sideways').toBeLessThanOrEqual(1)
        expect(info.tileScroll, 'the tile is taller than itself').toBeLessThanOrEqual(1)
        expect(info.cut, 'a figure is clipped').toEqual([])
      })
    }
  }

  // A runner with wider fallback fonts than ours must not push anything out of the tile: the same check, with wide type.
  for (const [kind, size, width] of [[EDGE, 'S', 170], [EDGE, 'Wide', 351], [EDGE, 'M', 351], [FUND, 'S', 170], [FUND, 'Tall', 140], [FUND, 'Tall', 170], [FUND, 'L', 468]]) {
    for (const theme of ['light', 'dark']) {
      test(`${kind.slice(5)} ${size} at ${width}px in ${theme} with wide fonts: still inside the tile`, async ({ page }) => {
        await open(page, `${kind}&size=${size}&width=${width}&theme=${theme}&actions&fit&wide`)
        const info = await page.evaluate(measure)
        expect(info.out, 'sticks out of the tile').toEqual([])
        expect(info.overflow, 'the list scrolls sideways').toBeLessThanOrEqual(1)
        expect(info.tileScroll, 'the tile is taller than itself').toBeLessThanOrEqual(1)
      })
    }
  }

  test('under the terminal preset (a monospace face) the figures still fit', async ({ page }) => {
    for (const [kind, size, width] of [[EDGE, 'S', 170], [EDGE, 'Wide', 351], [EDGE, 'M', 351], [FUND, 'S', 170], [FUND, 'Tall', 170], [FUND, 'L', 468]]) {
      await open(page, `${kind}&size=${size}&width=${width}&preset=terminal&actions&fit&big`)
      const info = await page.evaluate(measure)
      expect(info.out, `${kind} ${size} ${width}`).toEqual([])
      expect(info.overflow, `${kind} ${size} ${width}`).toBeLessThanOrEqual(1)
      expect(info.cut, `${kind} ${size} ${width}`).toEqual([])
    }
  })
})

test.describe('under forced colours', () => {
  test('the funding bar keeps an outline, and a loss bar of the histogram is dashed', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' })
    await open(page, `${FUND}&size=Tall&width=304`)
    expect(await page.evaluate(() => getComputedStyle(window.__e.el.shadowRoot.querySelector('.fb')).borderTopWidth)).toBe('1px')
    await open(page, `${EDGE}&size=M&width=624`)
    expect(await page.evaluate(() => getComputedStyle(window.__e.el.shadowRoot.querySelector('.hb.loss .hbar')).borderTopStyle)).toBe('dashed')
  })
})
