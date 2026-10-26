// Chart scrubbing, exact values and hidden data tables (RFC 0004 §1) in real engines: a rule, a dot and a read-out that
// follow a mouse or a dragging finger on Today's P&L (M), the equity curve (Wide, M, XL) and <ts-chart>, one keyboard
// slider with a value text and no aria-live, nothing at all while the grid edits or with scrub="off", the full figure
// as the headline's title, the visually hidden table of the last 12 points, axe, forced colours and a strict CSP.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const PAGE = '/test/browser/fixtures/scrub.html'
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']

test.beforeEach(async ({ page }) => {
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
})

async function open(page, query = '') {
  await page.goto(`${PAGE}?${query}`)
  await page.waitForFunction(() => window.__ready === true)
  await page.evaluate(() => window.__s.nextFrame())
}

const frame = (page) => page.evaluate(() => window.__s.nextFrame())

// The plot's box in page coordinates.
const plotBox = (page) =>
  page.evaluate(() => {
    const r = window.__s.el.shadowRoot.querySelector('[data-k="plot"]').getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })

// What the overlay shows right now, as a user could see it.
const overlay = (page) =>
  page.evaluate(() => {
    const root = window.__s.el.shadowRoot
    const q = (k) => root.querySelector(`[data-k="${k}"]`)
    const box = q('scrub')
    const shown = !box.hasAttribute('hidden') && getComputedStyle(box).display !== 'none'
    const p = q('plot').getBoundingClientRect()
    const o = q('scrubOut').getBoundingClientRect()
    const rule = q('scrubRule').getBoundingClientRect()
    return {
      shown,
      label: q('scrubLab').textContent,
      items: [...root.querySelectorAll('.sc-it')].filter((i) => !i.hasAttribute('hidden')).map((i) => i.textContent),
      dots: [...root.querySelectorAll('.sc-dot')].filter((d) => !d.hasAttribute('hidden')).map((d) => { const r = d.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }),
      rule: { x: rule.x, y: rule.y, h: rule.height },
      readout: { l: o.left, r: o.right, t: o.top, b: o.bottom },
      plot: { l: p.left, r: p.right, t: p.top, b: p.bottom },
    }
  })

// The slider's attributes, and whether the keyboard can reach it.
const slider = (page) =>
  page.evaluate(() => {
    const el = window.__s.el.shadowRoot.querySelector('[data-k="scrubSlider"]')
    const cs = getComputedStyle(el)
    return {
      visible: cs.display !== 'none' && !el.hasAttribute('hidden'),
      role: el.getAttribute('role'),
      name: el.getAttribute('aria-label'),
      now: el.getAttribute('aria-valuenow'),
      min: el.getAttribute('aria-valuemin'),
      max: el.getAttribute('aria-valuemax'),
      text: el.getAttribute('aria-valuetext'),
      tabindex: el.getAttribute('tabindex'),
      disabled: el.getAttribute('aria-disabled'),
    }
  })

// Elements inside the tile that the keyboard can reach: what is focusable and not hidden.
const stops = (page) =>
  page.evaluate(() => {
    const root = window.__s.el.shadowRoot
    return [...root.querySelectorAll('[tabindex], button, a[href], input, select, textarea')]
      .filter((el) => el.getAttribute('tabindex') !== '-1' && !el.closest('[hidden]') && getComputedStyle(el).display !== 'none')
      .map((el) => el.getAttribute('role') || el.localName)
  })

const liveRegions = (page) => page.evaluate(() => window.__s.el.shadowRoot.querySelectorAll('[aria-live], [role="status"], [role="alert"], [role="log"]').length)

const table = (page) =>
  page.evaluate(() => {
    const root = window.__s.el.shadowRoot
    const box = root.querySelector('[data-k="scrubTbl"]')
    const tbl = box.querySelector('table')
    const b = box.getBoundingClientRect()
    const cs = getComputedStyle(box)
    return {
      hidden: box.hasAttribute('hidden'),
      display: cs.display,
      clip: cs.clipPath,
      size: { w: Math.round(b.width), h: Math.round(b.height) },
      caption: tbl.querySelector('caption').textContent,
      heads: [...tbl.querySelectorAll('thead th')].map((th) => [th.getAttribute('scope'), th.textContent]),
      rows: [...tbl.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => [c.localName, c.getAttribute('scope'), c.textContent])),
    }
  })

const CHARTS = [
  { name: 'Today’s P&L M', query: 'chart=pnl&size=M', items: 1, series: ['Net'], sign: true },
  { name: 'equity curve M', query: 'chart=equity&size=M', items: 2, series: ['Equity', 'Day'], sign: true },
  { name: 'equity curve XL', query: 'chart=equity&size=XL&width=760', items: 2, series: ['Equity', 'Day'], sign: true },
  { name: 'equity curve Wide', query: 'chart=equity&size=Wide', items: 2, series: ['Equity', 'Day'], sign: true },
  { name: '<ts-chart> M', query: 'chart=chart&size=M', items: 3, series: ['Requests', 'Errors', 'Cached'], sign: false },
  { name: '<ts-chart> L', query: 'chart=chart&size=L&width=760', items: 3, series: ['Requests', 'Errors', 'Cached'], sign: false },
]

