// Trusted Types (RFC 0003 §14): with
//   Content-Security-Policy: require-trusted-types-for 'script'; trusted-types tickslate
// every element constructs, renders and edits. Only the policy named `tickslate`
// may exist (so there is no default policy), and a string that is not a module
// constant never reaches an HTML sink. A violation fails the spec.
//
// Engines that don't implement Trusted Types still run the flow, so the library
// is exercised there too; the enforcement checks need window.trustedTypes.
import { test, expect } from '@playwright/test'

const PAGE = '/test/browser/fixtures/csp.html'
const TT = "require-trusted-types-for 'script'; trusted-types tickslate"
const ALL = `default-src 'self'; style-src 'self'; script-src 'self'; ${TT}`

let errors

test.beforeEach(async ({ page }) => {
  errors = []
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    window.__violations = []
    window.__policies = []
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__violations.push(`${e.violatedDirective} ${e.blockedURI} ${(e.sample || '').slice(0, 60)}`)
    })
    // Which policies the page creates, in order, so a stray or default policy shows.
    if (window.trustedTypes && trustedTypes.createPolicy) {
      const create = trustedTypes.createPolicy.bind(trustedTypes)
      trustedTypes.createPolicy = (name, rules) => {
        window.__policies.push(name)
        return create(name, rules)
      }
    }
  })
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.__violations).catch(() => [])).toEqual([])
  expect(errors).toEqual([])
})

async function serve(page, csp) {
  // Vite's hot-reload client opens a WebSocket the strict policy has no reason to allow, and a spec has no use for.
  await page.route('**/@vite/client', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export {}' }))
  await page.route('**/test/browser/fixtures/csp.html*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } })
  })
}

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
  document.querySelector('ts-chart').actions = ['select']
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  return tiles.length
}

async function boot(page) {
  await page.goto(PAGE)
  expect(await page.evaluate(BOOT)).toBe(11)
}

// Every tile drew its tile element and the grid its board: markup reached the DOM through the policy.
const RENDERED = () => {
  const tiles = [...document.querySelectorAll('#g > *, #linked, #small')]
  return {
    tiles: tiles.map((el) => ({ tag: el.localName, drew: !!el.shadowRoot.querySelector('.tile') && el.shadowRoot.querySelector('.tile').children.length > 0 })),
    board: !!document.getElementById('g').shadowRoot.querySelector('.board'),
    picker: !!document.getElementById('p').shadowRoot.querySelector('dialog'),
    controls: !!document.getElementById('c').shadowRoot.querySelector('.switcher'),
  }
}

test.describe('under require-trusted-types-for and trusted-types tickslate', () => {
  test('enforcement is real where the engine has it: a plain string is refused at a sink', async ({ page }) => {
    await serve(page, TT)
    await page.goto(PAGE)
    const result = await page.evaluate(() => {
      if (!window.trustedTypes) return 'unsupported'
      try {
        document.createElement('div').innerHTML = '<b>x</b>'
        return 'allowed'
      } catch {
        return 'refused'
      }
    })
    test.skip(result === 'unsupported', 'this engine has no Trusted Types, so there is nothing to enforce')
    expect(result).toBe('refused')
    // The refusal of this canary is a violation by design; it is not the library's.
    await page.evaluate(() => { window.__violations = [] })
    errors.length = 0
  })

  test('every element constructs, renders and its content is in the DOM', async ({ page }) => {
    await serve(page, TT)
    await boot(page)
    const r = await page.evaluate(RENDERED)
    for (const t of r.tiles) expect(t.drew, `${t.tag} drew`).toBe(true)
    expect(r.board).toBe(true)
    expect(r.picker).toBe(true)
    expect(r.controls).toBe(true)
  })

  test('the only policy is tickslate, and there is no default policy', async ({ page }) => {
    await serve(page, TT)
    await boot(page)
    const seen = await page.evaluate(() => ({ policies: window.__policies, def: window.trustedTypes ? trustedTypes.defaultPolicy : null }))
    if (seen.def !== null) throw new Error('a default policy exists')
    expect([...new Set(seen.policies)]).toEqual(seen.policies.length ? ['tickslate'] : [])
    expect(seen.policies.length).toBeLessThanOrEqual(1)
  })

  test('the grid edits and every view of a tile draws', async ({ page }) => {
    await serve(page, TT)
    await boot(page)
    const out = await page.evaluate(async () => {
      const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const g = document.getElementById('g')
      g.editing = true
      await frame()
      const handles = g.shadowRoot.querySelectorAll('.chrome .handle').length
      g.remove('notes')
      await frame()
      document.getElementById('p').show()
      await frame()
      const open = document.getElementById('p').shadowRoot.querySelector('dialog').open
      g.editing = false
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
      return { handles, open, views }
    })
    expect(out.handles).toBeGreaterThan(0)
    expect(out.open).toBe(true)
    expect(out.views).toEqual([true, true, true])
  })

  test('the heading link, the chart points and the session ticks are built, not parsed', async ({ page }) => {
    await serve(page, TT)
    await boot(page)
    const built = await page.evaluate(() => ({
      link: document.getElementById('linked').shadowRoot.querySelector('a[part~="link"]')?.getAttribute('href'),
      points: document.querySelectorAll('ts-chart')[0].shadowRoot.querySelectorAll('[data-k="pts"] button.pt').length,
      ticks: document.querySelector('#g ts-session-clock').shadowRoot.querySelectorAll('.tk').length,
    }))
    expect(built.link).toBe('/reports/sales')
    expect(built.points).toBeGreaterThan(0)
    expect(built.ticks).toBeGreaterThan(0)
  })

  test('data that looks like markup never reaches a sink', async ({ page }) => {
    await serve(page, TT)
    await boot(page)
    const probe = await page.evaluate(async () => {
      const m = document.getElementById('linked')
      m.setAttribute('label', '<img src=x onerror=alert(1)>')
      m.error = '<svg onload=alert(1)>'
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      return { imgs: m.shadowRoot.querySelectorAll('img, svg[onload]').length, msg: m.shadowRoot.querySelector('[data-k="message"]')?.textContent }
    })
    expect(probe.imgs).toBe(0)
    expect(probe.msg).toBe('<svg onload=alert(1)>')
  })

  test('together with the strict style and script policy, nothing is violated', async ({ page }) => {
    await serve(page, ALL)
    await boot(page)
    const r = await page.evaluate(RENDERED)
    for (const t of r.tiles) expect(t.drew, `${t.tag} drew`).toBe(true)
    const styled = await page.evaluate(() => getComputedStyle(document.getElementById('linked').shadowRoot.querySelector('.tile')).display)
    expect(styled).toBe('flex')
  })
})
