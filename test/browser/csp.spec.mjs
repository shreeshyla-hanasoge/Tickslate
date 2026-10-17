// Strict CSP (RFC 0003 §14): every widget and the grid render, styled and
// editable, on a page served with
//   Content-Security-Policy: default-src 'self'; style-src 'self'; script-src 'self'
// A violation fails the spec: securitypolicyviolation events are collected from
// before the page's own scripts run, and the console is watched as well.
//
// The headers are added to the fixture's response here, so the dev server needs
// no configuration. The page has no inline script or style, so it gets its data
// from page.evaluate, which the policy doesn't govern (the library's own code is
// what is under test).
import { test, expect } from '@playwright/test'

const PAGE = '/test/browser/fixtures/csp.html'
const STRICT = "default-src 'self'; style-src 'self'; script-src 'self'"

let violations
let errors

test.beforeEach(async ({ page }) => {
  violations = []
  errors = []
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (error) => errors.push(error.message))
  // CDP-injected, so the page's policy doesn't stop the collector itself.
  await page.addInitScript(() => {
    window.__violations = []
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__violations.push(`${e.violatedDirective} ${e.blockedURI} ${(e.sample || '').slice(0, 60)}`)
    })
  })
})

test.afterEach(async ({ page }) => {
  violations = await page.evaluate(() => window.__violations).catch(() => [])
  expect(violations).toEqual([])
  expect(errors).toEqual([])
})

/** Serves the fixture with `csp` as its policy. */
async function serve(page, csp) {
  // Vite's hot-reload client opens a WebSocket the strict policy has no reason to allow, and a spec has no use for.
  await page.route('**/@vite/client', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export {}' }))
  await page.route('**/test/browser/fixtures/csp.html*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } })
  })
}

// The page's scripts are external, so what runs in it is the library and this
// function (evaluated through the protocol).
const BOOT = async () => {
  const { setup, dataFor, frozenClock } = await import('/test/browser/fixtures/data.js')
  setup()
  const tags = ['ts-grid', 'ts-metric', 'ts-chart', 'ts-table', 'ts-watchlist', 'ts-open-positions', 'ts-today-pnl', 'ts-equity-curve', 'ts-session-clock', 'ts-card', 'ts-grid-controls', 'ts-widget-picker']
  await Promise.all(tags.map((tag) => customElements.whenDefined(tag)))
  const tiles = [...document.querySelectorAll('#g > *, #linked, #small')]
  for (const el of tiles) {
    el.clock = frozenClock
    if (el.localName !== 'ts-card') el.data = dataFor(el.localName)
  }
  // The chart draws its selectable points with the DOM when it may select.
  document.querySelector('ts-chart').actions = ['select']
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  await frame()
  return tiles.length
}

async function boot(page) {
  await page.goto(PAGE)
  const count = await page.evaluate(BOOT)
  expect(count).toBe(11)
}

// What "styled" means: the shared CSS reached the shadow root. Unstyled, the
// tile is a plain block and the grid an inline element.
const STYLED = () => {
  const tiles = [...document.querySelectorAll('#g > *, #linked, #small')]
  const widgets = tiles.map((el) => {
    const tile = el.shadowRoot.querySelector('.tile')
    const cs = getComputedStyle(tile)
    return { tag: el.localName, display: cs.display, pad: cs.paddingTop, radius: cs.borderTopLeftRadius, rendered: tile.getBoundingClientRect().height > 20 }
  })
  const grid = document.getElementById('g')
  const board = grid.shadowRoot.querySelector('.board')
  return {
    widgets,
    grid: getComputedStyle(grid).display,
    board: getComputedStyle(board).position,
    controls: getComputedStyle(document.getElementById('c')).display,
    picker: getComputedStyle(document.getElementById('p')).display,
  }
}