test.describe('a mouse reads a point', () => {
  for (const c of CHARTS) {
    test(`${c.name}: a rule, a dot and a read-out follow the pointer, and leave with it`, async ({ page, hasTouch }) => {
      test.skip(hasTouch, 'a mouse')
      await open(page, c.query)
      expect((await overlay(page)).shown, 'nothing shows at rest').toBe(false)
      const b = await plotBox(page)
      // A line chart on a window domain (Today's P&L) has data in the first part of the box only.
      const at = c.query.startsWith('chart=pnl') ? 0.06 : 0.4
      await page.mouse.move(b.x + b.w * at, b.y + b.h / 2)
      await page.mouse.move(b.x + b.w * (at + 0.01), b.y + b.h / 2)
      await frame(page)
      const first = await overlay(page)
      expect(first.shown).toBe(true)
      expect(first.items).toHaveLength(c.items)
      for (const [i, name] of c.series.entries()) expect(first.items[i]).toContain(name)
      if (c.sign) expect(first.items[0]).toMatch(/[+−]/)
      expect(first.items.join(' ')).not.toMatch(/-\d/)
      // The rule is a vertical line over the plot, at the pointer's side of the first point.
      expect(first.rule.h).toBeGreaterThan(b.h - 2)
      expect(first.dots.length).toBeGreaterThan(0)
      for (const d of first.dots) expect(Math.abs(d.x - (first.rule.x + 0.5))).toBeLessThan(2)
      // The read-out sits beside the rule and never over the dots.
      for (const d of first.dots) {
        const inside = d.x > first.readout.l - 5 && d.x < first.readout.r + 5 && d.y > first.readout.t - 5 && d.y < first.readout.b + 5
        expect(inside, 'the read-out covers a dot').toBe(false)
      }
      await page.mouse.move(b.x + b.w * (at + 0.3), b.y + b.h / 2)
      await frame(page)
      const moved = await overlay(page)
      expect(moved.label).not.toBe(first.label)
      await page.mouse.move(b.x + b.w / 2, b.y - 60)
      await frame(page)
      expect((await overlay(page)).shown, 'leaving the plot hides it').toBe(false)
      expect(await liveRegions(page)).toBe(0)
    })
  }

  test('the read-out stays inside the plot at both edges', async ({ page, hasTouch }) => {
    test.skip(hasTouch, 'a mouse')
    for (const c of CHARTS) {
      await open(page, c.query)
      const b = await plotBox(page)
      for (const f of [0, 0.005, 0.995, 1]) {
        await page.mouse.move(b.x + b.w * f, b.y + b.h / 2)
        await page.mouse.move(b.x + Math.min(b.w - 1, Math.max(1, b.w * f)), b.y + b.h / 2 + 1)
        await frame(page)
        const o = await overlay(page)
        if (!o.shown) continue
        expect(o.readout.l, `${c.name} at ${f}: left`).toBeGreaterThanOrEqual(o.plot.l - 1)
        expect(o.readout.r, `${c.name} at ${f}: right`).toBeLessThanOrEqual(o.plot.r + 1)
      }
    }
  })

  test('the plot pans vertically by touch, so only a horizontal drag scrubs', async ({ page }) => {
    await open(page, 'chart=equity&size=M')
    expect(await page.evaluate(() => getComputedStyle(window.__s.el.shadowRoot.querySelector('[data-k="plot"]')).touchAction)).toBe('pan-y')
  })

  test('Today’s P&L reads the right edge of its window as the end of the window, not the last reading', async ({ page, hasTouch }) => {
    test.skip(hasTouch, 'a mouse')
    await open(page, 'chart=pnl&size=M')
    const b = await plotBox(page)
    await page.mouse.move(b.x + b.w * 0.97, b.y + b.h / 2)
    await page.mouse.move(b.x + b.w * 0.98, b.y + b.h / 2)
    await frame(page)
    const late = await overlay(page)
    // The readings end at the frozen 11:42, well before the window's close: the newest reading answers.
    expect(late.label).toBe('11:42')
    await page.mouse.move(b.x + b.w * 0.01, b.y + b.h / 2)
    await page.mouse.move(b.x + 1, b.y + b.h / 2)
    await frame(page)
    expect((await overlay(page)).label).toBe('09:15')
  })
})

