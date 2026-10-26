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
  const tags = ['ts-grid', 'ts-metric', 'ts-chart', 'ts-table', 'ts-watchlist', 'ts-open-positions', 'ts-today-pnl', 'ts-equity-curve', 'ts-session-clock', 'ts-card', 'ts-breakdown', 'ts-status', 'ts-feed', 'ts-grid-controls', 'ts-widget-picker']
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
  expect(await page.evaluate(BOOT)).toBe(14)
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

// Scrubbing (RFC 0004 §1) under the same policy: hover each chart so the overlay moves and reads, press a key on its
// slider, and read the hidden table. The overlay writes transforms and text only, so no violation may follow.
async function scrubEverything(page) {
  const frame = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const seen = {}
  for (const tag of ['ts-chart', 'ts-today-pnl', 'ts-equity-curve']) {
    // The same events a mouse sends, for every engine; the tile may be below the fold, so they carry its own coordinates.
    const hovered = await page.evaluate((tag) => {
      const el = document.querySelector(`#g > ${tag}`)
      const root = el.shadowRoot
      const plot = root.querySelector('[data-k="plot"]')
      const b = plot.getBoundingClientRect()
      for (const f of [0.3, 0.32]) {
        plot.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', clientX: b.left + b.width * f, clientY: b.top + b.height / 2, bubbles: true, composed: true }))
      }
      return true
    }, tag)
    expect(hovered).toBe(true)
    await frame()
    seen[tag] = await page.evaluate((tag) => {
      const root = document.querySelector(`#g > ${tag}`).shadowRoot
      const box = root.querySelector('[data-k="scrub"]')
      return { overlay: !box.hasAttribute('hidden'), label: root.querySelector('[data-k="scrubLab"]').textContent }
    }, tag)
    expect(seen[tag].overlay, `${tag} shows a read-out under the policy`).toBe(true)
    expect(seen[tag].label, tag).not.toBe('')
    await page.evaluate((tag) => {
      document.querySelector(`#g > ${tag}`).shadowRoot.querySelector('[data-k="scrubSlider"]').focus()
    }, tag)
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('Home')
    await frame()
    const read = await page.evaluate((tag) => {
      const root = document.querySelector(`#g > ${tag}`).shadowRoot
      const s = root.querySelector('[data-k="scrubSlider"]')
      return { now: s.getAttribute('aria-valuenow'), text: s.getAttribute('aria-valuetext'), rows: root.querySelectorAll('[data-k="scrubBody"] tr').length }
    }, tag)
    expect(read.now, `${tag}: Home reads the first point`).toBe('0')
    expect(read.text, tag).toBeTruthy()
    expect(read.rows, `${tag}: the table lists the recent points`).toBeGreaterThan(1)
  }
}