test.describe('under default-src, style-src and script-src self', () => {
  // The fixture has no inline script and no network use, so default-src 'none' with the three it needs is as strict.
  test('and under default-src none with only script, style and connect and img allowed from self', async ({ page }) => {
    await serve(page, "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'")
    await boot(page)
    const styled = await page.evaluate(STYLED)
    for (const w of styled.widgets) expect(w.display, w.tag).toBe('flex')
    expect(styled.grid).toBe('block')
  })

  test('every widget and the grid render, styled', async ({ page }) => {
    await serve(page, STRICT)
    await boot(page)
    const styled = await page.evaluate(STYLED)
    for (const w of styled.widgets) {
      expect(w.display, `${w.tag} is a flex column`).toBe('flex')
      expect(w.pad, w.tag).not.toBe('0px')
      expect(w.radius, w.tag).not.toBe('0px')
      expect(w.rendered, `${w.tag} drew`).toBe(true)
    }
    expect(styled.grid).toBe('block')
    expect(styled.board).toBe('relative')
    expect(styled.controls).toBe('block')
    expect(styled.picker).toBe('contents')
  })

  test('the CSS is adopted, one constructed sheet per class, with no <style> element in a root', async ({ page }) => {
    await serve(page, STRICT)
    await boot(page)
    const roots = await page.evaluate(() => {
      const all = [...document.querySelectorAll('#g > *, #linked, #small, #g, #c, #p')]
      return all.map((el) => ({ tag: el.localName, sheets: el.shadowRoot.adoptedStyleSheets.length, styles: el.shadowRoot.querySelectorAll('style').length }))
    })
    for (const r of roots) {
      expect(r.sheets, r.tag).toBeGreaterThan(0)
      expect(r.styles, `${r.tag} has no <style>`).toBe(0)
    }
    // Two metrics (one in the grid, one outside) share one sheet object.
    const same = await page.evaluate(() => {
      const metrics = [...document.querySelectorAll('ts-metric')].map((m) => m.shadowRoot.adoptedStyleSheets[0])
      return metrics.length > 1 && metrics.every((s) => s === metrics[0])
    })
    expect(same).toBe(true)
  })

  test('no style attribute is written by markup', async ({ page }) => {
    await serve(page, STRICT)
    await boot(page)
    // The CSSOM serialises element.style into the attribute, which style-src allows; what must be absent is markup that
    // carried one, and the violation collector would have caught that. This counts the elements the library places.
    const placed = await page.evaluate(() => {
      const clock = document.getElementById('g').querySelector('ts-session-clock')
      const ticks = [...clock.shadowRoot.querySelectorAll('.tk')]
      const points = [...document.querySelector('ts-chart').shadowRoot.querySelectorAll('[data-k="pts"] li')]
      return {
        ticks: ticks.length,
        ticksPlaced: ticks.every((t) => t.style.getPropertyValue('inset-inline-start') !== ''),
        points: points.length,
        pointsPlaced: points.every((p) => p.style.getPropertyValue('inset-inline-start') !== '' && p.style.getPropertyValue('inset-block-start') !== ''),
      }
    })
    expect(placed.ticks).toBeGreaterThan(0)
    expect(placed.ticksPlaced).toBe(true)
    expect(placed.points).toBeGreaterThan(0)
    expect(placed.pointsPlaced).toBe(true)
  })

  test('the grid edits: chrome appears, the picker opens, a tile is removed and every state draws', async ({ page }) => {
    await serve(page, STRICT)
    await boot(page)
    const out = await page.evaluate(async () => {
      const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const g = document.getElementById('g')
      g.editing = true
      await frame()
      const handles = g.shadowRoot.querySelectorAll('.chrome .handle').length
      const reasons = []
      g.addEventListener('ts-layout-change', (e) => reasons.push(e.detail.reason))
      g.remove('notes')
      for (let i = 0; i < 60 && !reasons.includes('remove'); i++) await frame()
      document.getElementById('p').show()
      await frame()
      const open = document.getElementById('p').shadowRoot.querySelector('dialog').open
      document.getElementById('p').hide?.()
      g.editing = false

      // The loading, empty and error views are constant markup too.
      const m = document.getElementById('linked')
      const views = []
      m.data = undefined
      m.state = 'loading'
      await frame()
      views.push(!!m.shadowRoot.querySelector('.skel'))
      m.state = null
      m.data = null
      await frame()
      views.push(!!m.shadowRoot.querySelector('.empty'))
      m.actions = ['retry']
      m.error = 'Could not load'
      await frame()
      views.push(!!m.shadowRoot.querySelector('.err'))
      return { handles, reasons, open, views }
    })
    expect(out.handles).toBeGreaterThan(0)
    expect(out.reasons).toContain('remove')
    expect(out.open).toBe(true)
    expect(out.views).toEqual([true, true, true])
  })

  test('a tile with an href gets a real link, built with the DOM', async ({ page }) => {
    await serve(page, STRICT)
    await boot(page)
    const link = await page.evaluate(() => {
      const a = document.getElementById('linked').shadowRoot.querySelector('[part~="link"]')
      return a && { tag: a.localName, href: a.getAttribute('href'), text: a.textContent }
    })
    expect(link.tag).toBe('a')
    expect(link.href).toBe('/reports/sales')
    expect(link.text.length).toBeGreaterThan(0)
  })

  test('a label that looks like markup stays text', async ({ page }) => {
    await serve(page, STRICT)
    await boot(page)
    const text = await page.evaluate(async () => {
      const m = document.getElementById('linked')
      m.setAttribute('label', '<img src=x onerror=alert(1)>')
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const a = m.shadowRoot.querySelector('[part~="link"]')
      return { text: a.textContent, imgs: m.shadowRoot.querySelectorAll('img').length }
    })
    expect(text.text).toBe('<img src=x onerror=alert(1)>')
    expect(text.imgs).toBe(0)
  })
})