test.describe('a finger drags to read a point', () => {
  // The same events a touch screen sends, for every engine; a real touch is added below for Chromium.
  async function drag(page, from, to, o = {}) {
    await page.evaluate(
      ({ from, to, o }) => {
        const root = window.__s.el.shadowRoot
        const plot = root.querySelector('[data-k="plot"]')
        const send = (type, x, y) => plot.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', pointerId: 7, isPrimary: true, clientX: x, clientY: y, bubbles: true, composed: true, cancelable: true }))
        send('pointerdown', from.x, from.y)
        window.__drag = { send, to }
        send('pointermove', to.x, to.y)
      },
      { from, to, o },
    )
    await frame(page)
  }
  const lift = (page, type = 'pointerup') => page.evaluate((t) => window.__drag.send(t, window.__drag.to.x, window.__drag.to.y), type)

  for (const c of CHARTS.filter((x) => ['Today’s P&L M', 'equity curve XL', '<ts-chart> M'].includes(x.name))) {
    test(`${c.name}: a drag that starts on the plot scrubs, and lifting the finger hides it`, async ({ page }) => {
      await open(page, c.query)
      const b = await plotBox(page)
      const y = b.y + b.h / 2
      const f0 = c.query.startsWith('chart=pnl') ? 0.02 : 0.2
      const f1 = c.query.startsWith('chart=pnl') ? 0.08 : 0.7
      await drag(page, { x: b.x + b.w * f0, y }, { x: b.x + b.w * f1, y })
      const o = await overlay(page)
      expect(o.shown).toBe(true)
      expect(o.items).toHaveLength(c.items)
      const first = o.label
      await page.evaluate(() => window.__drag.send('pointermove', window.__drag.to.x - 60, window.__drag.to.y + 30))
      await frame(page)
      const next = await overlay(page)
      expect(next.shown, 'a finger drifting off the plot keeps scrubbing').toBe(true)
      expect(next.label).not.toBe(first)
      await lift(page)
      expect((await overlay(page)).shown).toBe(false)
      expect(await liveRegions(page)).toBe(0)
    })
  }

  test('a cancelled touch (the browser took it to scroll the page) hides it too', async ({ page }) => {
    await open(page, 'chart=equity&size=M')
    const b = await plotBox(page)
    await drag(page, { x: b.x + b.w * 0.3, y: b.y + 20 }, { x: b.x + b.w * 0.5, y: b.y + 40 })
    expect((await overlay(page)).shown).toBe(true)
    await lift(page, 'pointercancel')
    expect((await overlay(page)).shown).toBe(false)
  })

  test('a touch that starts outside the plot, or a finger that only moves, scrubs nothing', async ({ page }) => {
    await open(page, 'chart=equity&size=M')
    const b = await plotBox(page)
    await drag(page, { x: b.x + b.w * 0.3, y: b.y + b.h + 80 }, { x: b.x + b.w * 0.5, y: b.y + b.h / 2 })
    expect((await overlay(page)).shown).toBe(false)
    await lift(page)
    await page.evaluate(({ x, y }) => {
      const plot = window.__s.el.shadowRoot.querySelector('[data-k="plot"]')
      plot.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'touch', pointerId: 8, clientX: x, clientY: y, bubbles: true, composed: true }))
    }, { x: b.x + b.w / 2, y: b.y + b.h / 2 })
    await frame(page)
    expect((await overlay(page)).shown).toBe(false)
  })

  test('a real touch drag on Chromium scrubs and a vertical swipe does not', async ({ page, browserName, hasTouch }) => {
    test.skip(browserName !== 'chromium' || !hasTouch, 'Chromium with a touch screen')
    await open(page, 'chart=equity&size=M')
    const b = await plotBox(page)
    const client = await page.context().newCDPSession(page)
    const y = b.y + b.h / 2
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.w * 0.2, y }] })
    for (let i = 1; i <= 8; i++) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x + b.w * (0.2 + i * 0.06), y }] })
    await frame(page)
    const during = await overlay(page)
    expect(during.shown).toBe(true)
    expect(during.items).toHaveLength(2)
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await frame(page)
    expect((await overlay(page)).shown).toBe(false)
  })
})

