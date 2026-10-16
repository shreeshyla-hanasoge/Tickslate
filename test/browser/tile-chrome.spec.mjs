// The shared tile chrome in real engines (RFC 0003 §5): the group and heading
// semantics, the system colours under forced colours, and mirroring in a
// right-to-left page. The node tests cover the markup and the CSS text; this
// covers what a browser makes of them.
import { test, expect } from '@playwright/test'
import { SIZES } from '../../src/core/index.js'

const PAGE = '/test/browser/fixtures/widgets.html'

function guard(page, errors) {
  page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (error) => errors.push(error.message))
}

// The fixture lets a tile shrink to its caption (a size container has no width of its own), so each figure is given
// the width a 4-column desktop grid would, and the drawings have room to be measured.
async function open(page, query = '') {
  await page.goto(`${PAGE}?theme=light${query}`)
  await page.waitForFunction(() => window.__ready === true)
  await page.evaluate((sizes) => {
    for (const el of window.__fx.tiles.values()) {
      const { cols } = sizes[el.dataset.size]
      el.parentElement.style.width = `${cols * 304 + (cols - 1) * 16}px`
    }
    return window.__fx.nextFrame()
  }, SIZES)
}

test.describe('the dashboard region', () => {
  const GRID = '/test/browser/fixtures/grid.html?mode=explicit'
  const load = async (page) => {
    guard(page, [])
    await page.goto(GRID)
    await page.waitForFunction(() => window.__ready === true)
  }

  test('the board is the one region, named by the host\'s aria-label, else "Dashboard", and follows messages', async ({ page }) => {
    await load(page)
    // The fixture names its grid; the board takes that name, and the host itself is not a second landmark.
    await page.evaluate(() => document.getElementById('g').setAttribute('aria-label', 'Sales desk'))
    await expect(page.getByRole('region')).toHaveCount(1)
    await expect(page.getByRole('region', { name: 'Sales desk' })).toHaveCount(1)
    await page.evaluate(() => document.getElementById('g').removeAttribute('aria-label'))
    await expect(page.getByRole('region', { name: 'Dashboard' })).toHaveCount(1)
    await page.evaluate(() => { document.getElementById('g').messages = { 'grid.dashboard': 'Tableau de bord' } })
    await expect(page.getByRole('region', { name: 'Tableau de bord' })).toHaveCount(1)
    const host = await page.evaluate(() => {
      const g = document.getElementById('g')
      return { role: g.getAttribute('role'), label: g.getAttribute('aria-label'), board: g.shadowRoot.querySelector('[part="board"]').getAttribute('role') }
    })
    expect(host).toEqual({ role: null, label: null, board: 'region' })
  })

  test('the tiles are groups inside it, and focus with nowhere else to go lands on it', async ({ page }) => {
    await load(page)
    await page.evaluate(() => document.getElementById('g').removeAttribute('aria-label'))
    // The tiles are light-DOM children slotted into the board, so only the accessibility tree shows them inside it.
    expect(await page.locator('#g').ariaSnapshot()).toMatch(/region "Dashboard":[\s\S]*- group "/)
    const focused = await page.evaluate(() => {
      const g = document.getElementById('g')
      g._focus(g)
      return { inside: g.shadowRoot.activeElement && g.shadowRoot.activeElement.getAttribute('part'), host: g.getAttribute('tabindex') }
    })
    expect(focused).toEqual({ inside: 'board', host: null })
  })
})

test.describe('tile semantics', () => {
  test('every tile is a labelled group with a level-3 heading, and none is a landmark', async ({ page }) => {
    const errors = []
    guard(page, errors)
    await open(page)
    const tiles = await page.evaluate(() =>
      [...window.__fx.tiles.entries()].map(([key, el]) => {
        const tile = el.shadowRoot.querySelector('.tile')
        const heading = el.shadowRoot.querySelector('[part="label"]')
        return {
          key,
          tag: tile.localName,
          role: tile.getAttribute('role'),
          part: tile.getAttribute('part'),
          name: tile.getAttribute('aria-label'),
          headingRole: heading && heading.getAttribute('role'),
          level: heading && heading.getAttribute('aria-level'),
          headingTag: heading && heading.localName,
          landmarks: el.shadowRoot.querySelectorAll('section, [role="region"], [role="main"]').length,
        }
      }),
    )
    expect(tiles.length).toBeGreaterThan(10)
    for (const tile of tiles) {
      expect(tile.tag, tile.key).toBe('div')
      expect(tile.role, tile.key).toBe('group')
      expect(tile.part, tile.key).toBe('tile')
      expect(tile.name, `${tile.key} is named`).toBeTruthy()
      expect(tile.headingRole, tile.key).toBe('heading')
      expect(tile.headingTag, `${tile.key}: role=heading on a span, not an <h3>`).toBe('span')
      expect(tile.level, tile.key).toBe('3')
      expect(tile.landmarks, tile.key).toBe(0)
    }
    expect(errors).toEqual([])
  })

  test('the accessibility tree names the group and exposes the heading', async ({ page }) => {
    await open(page)
    const tree = await page.locator('ts-metric[data-size="Wide"]').ariaSnapshot()
    expect(tree).toMatch(/group "Metric, [^"]*"/)
    expect(tree).toMatch(/heading "Metric" \[level=3\]/)
  })

  test('heading-level on a widget sets the level, on a grid it is inherited, and the widget wins', async ({ page }) => {
    await open(page)
    const levels = await page.evaluate(async () => {
      const level = (el) => el.shadowRoot.querySelector('[part="label"]').getAttribute('aria-level')
      const metric = window.__fx.tiles.get('metric:S')
      metric.setAttribute('heading-level', '5')
      await window.__fx.nextFrame()
      const own = level(metric)
      const grid = document.createElement('ts-grid')
      const inner = document.createElement('ts-metric')
      inner.setAttribute('size', 'S')
      inner.data = { value: 1 }
      grid.setAttribute('heading-level', '2')
      grid.append(inner)
      document.body.append(grid)
      await window.__fx.nextFrame()
      const inherited = level(inner)
      inner.setAttribute('heading-level', '4')
      await window.__fx.nextFrame()
      return { own, inherited, widgetWins: level(inner) }
    })
    expect(levels).toEqual({ own: '5', inherited: '2', widgetWins: '4' })
  })

  test('a live tile\'s name ends ", live" and a ticking tile\'s name is written only when it changes', async ({ page }) => {
    await open(page)
    const result = await page.evaluate(async () => {
      const el = window.__fx.tiles.get('metric:S')
      const tile = el.shadowRoot.querySelector('.tile')
      const writes = []
      new MutationObserver((records) => records.forEach((r) => writes.push(r.attributeName))).observe(tile, { attributes: true, attributeFilter: ['aria-label'] })
      const before = tile.getAttribute('aria-label')
      el.data = { ...el.data, live: true }
      await window.__fx.nextFrame()
      const live = tile.getAttribute('aria-label')
      const count = writes.length
      for (let i = 0; i < 5; i++) {
        el.requestRender()
        await window.__fx.nextFrame()
      }
      return { before, live, extraWrites: writes.length - count }
    })
    expect(result.live).toBe(`${result.before}, live`)
    expect(result.extraWrites).toBe(0)
  })
})

// A system colour as the browser computes it, so a rule can be compared with what it should resolve to.
const systemColours = (page) =>
  page.evaluate(() => {
    const probe = document.createElement('span')
    document.body.append(probe)
    const out = {}
    for (const name of ['Highlight', 'HighlightText', 'CanvasText', 'ButtonFace']) {
      probe.style.color = name
      out[name] = getComputedStyle(probe).color
    }
    probe.remove()
    return out
  })

test.describe('forced colours', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' })
  })

  test('the forced-colors query matches, and the system colours are the four the CSS uses', async ({ page }) => {
    await open(page)
    expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true)
    const colours = await systemColours(page)
    expect(new Set(Object.values(colours)).size, 'distinct colours').toBeGreaterThanOrEqual(2)
  })

  test('the session clock fill, ticks and marker stay visible in system colours', async ({ page }) => {
    await open(page)
    const colours = await systemColours(page)
    const found = await page.evaluate(() => {
      const root = window.__fx.tiles.get('sessionClock:Banner').shadowRoot
      const style = (el, prop) => getComputedStyle(el)[prop]
      const lf = root.querySelector('.lf')
      const tick = root.querySelector('.tk')
      const mark = root.querySelector('.mk:not([hidden])')
      const small = window.__fx.tiles.get('sessionClock:S').shadowRoot
      return {
        laneFill: style(lf, 'backgroundColor'),
        laneFillWidth: lf.getBoundingClientRect().width,
        tick: tick && style(tick, 'backgroundColor'),
        markBorder: mark && style(mark, 'borderTopColor'),
        markShadow: mark && style(mark, 'boxShadow'),
        smallFill: style(small.querySelector('.fill'), 'backgroundColor'),
        smallFillWidth: small.querySelector('.fill').getBoundingClientRect().width,
        trackBorder: style(small.querySelector('.trk'), 'borderTopWidth'),
      }
    })
    expect(found.laneFill).toBe(colours.Highlight)
    expect(found.laneFillWidth).toBeGreaterThan(0)
    expect(found.smallFill).toBe(colours.Highlight)
    expect(found.smallFillWidth).toBeGreaterThan(0)
    expect(found.tick).toBe(colours.CanvasText)
    expect(found.trackBorder).toBe('1px')
    if (found.markBorder) {
      expect(found.markBorder).toBe(colours.CanvasText)
      expect(found.markShadow).toBe('none')
    }
  })

  test('the live dot, Today\'s P&L marks and chart lines use system colours', async ({ page }) => {
    await open(page)
    const colours = await systemColours(page)
    const found = await page.evaluate(() => {
      const pnl = window.__fx.tiles.get('todayPnl:M').shadowRoot
      const dot = pnl.querySelector('.dot.live:not([hidden])')
      const entry = pnl.querySelector('.mk.entry')
      const exit = pnl.querySelector('.mk.exit')
      const chart = window.__fx.tiles.get('chart:M').shadowRoot
      const equity = window.__fx.tiles.get('equityCurve:M').shadowRoot
      return {
        dot: dot && getComputedStyle(dot).backgroundColor,
        entry: getComputedStyle(entry).backgroundColor,
        exit: getComputedStyle(exit).backgroundColor,
        pnlLine: getComputedStyle(pnl.querySelector('.lp')).stroke,
        chartLine: getComputedStyle(chart.querySelector('.sl.c-1')).stroke,
        chartLine2: getComputedStyle(chart.querySelector('.sl.c-2')).stroke,
        equityLine: getComputedStyle(equity.querySelector('.lp')).stroke,
        entryBox: entry.getBoundingClientRect().width,
      }
    })
    expect(found.dot).toBe(colours.Highlight)
    expect(found.entry).toBe(colours.Highlight)
    expect(found.exit).toBe(colours.CanvasText)
    expect(found.entryBox).toBeGreaterThan(0)
    expect(found.pnlLine).toBe(colours.CanvasText)
    expect(found.equityLine).toBe(colours.CanvasText)
    expect(found.chartLine).toBe(colours.CanvasText)
    expect(found.chartLine2).toBe(colours.Highlight)
  })

  test('the selected range button and the metric target bar stay visible', async ({ page }) => {
    await open(page)
    const colours = await systemColours(page)
    const found = await page.evaluate(() => {
      const equity = window.__fx.tiles.get('equityCurve:XL').shadowRoot
      const on = equity.querySelector('.btn.on')
      const metric = window.__fx.tiles.get('metric:M').shadowRoot
      const fill = metric.querySelector('.fill')
      const bar = metric.querySelector('.tbar')
      return {
        onBackground: getComputedStyle(on).backgroundColor,
        onColor: getComputedStyle(on).color,
        fill: getComputedStyle(fill).fill,
        fillWidth: fill.getBoundingClientRect().width,
        barBorder: getComputedStyle(bar).borderTopWidth,
      }
    })
    expect(found.onBackground).toBe(colours.Highlight)
    // The text colour that pairs with the Highlight it sits on.
    expect(found.onColor).toBe(colours.HighlightText)
    expect(found.fill).toBe(colours.Highlight)
    expect(found.fillWidth).toBeGreaterThan(0)
    expect(found.barBorder).toBe('1px')
  })
})