// Below Safari 16.4 there are no constructable sheets and a <style> element is
// the fallback; a strict style-src accepts it only with the page's nonce, which
// configure({ styleNonce }) supplies. The missing API is simulated by removing it
// before the library loads.
test.describe('where constructable sheets are missing', () => {
  const NO_SHEETS = () => {
    delete CSSStyleSheet.prototype.replaceSync
  }

  test('a <style> without the nonce is blocked, which is why the nonce option exists', async ({ page }) => {
    await page.addInitScript(NO_SHEETS)
    await serve(page, STRICT)
    await page.goto(PAGE)
    await page.waitForFunction(() => customElements.get('ts-metric') && document.querySelector('ts-metric').shadowRoot.querySelector('style'))
    const blocked = await page.evaluate(() => window.__violations.filter((v) => v.startsWith('style-src')).length)
    expect(blocked).toBeGreaterThan(0)
    // Cleared: this blocked <style> is the point of the spec, and the collectors would fail the afterEach.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    await page.evaluate(() => { window.__violations = [] })
    errors.length = 0
  })

  test('with configure({ styleNonce }) and the same nonce in the policy, the fallback styles every widget', async ({ page }) => {
    await page.addInitScript(NO_SHEETS)
    await serve(page, `default-src 'self'; style-src 'self' 'nonce-tickslate-test'; script-src 'self'`)
    await page.goto(PAGE)
    await page.waitForFunction(() => customElements.get('ts-grid') && customElements.get('ts-metric'))
    // Whatever the page built before the nonce was set was blocked (the previous spec); the elements below are made after it,
    // so the collectors start again here.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    await page.evaluate(() => { window.__violations = [] })
    errors.length = 0
    await page.evaluate(async () => {
      const { configure } = await import('/src/core/index.js')
      configure({ styleNonce: 'tickslate-test' })
      const { setup, dataFor, frozenClock } = await import('/test/browser/fixtures/data.js')
      setup()
      const stage = document.getElementById('stage')
      for (const tag of ['ts-metric', 'ts-chart', 'ts-table', 'ts-watchlist', 'ts-open-positions', 'ts-today-pnl', 'ts-equity-curve', 'ts-session-clock', 'ts-card']) {
        const el = document.createElement(tag)
        el.className = 'fresh'
        el.setAttribute('label', tag)
        stage.append(el)
        el.clock = frozenClock
        if (tag !== 'ts-card') el.data = dataFor(tag)
      }
      const grid = document.createElement('ts-grid')
      grid.id = 'fresh-grid'
      stage.append(grid)
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    })
    const styled = await page.evaluate(() => {
      const roots = [...document.querySelectorAll('.fresh')].map((el) => {
        const tile = el.shadowRoot.querySelector('.tile')
        return { tag: el.localName, display: getComputedStyle(tile).display, nonce: el.shadowRoot.querySelector('style').nonce || el.shadowRoot.querySelector('style').getAttribute('nonce') }
      })
      return { roots, grid: getComputedStyle(document.getElementById('fresh-grid')).display }
    })
    for (const r of styled.roots) {
      expect(r.display, `${r.tag} is styled by its nonce'd <style>`).toBe('flex')
      expect(r.nonce).toBeTruthy()
    }
    expect(styled.grid).toBe('block')
  })
})

test('a nonce configured after the elements are defined styles the fallback <style> they already made', async ({ page }) => {
  await page.addInitScript(() => { delete CSSStyleSheet.prototype.replaceSync })
  await serve(page, `default-src 'self'; style-src 'self' 'nonce-late-nonce'; script-src 'self'`)
  await page.goto(PAGE)
  await page.waitForFunction(() => customElements.get('ts-metric') && document.querySelector('ts-metric').shadowRoot.querySelector('style'))
  const before = await page.evaluate(() => getComputedStyle(document.getElementById('linked').shadowRoot.querySelector('.tile')).display)
  expect(before).not.toBe('flex')
  await page.evaluate(async () => {
    const { configure } = await import('/src/core/index.js')
    configure({ styleNonce: 'late-nonce' })
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  const after = await page.evaluate(() => getComputedStyle(document.getElementById('linked').shadowRoot.querySelector('.tile')).display)
  expect(after).toBe('flex')
  // The first, blocked attempt is expected; nothing after the nonce arrived is.
  await page.evaluate(() => { window.__violations = [] })
  errors.length = 0
})