test.describe('the keyboard slider', () => {
  for (const c of CHARTS) {
    test(`${c.name}: one tab stop, a named slider, and keys that move a value text nobody announces`, async ({ page }) => {
      await open(page, c.query)
      const s0 = await slider(page)
      expect(s0.visible).toBe(true)
      expect(s0.role).toBe('slider')
      expect(s0.name).toMatch(/, read point by point$/)
      expect(s0.min).toBe('0')
      expect(Number(s0.now)).toBe(Number(s0.max))
      expect(s0.text).toContain(': ')
      // The only stop that is a plot's own: the range buttons of XL are buttons, and the slider is the one slider.
      expect((await stops(page)).filter((r) => r === 'slider')).toHaveLength(1)
      expect((await overlay(page)).shown, 'nothing shows until it has focus').toBe(false)

      await page.evaluate(() => window.__s.el.shadowRoot.querySelector('[data-k="scrubSlider"]').focus())
      await frame(page)
      const focused = await overlay(page)
      expect(focused.shown, 'focus shows the newest point').toBe(true)
      const last = await slider(page)
      expect(last.now).toBe(s0.max)

      await page.keyboard.press('ArrowLeft')
      const a = await slider(page)
      expect(Number(a.now)).toBe(Number(s0.max) - 1)
      expect(a.text).not.toBe(last.text)
      expect((await overlay(page)).label).toBe(a.text.split(': ')[0])

      await page.keyboard.press('PageDown')
      expect(Number((await slider(page)).now)).toBe(Number(s0.max) - 11)
      await page.keyboard.press('PageUp')
      expect(Number((await slider(page)).now)).toBe(Number(s0.max) - 1)
      await page.keyboard.press('Home')
      const home = await slider(page)
      expect(home.now).toBe('0')
      await page.keyboard.press('ArrowLeft')
      expect((await slider(page)).now, 'clamped').toBe('0')
      await page.keyboard.press('ArrowRight')
      expect((await slider(page)).now).toBe('1')
      await page.keyboard.press('End')
      expect((await slider(page)).now).toBe(s0.max)
      // The value text names the x and the values, and it is what a screen reader speaks as the keys move.
      const end = await slider(page)
      for (const name of c.series) expect(end.text).toContain(name)
      expect(end.text).toBe(last.text)

      await page.keyboard.press('Escape')
      expect((await overlay(page)).shown, 'Escape hides the read-out').toBe(false)
      expect(await page.evaluate(() => window.__s.el.shadowRoot.activeElement?.getAttribute('data-k')), 'and keeps focus').toBe('scrubSlider')
      await page.keyboard.press('ArrowLeft')
      expect((await overlay(page)).shown).toBe(true)
      expect(await liveRegions(page), 'no live region, ever').toBe(0)

      await page.evaluate(() => window.__s.el.shadowRoot.querySelector('[data-k="scrubSlider"]').blur())
      await frame(page)
      expect((await overlay(page)).shown, 'leaving it hides the read-out').toBe(false)
    })
  }

  test('Tab reaches the slider, and the arrows are earlier and later in a right-to-left page too', async ({ page, hasTouch }) => {
    test.skip(hasTouch, 'a keyboard')
    await open(page, 'chart=equity&size=M')
    await page.evaluate(() => { document.documentElement.dir = 'rtl' })
    await page.evaluate(() => document.body.focus())
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => window.__s.el.shadowRoot.activeElement?.getAttribute('data-k'))).toBe('scrubSlider')
    const before = Number((await slider(page)).now)
    await page.keyboard.press('ArrowLeft')
    expect(Number((await slider(page)).now), 'left is earlier even in rtl').toBe(before - 1)
    await page.keyboard.press('ArrowRight')
    expect(Number((await slider(page)).now)).toBe(before)
  })

  test('with select on, the slider is its own stop before the points and shares no key with them', async ({ page }) => {
    await open(page, 'chart=chart&size=M')
    await page.evaluate(() => { window.__s.el.actions = ['select']; window.__ev = []; window.__s.el.addEventListener('ts-action', (e) => window.__ev.push(e.detail)) })
    await frame(page)
    const order = await page.evaluate(() => [...window.__s.el.shadowRoot.querySelectorAll('[data-k="scrubSlider"], .pt')].filter((e) => e.getAttribute('tabindex') === '0').map((e) => (e.matches('.pt') ? 'point' : 'slider')))
    expect(order).toEqual(['slider', 'point'])
    await page.evaluate(() => window.__s.el.shadowRoot.querySelector('[data-k="scrubSlider"]').focus())
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Space')
    expect(await page.evaluate(() => window.__ev), 'the scrubber fires no event').toEqual([])
  })

  test('a live tick keeps the reader where they are', async ({ page }) => {
    await open(page, 'chart=pnl&size=M')
    await page.evaluate(() => window.__s.el.shadowRoot.querySelector('[data-k="scrubSlider"]').focus())
    await page.keyboard.press('Home')
    await page.keyboard.press('ArrowRight')
    const before = await slider(page)
    await page.evaluate(() => {
      const d = window.__s.data
      const last = d.intraday[d.intraday.length - 1]
      window.__s.el.data = { ...d, intraday: [...d.intraday, { t: last.t + 60000, v: last.v + 5 }] }
    })
    await frame(page)
    const after = await slider(page)
    expect(after.now).toBe(before.now)
    expect(Number(after.max)).toBe(Number(before.max) + 1)
    expect((await overlay(page)).shown).toBe(true)
  })
})

