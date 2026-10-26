// Hostile strings are inert (RFC 0004 §8.3). One payload at a time goes into every string a host can supply: each
// string in every widget's data, the label and aria-label attributes, the messages overrides, a layout item id, a
// catalog label, description and category, a ts-add-request id, a session label, a chart category and a persist key.
// The page is then drawn and used (edit mode, the picker open, a sort, a pointer over a chart), and the spec asserts
// that nothing ran, that no markup was made from the text (no img, script, iframe, on* attribute or javascript: URL
// in the document or in any shadow root, walked recursively), and that the payload is on the page as text.
//
// It runs plain, where a payload that became markup would fire, and under the strict CSP and Trusted Types of
// RFC 0003 §14, where its handler would be blocked: a blocked handler and a harmless one can't be confused because
// the markup check fails either way. It finds, it does not fix: a payload that runs fails the test naming the
// widget and the field.
import { test, expect } from '@playwright/test'

const PAGE = '/test/browser/fixtures/xss.html'
const STRICT = "default-src 'self'; style-src 'self'; script-src 'self'; require-trusted-types-for 'script'; trusted-types tickslate"

// Every payload says window.__xss=1 where it would run, so the same substring finds it as text.
const TEXT = 'window.__xss=1'
const PAYLOADS = [
  ['img onerror', '<img src=x onerror="window.__xss=1">'],
  ['svg onload after a quote', '"><svg onload="window.__xss=1">'],
  ['style breakout', '</style><img src=x onerror="window.__xss=1">'],
  ['javascript: url', 'javascript:window.__xss=1'],
  ['entities', '&lt;img src=x onerror=window.__xss=1&gt; &#60;img src=x onerror=window.__xss=1&#62;'],
  ['null byte', '<im\u0000g src=x onerror="window.__xss=1">'],
]

let dialogs
let errors
let requests

test.beforeEach(async ({ page }) => {
  dialogs = []
  errors = []
  requests = []
  await page.context().route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort())
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message())
    dialog.dismiss()
  })
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (error) => errors.push(error.message))
  // An <img src=x> that was ever made asks for /x, even if its handler is blocked or the node is gone by the scan.
  page.on('request', (request) => /\/x$/.test(new URL(request.url()).pathname) && requests.push(request.url()))
  await page.addInitScript(() => {
    // Off-screen tiles skip their render by design (RFC 0003 §23), and this page is longer than the window.
    delete window.IntersectionObserver
    window.__violations = []
    document.addEventListener('securitypolicyviolation', (e) => window.__violations.push(`${e.violatedDirective} ${e.blockedURI} ${(e.sample || '').slice(0, 60)}`))
  })
})

async function serve(page, csp) {
  if (!csp) return
  // Vite's hot-reload client opens a WebSocket the strict policy has no reason to allow.
  await page.route('**/@vite/client', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export {}' }))
  await page.route('**/test/browser/fixtures/xss.html*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } })
  })
}