// The whole edit path, driven the way a person does: keyboard move, pointer drag, remove, Undo, Add back from the
// picker's list and an add the host answers. Every step runs under the page's policy, and afterEach fails on a violation.
async function editEverything(page) {
  const frame = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const touch = test.info().project.use.hasTouch
  const press = (locator) => (touch ? locator.tap() : locator.click())
  const handle = (id) => page.locator(`#g >> .chrome[data-id="${id}"] .handle`)
  const reasons = () => page.evaluate(() => window.__reasons)
  await page.evaluate(() => {
    const g = document.getElementById('g')
    window.__reasons = []
    g.addTypes = '*'
    g.addEventListener('ts-layout-change', (e) => window.__reasons.push(e.detail.reason))
    // What a framework does with the request: render the child it names.
    g.addEventListener('ts-add-request', (e) => {
      e.preventDefault()
      const el = document.createElement(`ts-${e.detail.type}`)
      el.setAttribute('item', e.detail.id)
      el.setAttribute('label', `New ${e.detail.type}`)
      g.append(el)
    })
    g.editing = true
  })
  await frame()

  // Keyboard: pick up, step, drop.
  await handle('notes').focus()
  await page.keyboard.press('Enter')
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowLeft']) await page.keyboard.press(key)
  await page.keyboard.press('Enter')
  await expect.poll(reasons).toContain('move')

  // A pointer drag, where there is a mouse: the tile is lifted (the grid is dragging) and dropped on another.
  if (!touch) {
    const centre = async (id) => {
      const box = await page.locator(`#g > [item="${id}"]`).boundingBox()
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    }
    // The keyboard move scrolled to the tile it moved; the tiles to drag must be on screen.
    await page.evaluate(() => window.scrollTo(0, 0))
    await frame()
    const order = await page.evaluate(() => document.getElementById('g').readingOrder)
    const from = await centre(order[0])
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.waitForTimeout(650)
    const to = await centre(order[3])
    await page.mouse.move(to.x, to.y, { steps: 12 })
    await expect.poll(() => page.evaluate(() => document.getElementById('g').hasAttribute('dragging'))).toBe(true)
    await page.waitForTimeout(300)
    await page.mouse.up()
    await expect.poll(() => page.evaluate(() => document.getElementById('g').hasAttribute('dragging'))).toBe(false)
  }

  // Remove, then Undo from the toast, then remove again and bring it back from the picker's Add back row.
  await press(page.locator('#g >> .chrome[data-id="notes"] .remove'))
  await expect.poll(reasons).toContain('remove')
  await press(page.locator('#g >> .toast .undo'))
  await expect.poll(reasons).toContain('undo')
  // The grid ignores a second remove for a moment, so a double click is not two.
  await page.waitForTimeout(600)
  await press(page.locator('#g >> .chrome[data-id="notes"] .remove'))
  await expect.poll(() => page.evaluate(() => document.getElementById('g').hiddenItems.length)).toBe(1)
  await page.evaluate(() => document.getElementById('p').show())
  await frame()
  await press(page.locator('ts-widget-picker .chip[aria-label^="Add back"]'))
  await expect.poll(() => page.evaluate(() => document.getElementById('g').hiddenItems.length)).toBe(0)

  // A picker add: the request goes to the host, which renders the child.
  await page.evaluate(() => document.getElementById('p').show())
  await frame()
  await page.locator('ts-widget-picker .search').fill('metric')
  await press(page.locator('ts-widget-picker .row .chip', { hasText: 'Small' }).first())
  await expect.poll(reasons).toContain('add')
  await expect(page.locator('#g > ts-metric')).toHaveCount(2)
  await frame()
  return reasons()
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
    const seen = await page.evaluate(() => ({ supported: !!window.trustedTypes, policies: window.__policies, def: window.trustedTypes ? trustedTypes.defaultPolicy : null }))
    // Without Trusted Types there is no policy to count; the other specs still run the flow there.
    test.skip(!seen.supported, 'this engine has no Trusted Types')
    expect(seen.policies).toEqual(['tickslate'])
    expect(seen.def).toBeNull()
  })

  test('the policy is not reachable: no global, registered symbol or property mints TrustedHTML', async ({ page }) => {
    await serve(page, TT)
    await boot(page)
    const probe = await page.evaluate(() => {
      if (!window.trustedTypes) return { supported: false }
      const found = []
      const isPolicy = (v) => v && (typeof v === 'object' || typeof v === 'function') && typeof v.createHTML === 'function'
      const keys = [...Object.getOwnPropertyNames(window), ...Object.getOwnPropertySymbols(window), Symbol.for('tickslate.trustedTypes'), Symbol.for('tickslate')]
      for (const k of keys) {
        let v
        try { v = window[k] } catch { continue }
        if (k === 'trustedTypes') continue
        if (isPolicy(v)) found.push(String(k))
        // One level in, for a namespace object such as window.tickslate.
        else if (v && typeof v === 'object' && !(v instanceof Node) && !(v instanceof Window)) {
          for (const j of Object.getOwnPropertyNames(v).slice(0, 200)) {
            try { if (isPolicy(v[j])) found.push(`${String(k)}.${j}`) } catch { /* a getter that throws */ }
          }
        }
      }
      let minted = false
      try {
        document.createElement('div').innerHTML = '<img src=x onerror=1>'
        minted = true
      } catch { /* refused, as it must be */ }
      return { supported: true, found, minted, def: trustedTypes.defaultPolicy }
    })
    test.skip(!probe.supported, 'this engine has no Trusted Types')
    expect(probe.found).toEqual([])
    expect(probe.minted).toBe(false)
    expect(probe.def).toBeNull()
    await page.evaluate(() => { window.__violations = [] })
    errors.length = 0
  })

  for (const list of ['trusted-types other', "trusted-types 'none'"]) {
    test(`with ${list} nothing renders, nothing throws, and development says why once`, async ({ page }) => {
      await serve(page, `require-trusted-types-for 'script'; ${list}`)
      const warnings = []
      const thrown = []
      page.on('console', (msg) => msg.type() === 'warning' && warnings.push(msg.text()))
      page.on('pageerror', (error) => thrown.push(error.message))
      await page.goto(PAGE)
      await page.waitForFunction(() => customElements.get('ts-metric') && customElements.get('ts-grid') && customElements.get('ts-widget-picker'))
      await page.waitForTimeout(300)
      expect(warnings.filter((w) => /does not allow the 'tickslate' policy/.test(w))).toHaveLength(1)
      // Tickslate wrote nothing: the only violations are the browser refusing createPolicy itself, never a markup sink.
      const v = await page.evaluate(() => window.__violations)
      expect(v.filter((x) => /sink/.test(x))).toEqual([])
      // No constructor threw, and the host's own code can still make the elements and use their API.
      expect(thrown).toEqual([])
      const out = await page.evaluate(() => {
        const g = document.createElement('ts-grid')
        const c = document.createElement('ts-grid-controls')
        const p = document.createElement('ts-widget-picker')
        const m = document.createElement('ts-metric')
        document.body.append(g, c, p, m)
        g.editing = true
        g.layout = { items: [] }
        p.show()
        m.data = { value: 1 }
        const grid = document.getElementById('g')
        return {
          made: [g, c, p, m].map((el) => el.localName),
          created: !!window.__ready,
          boardPresent: !!grid.shadowRoot.querySelector('.board'),
          tileKids: document.getElementById('linked').shadowRoot.querySelector('.tile').children.length,
        }
      })
      expect(out.made).toEqual(['ts-grid', 'ts-grid-controls', 'ts-widget-picker', 'ts-metric'])
      expect(out.boardPresent).toBe(false)
      expect(out.tileKids).toBe(0)
      // The widgets neither log "could not render its data" nor throw: they draw nothing.
      expect(errors.filter((e) => /could not render/.test(e))).toEqual([])
      expect(thrown).toEqual([])
      // What remains is the browser's own report of the refused policy, which is the point of this spec.
      expect(errors.filter((e) => !/trusted ?type|trusted-types/i.test(e))).toEqual([])
      await page.evaluate(() => { window.__violations = [] })
      errors.length = 0
    })
  }

  test('the edit path (keyboard move, pointer drag, remove, Undo, Add back and a picker add) draws no violation', async ({ page }) => {
    await serve(page, ALL)
    await boot(page)
    const reasons = await editEverything(page)
    for (const reason of ['move', 'remove', 'undo', 'add']) expect(reasons).toContain(reason)
  })

  test('the charts scrub, and their tables read, with Trusted Types enforced', async ({ page }) => {
    await serve(page, TT)
    await boot(page)
    await scrubEverything(page)
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
      // Later renders wait while a tile is far off-screen (perf-hygiene), as on a phone, so bring it into view first.
      m.scrollIntoView()
      await frame()
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
      const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      // Later renders wait while a tile is far off-screen (perf-hygiene), as on a phone, so bring it into view first.
      m.scrollIntoView()
      await frame()
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
    await scrubEverything(page)
    const r = await page.evaluate(RENDERED)
    for (const t of r.tiles) expect(t.drew, `${t.tag} drew`).toBe(true)
    const styled = await page.evaluate(() => getComputedStyle(document.getElementById('linked').shadowRoot.querySelector('.tile')).display)
    expect(styled).toBe('flex')
  })
})