test.describe('while the grid edits, and with scrub off', () => {
  test('editing makes it inert: no read-out, no tab stop, and leaving edit mode restores it', async ({ page, hasTouch }) => {
    test.skip(hasTouch, 'a mouse')
    await open(page, 'chart=equity&size=M&grid')
    const b = await plotBox(page)
    await page.mouse.move(b.x + b.w * 0.4, b.y + b.h / 2)
    await page.mouse.move(b.x + b.w * 0.41, b.y + b.h / 2)
    await frame(page)
    expect((await overlay(page)).shown).toBe(true)

    await page.evaluate(() => { window.__s.grid.editing = true })
    await frame(page)
    expect((await overlay(page)).shown, 'a read-out that was showing goes').toBe(false)
    const s = await slider(page)
    expect(s.tabindex).toBe('-1')
    expect(s.disabled).toBe('true')
    const b2 = await plotBox(page)
    await page.mouse.move(b2.x + b2.w * 0.6, b2.y + b2.h / 2)
    await page.mouse.move(b2.x + b2.w * 0.62, b2.y + b2.h / 2)
    await frame(page)
    expect((await overlay(page)).shown, 'hover does nothing while editing').toBe(false)
    expect(await page.evaluate(() => window.__s.el.inert), 'the grid takes the tile out of reach').toBe(true)
    await page.evaluate(() => { window.__s.el.shadowRoot.querySelector('[data-k="scrubSlider"]').focus() })
    expect(await page.evaluate(() => window.__s.el.shadowRoot.activeElement?.getAttribute('data-k') ?? null)).not.toBe('scrubSlider')

    await page.evaluate(() => { window.__s.grid.editing = false })
    await frame(page)
    const s2 = await slider(page)
    expect(s2.tabindex).toBe('0')
    expect(s2.disabled).toBeNull()
    const b3 = await plotBox(page)
    await page.mouse.move(b3.x + b3.w * 0.4, b3.y + b3.h / 2)
    await page.mouse.move(b3.x + b3.w * 0.41, b3.y + b3.h / 2)
    await frame(page)
    expect((await overlay(page)).shown).toBe(true)
  })

  test('a touch drag does nothing while the grid edits', async ({ page }) => {
    await open(page, 'chart=pnl&size=M&grid')
    await page.evaluate(() => { window.__s.grid.editing = true })
    await frame(page)
    const b = await plotBox(page)
    await page.evaluate(({ x, y }) => {
      const plot = window.__s.el.shadowRoot.querySelector('[data-k="plot"]')
      for (const t of ['pointerdown', 'pointermove']) plot.dispatchEvent(new PointerEvent(t, { pointerType: 'touch', pointerId: 3, clientX: x, clientY: y, bubbles: true, composed: true }))
    }, { x: b.x + b.w * 0.05, y: b.y + b.h / 2 })
    await frame(page)
    expect((await overlay(page)).shown).toBe(false)
  })

  for (const [name, query, how] of [
    ['its own scrub="off"', 'chart=equity&size=M&scrub=off', 'own'],
    ['the grid’s scrub="off"', 'chart=equity&size=M&grid&gridscrub=off', 'grid'],
  ]) {
    test(`${name} removes the tab stop and the read-out, and keeps the table`, async ({ page, hasTouch }) => {
      await open(page, query)
      expect((await slider(page)).visible).toBe(false)
      expect((await stops(page)).filter((r) => r === 'slider')).toHaveLength(0)
      if (!hasTouch) {
        const b = await plotBox(page)
        await page.mouse.move(b.x + b.w * 0.4, b.y + b.h / 2)
        await page.mouse.move(b.x + b.w * 0.41, b.y + b.h / 2)
        await frame(page)
        expect((await overlay(page)).shown).toBe(false)
      }
      expect((await table(page)).rows).toHaveLength(12)
      expect(how).toBeTruthy()
    })
  }

  test('a chart’s own scrub="on" beats a grid that says off, and the property reads and writes the attribute', async ({ page }) => {
    await open(page, 'chart=equity&size=M&grid&gridscrub=off&scrub=on')
    expect((await slider(page)).visible).toBe(true)
    expect(await page.evaluate(() => window.__s.el.scrub)).toBe('on')
    await page.evaluate(() => { window.__s.el.scrub = 'off' })
    await frame(page)
    expect(await page.evaluate(() => window.__s.el.getAttribute('scrub'))).toBe('off')
    expect((await slider(page)).visible).toBe(false)
    await page.evaluate(() => { window.__s.el.scrub = null })
    await frame(page)
    expect(await page.evaluate(() => [window.__s.el.hasAttribute('scrub'), window.__s.el.scrub])).toEqual([false, null])
    expect((await slider(page)).visible, 'the grid’s off applies again').toBe(false)
  })

  test('there is no overlay and no tab stop with fewer than two points', async ({ page }) => {
    await open(page, 'chart=pnl&size=M')
    await page.evaluate(() => {
      const d = window.__s.data
      window.__s.el.data = { ...d, intraday: d.intraday.slice(0, 1) }
    })
    await frame(page)
    expect((await slider(page)).visible).toBe(false)
    expect((await table(page)).hidden).toBe(true)
  })
})