test.describe('right-to-left pages', () => {
  const marks = (page) =>
    page.evaluate(() => {
      const root = window.__fx.tiles.get('todayPnl:M').shadowRoot
      const box = root.querySelector('.chart').getBoundingClientRect()
      return [...root.querySelectorAll('.mk')].map((m) => {
        const r = m.getBoundingClientRect()
        return Math.round(((r.left + r.width / 2 - box.left) / box.width) * 100)
      })
    })

  test('Today\'s P&L marks, the session clock fill and the chart plot keep their left-to-right places', async ({ page }) => {
    await open(page)
    const read = () =>
      page.evaluate(() => {
        const clock = window.__fx.tiles.get('sessionClock:S').shadowRoot
        const fill = clock.querySelector('.fill').getBoundingClientRect()
        const track = clock.querySelector('.trk').getBoundingClientRect()
        const plot = window.__fx.tiles.get('chart:M').shadowRoot.querySelector('.plot')
        return { fillFromStart: Math.round(fill.left - track.left), fillWidth: Math.round(fill.width), plotDirection: getComputedStyle(plot).direction }
      })
    const ltrMarks = await marks(page)
    const ltr = await read()
    await page.evaluate(() => { document.documentElement.dir = 'rtl' })
    await page.evaluate(() => window.__fx.nextFrame())
    expect(await marks(page)).toEqual(ltrMarks)
    const rtl = await read()
    expect(rtl).toEqual(ltr)
    expect(rtl.plotDirection).toBe('ltr')
    expect(ltrMarks.length).toBeGreaterThan(1)
  })

  test('the session clock\'s times sit under the matching ends of its bar, in either direction', async ({ page }) => {
    await open(page)
    const read = () =>
      page.evaluate(() => {
        const root = window.__fx.tiles.get('sessionClock:S').shadowRoot
        const track = root.querySelector('.trk').getBoundingClientRect()
        const from = root.querySelector('.from').getBoundingClientRect()
        const to = root.querySelector('.to').getBoundingClientRect()
        return {
          fromAtStart: Math.round(from.left - track.left),
          toAtEnd: Math.round(track.right - to.right),
          fromText: root.querySelector('.from').textContent,
          ft: getComputedStyle(root.querySelector('.ft')).direction,
        }
      })
    const ltr = await read()
    expect(ltr.fromText.length).toBeGreaterThan(0)
    await page.evaluate(() => { document.documentElement.dir = 'rtl' })
    await page.evaluate(() => window.__fx.nextFrame())
    const rtl = await read()
    expect(rtl.ft).toBe('ltr')
    // The opening time is under the bar's left end (where the fill starts) and the closing one under its right end.
    expect(rtl.fromAtStart).toBeCloseTo(ltr.fromAtStart, 0)
    expect(rtl.toAtEnd).toBeCloseTo(ltr.toAtEnd, 0)
    expect(rtl.fromAtStart).toBeLessThanOrEqual(2)
    expect(rtl.toAtEnd).toBeLessThanOrEqual(2)
  })

  test('the header mirrors: the label sits at the inline start, the meta at the inline end', async ({ page }) => {
    await open(page)
    await page.evaluate(() => { document.documentElement.dir = 'rtl' })
    await page.evaluate(() => window.__fx.nextFrame())
    const place = await page.evaluate(() => {
      const root = window.__fx.tiles.get('metric:S').shadowRoot
      const tile = root.querySelector('.tile').getBoundingClientRect()
      const label = root.querySelector('[part="label"]').getBoundingClientRect()
      const meta = root.querySelector('[data-k="meta"]')
      return { labelFromRight: tile.right - label.right, labelFromLeft: label.left - tile.left, metaShown: !meta.hidden && meta.getBoundingClientRect().width > 0 ? meta.getBoundingClientRect().left - tile.left : null }
    })
    expect(place.labelFromRight).toBeLessThan(place.labelFromLeft)
    if (place.metaShown !== null) expect(place.metaShown).toBeLessThan(place.labelFromLeft)
  })

  test('no tile grows a horizontal scrollbar or changes height in a right-to-left page', async ({ page }) => {
    await open(page)
    const heights = await page.evaluate(() => [...window.__fx.tiles.values()].map((el) => Math.round(el.getBoundingClientRect().height)))
    await page.evaluate(() => { document.documentElement.dir = 'rtl' })
    await page.evaluate(() => window.__fx.nextFrame())
    const after = await page.evaluate(() => [...window.__fx.tiles.values()].map((el) => Math.round(el.getBoundingClientRect().height)))
    expect(after).toEqual(heights)
  })
})