// Builds the page with `payload` in every string. Runs in the page; `withMessages` replaces every built-in message too.
const BUILD = async ({ payload, withMessages }) => {
  const data = await import('/test/browser/fixtures/data.js')
  const core = await import('/src/core/index.js')
  const els = await import('/src/elements/index.js')
  data.setup()
  window.__xss = undefined
  await Promise.all(['ts-grid', 'ts-grid-controls', 'ts-widget-picker', 'ts-layout-list'].map((tag) => customElements.whenDefined(tag)))

  // Strings that choose a behaviour or point at another field must stay what they are; everything else is text.
  const KEEP = new Set(['format', 'mode', 'goodWhen', 'kind', 'side', 'tone', 'dir', 'key', 'x', 'xType', 'date', 'today', 'id', 'exchange'])
  let n = 0
  const poison = (value, key) => {
    if (typeof value === 'string') return KEEP.has(key) ? value : `${payload}${++n}`
    if (Array.isArray(value)) return value.map((v) => poison(v, key))
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, poison(v, k)]))
    return value
  }

  const messages = withMessages ? Object.fromEntries(Object.keys(core.EN).map((k) => [k, payload])) : null
  const g = document.getElementById('g')
  g.setAttribute('aria-label', payload)
  if (messages) g.messages = messages
  g.catalog = { ...core.WIDGETS, hostile: { tag: 'ts-card', label: payload, sizes: ['S', 'M'], category: payload, description: payload } }
  g.addTypes = '*'

  const layout = []
  const tiles = []
  const add = (type, tag, size, setup) => {
    const id = `${payload}~${layout.length}`
    const el = document.createElement(tag)
    el.setAttribute('item', id)
    el.setAttribute('label', payload)
    el.setAttribute('aria-label', payload)
    el.clock = data.frozenClock
    if (messages) el.messages = messages
    if (setup) setup(el)
    g.append(el)
    layout.push({ id, type, size })
    tiles.push({ el, type })
    return el
  }

  for (const [type, spec] of Object.entries(core.WIDGETS)) {
    if (!customElements.get(spec.tag)) continue
    const size = type === 'table' ? 'L' : spec.sizes.includes('M') ? 'M' : spec.sizes[0]
    add(type, spec.tag, size, (el) => {
      if (type === 'card') {
        // A card's body is the host's own markup; only its label, ids and messages are the library's.
        return
      }
      if (type === 'sessionClock') {
        const nse = core.presets.nse({ segment: 'derivatives' })
        const mcx = core.presets.mcx()
        el.data = { calendar: core.createCalendar({ sessions: [{ ...nse, label: payload }, { ...mcx, label: payload }] }), sessions: [nse.id, mcx.id], timeframes: [5, 15] }
        return
      }
      if (type === 'metric') el.setAttribute('href', payload)
      el.data = poison(data.dataFor(spec.tag))
    })
  }

  // A chart whose categories are the payload, with a button per bar.
  add('chart', 'ts-chart', 'L', (el) => {
    el.actions = ['select']
    el.data = {
      xType: 'category',
      series: [
        { name: payload, kind: 'bar', points: [`${payload}1`, `${payload}2`, `${payload}3`].map((x, i) => ({ x, y: [4, -2, 7][i] })) },
        { name: `${payload}b`, kind: 'bar', points: [`${payload}1`, `${payload}2`, `${payload}3`].map((x, i) => ({ x, y: [3, 5, -1][i] })) },
      ],
    }
  })
  // A tile that is in the markup but not in the layout is hidden, and the picker offers it as Add back.
  const hidden = document.createElement('ts-card')
  hidden.setAttribute('item', `${payload}~hidden`)
  hidden.setAttribute('label', payload)
  g.append(hidden)

  g.layout = layout
  // The host answers a ts-add-request the way a framework would: it renders a child carrying the id it was given.
  g.addEventListener('ts-add-request', (e) => {
    e.preventDefault()
    const el = document.createElement('ts-card')
    el.setAttribute('item', e.detail.id)
    el.setAttribute('label', e.detail.id)
    g.append(el)
  })
  // A storage key is user text too; the layout is saved under it once the grid is edited.
  els.persistLayout(g, { key: payload, defaults: layout })
  g.editing = true
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  await frame()
  g.add({ type: 'hostile', id: `${payload}~requested` })
  await frame()
  document.getElementById('p').show()
  await frame()
  return tiles.map((t) => t.type)
}