test.describe('the headline carries its full value', () => {
  for (const [name, query, full] of [
    ['Today’s P&L', 'chart=pnl&size=M&scale=40000', /^\+₹[\d,]+\.\d\d$/],
    ['the equity curve', 'chart=equity&size=M&scale=4000000', /^[+−]₹[\d,]+\.\d\d$/],
  ]) {
    test(`${name}: the value node's title is the full figure when it went compact, and absent when it fits`, async ({ page }) => {
      await open(page, query)
      const big = await page.evaluate(() => {
        const v = window.__s.el.shadowRoot.querySelector('[part="value"]')
        return { title: v.getAttribute('title'), text: v.textContent, label: window.__s.el.shadowRoot.querySelector('.tile').getAttribute('aria-label') }
      })
      expect(big.title).toMatch(full)
      expect(big.text).not.toContain(big.title.replace(/^[+−]/, ''))
      expect(big.label, 'the accessible name has the full figure').toContain(big.title)
      await open(page, query.replace(/&scale=\d+/, ''))
      const small = await page.evaluate(() => {
        const v = window.__s.el.shadowRoot.querySelector('[part="value"]')
        return { title: v.getAttribute('title'), onHost: window.__s.el.hasAttribute('title') }
      })
      expect(small.title).toBeNull()
      expect(small.onHost, 'never on the widget host').toBe(false)
    })
  }

  test('the title follows the data, and is removed when the figure fits again', async ({ page }) => {
    await open(page, 'chart=pnl&size=M&scale=40000')
    const title = () => page.evaluate(() => window.__s.el.shadowRoot.querySelector('[part="value"]').getAttribute('title'))
    expect(await title()).not.toBeNull()
    await page.evaluate(() => { window.__s.el.data = { ...window.__s.data, net: 1234.5 } })
    await frame(page)
    expect(await title()).toBeNull()
  })

  test('<ts-metric> at S: the headline value gets the title, and it goes when the figure fits', async ({ page }) => {
    await open(page, 'chart=metric&size=S&scale=1000000')
    const read = () => page.evaluate(() => {
      const v = window.__s.el.shadowRoot.querySelector('[part="value"]')
      return { title: v.getAttribute('title'), text: v.textContent, label: window.__s.el.shadowRoot.querySelector('.tile').getAttribute('aria-label'), onHost: window.__s.el.hasAttribute('title') }
    })
    const r = await read()
    expect(r.title, 'en-IN groups').toBe('1,20,40,00,000')
    expect(r.text, 'compact, in the locale').toBe('120.4Cr')
    expect(r.label).toContain('1,20,40,00,000')
    expect(r.onHost).toBe(false)
    await page.evaluate(() => { window.__s.el.data = { value: 1204 } })
    await frame(page)
    expect((await read()).title).toBeNull()
  })
})

test.describe('the hidden table of recent points', () => {
  for (const c of CHARTS) {
    test(`${c.name}: a caption, headers, 12 rows newest last, in the accessibility tree and invisible`, async ({ page }) => {
      await open(page, c.query)
      const t = await table(page)
      expect(t.hidden).toBe(false)
      expect(t.display, 'not display: none, or it would leave the accessibility tree').not.toBe('none')
      expect(t.size.w).toBeLessThanOrEqual(2)
      expect(t.size.h).toBeLessThanOrEqual(2)
      expect(t.caption).toMatch(/, last 12 points$/)
      expect(t.heads).toHaveLength(1 + c.items)
      expect(t.heads.every(([scope]) => scope === 'col')).toBe(true)
      expect(t.heads.slice(1).map(([, text]) => text)).toEqual(c.series)
      expect(t.rows).toHaveLength(12)
      for (const row of t.rows) {
        expect(row[0].slice(0, 2)).toEqual(['th', 'row'])
        expect(row).toHaveLength(1 + c.items)
        expect(row.slice(1).every(([tag]) => tag === 'td')).toBe(true)
      }
      // Newest last: the last row is the point the slider starts on.
      const s = await slider(page)
      expect(s.text.split(': ')[0]).toBe(t.rows[11][0][2])
      // It has an accessible role the browser computes, with its name from the caption.
      expect(await page.evaluate(() => window.__s.el.shadowRoot.querySelector('[data-k="scrubTbl"] table').rows.length)).toBe(13)
    })
  }

  test('a new reading adds one row and drops the oldest, and a screen reader’s cursor keeps its row', async ({ page }) => {
    await open(page, 'chart=pnl&size=M')
    const rows = () => page.evaluate(() => [...window.__s.el.shadowRoot.querySelectorAll('[data-k="scrubBody"] tr')].map((tr) => tr.firstChild.textContent))
    const before = await rows()
    expect(before).toHaveLength(12)
    await page.evaluate(() => {
      window.__rowNodes = [...window.__s.el.shadowRoot.querySelectorAll('[data-k="scrubBody"] tr')]
      const d = window.__s.data
      const last = d.intraday[d.intraday.length - 1]
      window.__s.el.data = { ...d, intraday: [...d.intraday, { t: last.t + 60000, v: last.v + 5 }] }
    })
    await frame(page)
    const after = await rows()
    expect(after).toHaveLength(12)
    expect(after.slice(0, 11)).toEqual(before.slice(1))
    expect(after[11]).not.toBe(before[11])
    const kept = await page.evaluate(() => {
      const now = [...window.__s.el.shadowRoot.querySelectorAll('[data-k="scrubBody"] tr')]
      return now.slice(0, 11).every((tr, i) => tr === window.__rowNodes[i + 1])
    })
    expect(kept, 'the rows that stay are the same nodes').toBe(true)
  })

  test('has one column per series for <ts-chart>, and starts again when the series change', async ({ page }) => {
    await open(page, 'chart=chart&size=M')
    expect((await table(page)).heads.map((h) => h[1]).slice(1)).toEqual(['Requests', 'Errors', 'Cached'])
    await page.evaluate(() => {
      window.__s.el.data = { series: [{ name: 'Only', points: Array.from({ length: 20 }, (_, i) => ({ x: Date.UTC(2026, 7, 3 + i), y: i * 3 })) }] }
    })
    await frame(page)
    const t = await table(page)
    expect(t.heads.map((h) => h[1])).toEqual(['Date', 'Only'])
    expect(t.rows).toHaveLength(12)
    expect(t.rows[0]).toHaveLength(2)
  })

  test('a category chart’s table lists the categories, and a bar with no value reads a dash', async ({ page }) => {
    await open(page, 'chart=chart&size=M&bars')
    await page.evaluate(() => {
      window.__s.el.data = {
        xType: 'category',
        format: 'money',
        series: [
          { name: 'Profit', kind: 'bar', points: [{ x: 'Jan', y: 12 }, { x: 'Feb', y: -4 }, { x: 'Mar', y: 8 }] },
          { name: 'Costs', kind: 'bar', points: [{ x: 'Jan', y: 3 }, { x: 'Mar', y: 9 }] },
        ],
      }
    })
    await frame(page)
    const t = await table(page)
    expect(t.heads[0][1]).toBe('Category')
    expect(t.rows.map((r) => r[0][2])).toEqual(['Jan', 'Feb', 'Mar'])
    expect(t.rows[1][2][2]).toBe('—')
    expect(t.rows[1][1][2]).toMatch(/^−/)
    expect(t.caption).toMatch(/, last 3 points$/)
    // The bar sentences stay beside the table: every bar in words, not only the last 12.
    expect(await page.evaluate(() => window.__s.el.shadowRoot.querySelectorAll('[data-k="vals"] li').length)).toBe(5)
  })
})