// A signed figure is the arrow, the sign and the number, and it never breaks between them (RFC 0003 §5.5). The terminal
// and calm presets set the figures in a monospace face, the widest a figure gets, so a tile that fits them fits any.
// The fixture puts each tile at the width a 2-column phone gives it, the narrowest it is drawn: 170px for S, 351px for
// the others.
test.describe('signed figures on a phone', () => {
  const PHONE = { S: 170, Wide: 351, M: 351 }
  const TILES = ['todayPnl:S', 'todayPnl:Wide', 'todayPnl:M', 'equityCurve:Wide', 'equityCurve:M', 'metric:S', 'metric:Wide', 'metric:M']

  for (const preset of ['terminal', 'calm']) {
    for (const theme of ['light', 'dark']) {
      test(`${preset} ${theme}: the arrow and the figure share a line, and nothing overflows`, async ({ page }) => {
        const errors = []
        guard(page, errors)
        await page.goto(`${PAGE}?theme=${theme}&preset=${preset}`)
        await page.waitForFunction(() => window.__ready === true)
        const found = await page.evaluate(async ({ tiles, phone }) => {
          const out = []
          for (const key of tiles) {
            const el = window.__fx.tiles.get(key)
            const size = key.split(':')[1]
            el.style.width = `${phone[size]}px`
          }
          await window.__fx.nextFrame()
          for (const key of tiles) {
            const el = window.__fx.tiles.get(key)
            const root = el.shadowRoot
            const tile = root.querySelector('.tile')
            // The tile is the figure's last resort: nothing may push it sideways.
            out.push({ key, what: 'tile', over: tile.scrollWidth - tile.clientWidth })
            const signed = [...root.querySelectorAll('.fg, [data-k="change"]')].filter((box) => {
              const arrow = box.querySelector('.ar, [data-k="arrow"]')
              return arrow && arrow.textContent
            })
            out.push({ key, what: 'signed figures drawn', count: signed.length })
            for (const box of signed) {
              const arrow = box.querySelector('.ar, [data-k="arrow"]')
              const figure = box.classList.contains('fg') ? box.parentElement : box
              // The first digit of the number, found in its own text node, so a sign or a currency before it is skipped.
              const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT)
              let digit = null
              for (let node = walker.nextNode(); node && !digit; node = walker.nextNode()) {
                if (arrow.contains(node)) continue
                const at = node.data.search(/\p{Nd}/u)
                if (at >= 0) {
                  const range = document.createRange()
                  range.setStart(node, at)
                  range.setEnd(node, at + 1)
                  digit = range.getBoundingClientRect()
                }
              }
              const a = arrow.getBoundingClientRect()
              const label = `${key} ${figure.dataset.k || ''} "${box.textContent.trim()}"`
              // The arrow is a smaller mark raised to the digits' middle, so its box is not top-aligned with the digit's. On the
              // same line its middle lies within the digit's box; wrapped, it is a whole line above or below it.
              const mid = (a.top + a.bottom) / 2
              out.push({ key, what: `${label}: arrow beside the first digit`, off: digit ? Math.max(digit.top - mid, mid - digit.bottom, 0) : null, lines: box.getClientRects().length })
              out.push({ key, what: `${label}: figure fits its box`, over: figure.scrollWidth - figure.clientWidth, wrapperOver: box.getBoundingClientRect().width - figure.clientWidth })
            }
          }
          return out
        }, { tiles: TILES, phone: PHONE })
        expect(errors).toEqual([])
        for (const r of found) {
          if (r.what === 'signed figures drawn') {
            expect(r.count, `${r.key} draws a figure with an arrow`).toBeGreaterThan(0)
          } else if ('off' in r) {
            expect(r.off, r.what).not.toBeNull()
            expect(r.off, r.what).toBeLessThanOrEqual(2)
            expect(r.lines, `${r.what}: one line box`).toBe(1)
          } else {
            expect(r.over, `${r.key} ${r.what}`).toBeLessThanOrEqual(0)
            // The wrapper is an inline box, which has no scrollWidth of its own, so its drawn width is read instead.
            if ('wrapperOver' in r) expect(r.wrapperOver, `${r.key} ${r.what}`).toBeLessThanOrEqual(0.5)
          }
        }
      })
    }
  }
})