// The deep walk: every element of the document and of every shadow root, open ones included.
const SCAN = (text) => {
  const FORBIDDEN = new Set(['img', 'picture', 'script', 'iframe', 'frame', 'object', 'embed', 'video', 'audio', 'source', 'base', 'meta', 'link', 'form', 'foreignobject'])
  const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'data', 'srcdoc', 'poster'])
  const found = []
  const hostOf = (root) => (root.host ? root.host.localName : 'document')
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const where = `${hostOf(root)} > ${el.localName}`
      if (FORBIDDEN.has(el.localName.toLowerCase())) found.push(`element: ${where}`)
      for (const attr of el.attributes) {
        if (/^on/i.test(attr.name)) found.push(`attribute ${attr.name}: ${where}`)
        const value = attr.value.replace(/[\u0000- ]/g, '').toLowerCase()
        // The href the spec itself put on a tile is the input under test, not output of the library.
        const given = root === document.body && el.parentElement && el.parentElement.id === 'g' && attr.name === 'href'
        if (!given && URL_ATTRS.has(attr.name.toLowerCase()) && /^(javascript|vbscript|data:text\/html)/.test(value)) found.push(`url ${attr.name}: ${where}`)
      }
      if (el.shadowRoot) walk(el.shadowRoot)
    }
  }
  // The body only: the page's own head (its module script, meta and link) is the fixture, not the library's output.
  walk(document.body)
  // What each tile says, from its shadow tree: text, plus the names assistive technology reads.
  const said = (root) => {
    let out = ''
    for (const node of root.querySelectorAll('*')) {
      out += ` ${node.getAttribute('aria-label') || ''} ${node.getAttribute('title') || ''}`
      if (node.shadowRoot) out += said(node.shadowRoot)
    }
    return `${out} ${root.textContent}`
  }
  const tiles = [...document.querySelectorAll('#g > *')].map((el) => ({
    tag: el.localName,
    item: el.getAttribute('item'),
    shown: el.shadowRoot ? said(el.shadowRoot).includes(text) : null,
  }))
  const surfaces = {}
  for (const id of ['g', 'c', 'p', 'l']) {
    const el = document.getElementById(id)
    surfaces[id] = el && el.shadowRoot ? said(el.shadowRoot).includes(text) : null
  }
  const links = []
  const collect = (root) => {
    for (const a of root.querySelectorAll('a')) links.push(a.getAttribute('href'))
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) collect(el.shadowRoot)
  }
  collect(document)
  return { xss: window.__xss === undefined ? null : window.__xss, found, tiles, surfaces, links, violations: window.__violations, url: location.pathname }
}

const settle = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))

// Everything that can go wrong after the payload is in the page.
async function check(page, label) {
  await settle(page)
  const result = await page.evaluate(SCAN, TEXT)
  expect.soft(result.xss, `${label}: a payload ran`).toBeNull()
  expect.soft(dialogs, `${label}: a dialog opened`).toEqual([])
  expect.soft(requests, `${label}: something asked for the image the payload names`).toEqual([])
  expect.soft(result.found, `${label}: markup was made from text`).toEqual([])
  expect.soft(result.violations, `${label}: a policy was violated`).toEqual([])
  expect.soft(errors, `${label}: the page raised an error`).toEqual([])
  expect.soft(result.url).toBe(PAGE)
  return result
}

for (const [mode, csp] of [['plain', null], ['strict CSP and Trusted Types', STRICT]]) {
  test.describe(mode, () => {
    for (const [name, payload] of PAYLOADS) {
      for (const withMessages of [false, true]) {
        test(`${name}${withMessages ? ' as every message' : ' in every field'} is inert`, async ({ page }) => {
          await serve(page, csp)
          await page.goto(PAGE)
          const types = await page.evaluate(BUILD, { payload, withMessages })
          expect(types.length).toBeGreaterThan(10)

          // Edit mode, a catalog row, a restore and a request are on the page; the picker is open.
          let result = await check(page, 'built')
          // Every tile names itself from the label attribute, so each one carries the payload as text.
          for (const tile of result.tiles) expect.soft(tile.shown, `${tile.tag} ${tile.item} shows its label as text`).toBe(true)
          expect.soft(result.surfaces.p, 'the picker shows the catalog label, description or category as text').toBe(true)
          expect.soft(result.surfaces.l, 'the layout list shows the labels as text').toBe(true)

          // Close the picker, leave edit mode, then use the tiles the way a person does.
          await page.keyboard.press('Escape')
          await page.evaluate(() => { document.getElementById('g').editing = false })
          await settle(page)
          const sort = page.locator('ts-table th button').nth(1)
          if (await sort.count()) {
            await sort.scrollIntoViewIfNeeded()
            await sort.click()
          }
          const chart = page.locator('ts-chart').last()
          await chart.scrollIntoViewIfNeeded()
          const box = await chart.boundingBox()
          if (box) for (const f of [0.3, 0.5, 0.7]) await page.mouse.move(box.x + box.width * f, box.y + box.height * 0.5)
          // A tile whose href is the javascript: payload is not a link, and a click on it goes nowhere. (The other
          // payloads are valid relative URLs, so a click would be a real navigation away from the page.)
          if (payload.startsWith('javascript:')) {
            const metric = page.locator('ts-metric').first()
            await metric.scrollIntoViewIfNeeded()
            await metric.click({ position: { x: 20, y: 20 } })
          }
          result = await check(page, 'used')
          expect.soft(result.links.filter((href) => /^\s*javascript/i.test(href || '')), 'an anchor kept a javascript: href').toEqual([])
        })
      }
    }
  })
}