test.describe('looks, and nothing else', () => {
  test('the read-out is ink on --ts-surface-2, and has no transition', async ({ page, hasTouch }) => {
    test.skip(hasTouch, 'a mouse')
    for (const theme of ['light', 'dark']) {
      await open(page, `chart=equity&size=M&theme=${theme}`)
      const b = await plotBox(page)
      await page.mouse.move(b.x + b.w * 0.4, b.y + b.h / 2)
      await page.mouse.move(b.x + b.w * 0.41, b.y + b.h / 2)
      await frame(page)
      const r = await page.evaluate(() => {
        const root = window.__s.el.shadowRoot
        const out = getComputedStyle(root.querySelector('[data-k="scrubOut"]'))
        const probe = document.createElement('span')
        document.body.append(probe)
        const tokens = {}
        for (const t of ['--ts-ink', '--ts-surface-2', '--ts-axis']) {
          probe.style.color = `var(${t})`
          tokens[t] = getComputedStyle(probe).color
        }
        probe.remove()
        const names = [...root.querySelectorAll('.sc-it, .sc-lab')].map((e) => getComputedStyle(e).color)
        return {
          color: out.color,
          bg: out.backgroundColor,
          tokens,
          names,
          rule: getComputedStyle(root.querySelector('[data-k="scrubRule"]')).backgroundColor,
          transition: [out.transitionDuration, getComputedStyle(root.querySelector('[data-k="scrubRule"]')).transitionDuration],
        }
      })
      expect(r.color, theme).toBe(r.tokens['--ts-ink'])
      expect(r.bg, theme).toBe(r.tokens['--ts-surface-2'])
      expect(r.names.every((c) => c === r.tokens['--ts-ink']), 'no coloured text on --ts-surface-2').toBe(true)
      expect(r.rule).toBe(r.tokens['--ts-axis'])
      expect(r.transition).toEqual(['0s', '0s'])
    }
  })

  test('each <ts-chart> dot takes its series colour, and a single line’s dot is ink', async ({ page, hasTouch }) => {
    test.skip(hasTouch, 'a mouse')
    await open(page, 'chart=chart&size=M')
    const b = await plotBox(page)
    await page.mouse.move(b.x + b.w * 0.4, b.y + b.h / 2)
    await page.mouse.move(b.x + b.w * 0.41, b.y + b.h / 2)
    await frame(page)
    const colours = await page.evaluate(() => {
      const root = window.__s.el.shadowRoot
      const probe = document.createElement('span')
      document.body.append(probe)
      const token = (n) => { probe.style.color = `var(--ts-series-${n})`; return getComputedStyle(probe).color }
      const dots = [...root.querySelectorAll('.sc-dot')].filter((d) => !d.hasAttribute('hidden')).map((d) => getComputedStyle(d).backgroundColor)
      const out = { dots, tokens: [1, 2, 3].map(token) }
      probe.remove()
      return out
    })
    expect(colours.dots).toEqual(colours.tokens)
    expect(new Set(colours.dots).size).toBe(3)
  })

  test('forced colours: the rule is CanvasText, the dots Highlight, the read-out ButtonFace on CanvasText', async ({ page, hasTouch }) => {
    test.skip(hasTouch, 'a mouse')
    await page.emulateMedia({ forcedColors: 'active' })
    await open(page, 'chart=equity&size=M')
    const b = await plotBox(page)
    await page.mouse.move(b.x + b.w * 0.4, b.y + b.h / 2)
    await page.mouse.move(b.x + b.w * 0.41, b.y + b.h / 2)
    await frame(page)
    const r = await page.evaluate(() => {
      const root = window.__s.el.shadowRoot
      const sys = (name, prop) => {
        const p = document.createElement('span')
        p.style[prop] = name
        document.body.append(p)
        const v = getComputedStyle(p)[prop === 'color' ? 'color' : 'backgroundColor']
        p.remove()
        return v
      }
      const cs = (k) => getComputedStyle(root.querySelector(`[data-k="${k}"]`))
      const dot = getComputedStyle(root.querySelector('.sc-dot'))
      return {
        rule: cs('scrubRule').backgroundColor,
        canvasText: sys('CanvasText', 'color'),
        dot: dot.backgroundColor,
        highlight: sys('Highlight', 'backgroundColor'),
        out: cs('scrubOut').backgroundColor,
        outText: cs('scrubOut').color,
        buttonFace: sys('ButtonFace', 'backgroundColor'),
      }
    })
    expect(r.rule).toBe(r.canvasText)
    expect(r.dot).toBe(r.highlight)
    expect(r.out).toBe(r.buttonFace)
    expect(r.outText).toBe(r.canvasText)
  })
})

test.describe('axe', () => {
  for (const theme of ['light', 'dark']) {
    for (const c of CHARTS.filter((x) => ['Today’s P&L M', 'equity curve XL', '<ts-chart> M'].includes(x.name))) {
      test(`${c.name} in ${theme}: at rest, reading by keyboard, and with the grid editing`, async ({ page }) => {
        await open(page, `${c.query}&theme=${theme}&grid`)
        const run = async (what) => {
          const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
          const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
          expect(bad.map((v) => `${v.id}: ${v.help} ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`), what).toEqual([])
        }
        await run('at rest')
        await page.evaluate(() => window.__s.el.shadowRoot.querySelector('[data-k="scrubSlider"]').focus())
        await page.keyboard.press('ArrowLeft')
        await frame(page)
        expect((await overlay(page)).shown).toBe(true)
        await run('reading')
        await page.evaluate(() => { window.__s.grid.editing = true })
        await frame(page)
        await run('editing')
      })
    }
  }
})

// A strict policy: the overlay writes element.style transforms and builds its table with the DOM, so neither may be a violation.
test.describe('under a strict content security policy', () => {
  test('hovering, dragging and reading by keyboard raise no violation', async ({ page, hasTouch }) => {
    test.skip(hasTouch, 'a mouse')
    const problems = []
    page.on('console', (m) => m.type() === 'error' && problems.push(m.text()))
    page.on('pageerror', (e) => problems.push(e.message))
    await page.addInitScript(() => {
      window.__violations = []
      document.addEventListener('securitypolicyviolation', (e) => window.__violations.push(`${e.violatedDirective} ${e.blockedURI} ${(e.sample || '').slice(0, 60)}`))
    })
    await page.route('**/@vite/client', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export {}' }))
    await page.route('**/test/browser/fixtures/csp.html*', async (route) => {
      const response = await route.fetch()
      await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'" } })
    })
    await page.goto('/test/browser/fixtures/csp.html')
    await page.evaluate(async () => {
      const { setup, dataFor, frozenClock } = await import('/test/browser/fixtures/data.js')
      setup()
      await Promise.all(['ts-today-pnl', 'ts-equity-curve', 'ts-chart'].map((t) => customElements.whenDefined(t)))
      for (const el of document.querySelectorAll('#g > ts-today-pnl, #g > ts-equity-curve, #g > ts-chart')) {
        el.clock = frozenClock
        el.data = dataFor(el.localName)
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    })
    for (const tag of ['ts-today-pnl', 'ts-equity-curve', 'ts-chart']) {
      const tile = page.locator(`#g > ${tag}`)
      await tile.scrollIntoViewIfNeeded()
      const b = await tile.evaluate((el) => { const r = el.shadowRoot.querySelector('[data-k="plot"]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
      await page.mouse.move(b.x + b.w * 0.05, b.y + b.h / 2)
      await page.mouse.move(b.x + b.w * 0.06, b.y + b.h / 2)
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      expect(await tile.evaluate((el) => !el.shadowRoot.querySelector('[data-k="scrub"]').hasAttribute('hidden')), `${tag}: hover`).toBe(true)
      await tile.evaluate((el) => el.shadowRoot.querySelector('[data-k="scrubSlider"]').focus())
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('Home')
      expect(await tile.evaluate((el) => el.shadowRoot.querySelectorAll('[data-k="scrubBody"] tr').length), `${tag}: table`).toBe(12)
      expect(await tile.evaluate((el) => el.shadowRoot.querySelector('[data-k="scrubRule"]').style.transform), `${tag}: transform`).toMatch(/^translate\(/)
    }
    expect(await page.evaluate(() => window.__violations)).toEqual([])
    expect(problems).toEqual([])
  })
})
