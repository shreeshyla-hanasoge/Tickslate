import { test, describe, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { FakeElement, FakeDocument, tick } from './fake-dom.mjs'

// Tile activation and point selection (RFC 0003 §7): href, activatable,
// stretched-link pattern, focus ring, edit guard, and chart point select.

let W
let S
let DummyTile
before(async () => {
  globalThis.HTMLElement = FakeElement
  globalThis.document = new FakeDocument()
  W = await import('../src/elements/widget.js')
  S = await import('../src/elements/series-chart.js')
  DummyTile = class extends W.TsWidget {
    static template() {
      return W.header() + '<div class="content">Content</div>'
    }
    update(vm) {
      const el = this.$('[data-k="label"]')
      if (el && el.textContent !== vm.label) el.textContent = vm.label
    }
  }
  delete globalThis.HTMLElement
})
after(() => {
  delete globalThis.document
})
afterEach(() => globalThis.document.reset())

describe('validateHref (RFC 0003 §7)', () => {
  test('accepts http, https, mailto, tel and relative URLs', () => {
    assert.equal(W.validateHref('https://example.com/details'), 'https://example.com/details')
    assert.equal(W.validateHref('http://localhost:5173/'), 'http://localhost:5173/')
    assert.equal(W.validateHref('mailto:team@example.com'), 'mailto:team@example.com')
    assert.equal(W.validateHref('tel:+1234567890'), 'tel:+1234567890')
    assert.equal(W.validateHref('/dashboards/revenue'), '/dashboards/revenue')
    assert.equal(W.validateHref('details?id=123'), 'details?id=123')
    assert.equal(W.validateHref('#overview'), '#overview')
    assert.equal(W.validateHref('../home'), '../home')
  })

  test('rejects javascript, data and unknown schemes with null', () => {
    assert.equal(W.validateHref('javascript:alert(1)'), null)
    assert.equal(W.validateHref('data:text/html,<h1>bad</h1>'), null)
    assert.equal(W.validateHref('vbscript:msgbox(1)'), null)
    assert.equal(W.validateHref('file:///etc/passwd'), null)
    assert.equal(W.validateHref('custom-scheme://action'), null)
  })

  test('strips leading control characters before scheme check', () => {
    assert.equal(W.validateHref('   https://example.com'), '   https://example.com')
    assert.equal(W.validateHref('\u0000javascript:alert(1)'), null)
    assert.equal(W.validateHref('\t\njavascript:alert(1)'), null)
  })

  test('rejects protocol-relative URLs, which are cross-origin without a scheme', () => {
    assert.equal(W.validateHref('//evil.example/path'), null)
    assert.equal(W.validateHref('\\\\evil.example'), null)
    assert.equal(W.validateHref('/\\evil.example'), null)
    assert.equal(W.validateHref('\\/evil.example'), null)
    assert.equal(W.validateHref('  //evil.example'), null)
    assert.equal(W.validateHref('/one/slash'), '/one/slash')
  })

  test('returns null for empty, null or non-string values', () => {
    assert.equal(W.validateHref(null), null)
    assert.equal(W.validateHref(undefined), null)
    assert.equal(W.validateHref(''), null)
    assert.equal(W.validateHref(123), null)
  })
})

describe('shared CSS rules for tile activation', () => {
  test('stretches the link, rings its own overlay, and lifts only controls above it', () => {
    const css = W.SHARED_CSS
    assert.match(css, /\[part~="link"\]::after\s*\{\s*content:\s*'';\s*position:\s*absolute;\s*inset:\s*0;\s*z-index:\s*1;\s*\}/)
    assert.match(css, /\[part~="link"\]:focus-visible::after\s*\{[^}]*outline:\s*2px solid var\(--ts-focus, var\(--ts-accent\)\)/)
    assert.doesNotMatch(css, /:has\(/, 'a focus ring that needs :has() is missing before Firefox 121')
    assert.doesNotMatch(css, /::slotted\(\*\)\s*\{[^}]*z-index/, 'lifting all slotted content would block the tile click')
    const lifted = /::slotted\(:is\(([^{}]*)\)\),\s*::slotted\(\[slot="actions"\]\)\s*\{\s*position:\s*relative;\s*z-index:\s*2;\s*\}/.exec(css)
    assert.ok(lifted, 'controls and the actions slot are lifted')
    for (const sel of ['a', 'button', 'input', 'select', 'textarea', 'summary', '[tabindex]', '[role="button"]', '[role="link"]']) assert.ok(lifted[1].includes(sel), sel)
  })
})

describe('the click target of an href or activatable tile (RFC 0005 §1)', () => {
  // The contract of RFC 0005 §1.2: which surfaces each widget lifts above the stretched link. A surface is found in the
  // static template by what marks it (its part, its role, or the .scroll class), so a new size that forgets the class fails.
  const SURFACES = {
    'today-pnl.js': { cls: 'TsTodayPnl', sizes: { S: [], Wide: [], M: ['part=chart'] } },
    'equity-curve.js': { cls: 'TsEquityCurve', sizes: { Wide: ['part=chart'], M: ['part=chart'], XL: ['part=chart'] } },
    'series-chart.js': { cls: 'TsChart', sizes: { Wide: ['part=chart'], M: ['part=chart'], L: ['part=chart'], XL: ['part=chart'] } },
    'pnl-calendar.js': { cls: 'TsPnlCalendar', sizes: { Tall: ['role=grid'], M: ['role=grid'], Banner: ['role=grid'] } },
    'mini-chart.js': { cls: 'TsMiniChart', sizes: { M: ['part=chart'], L: ['part=chart'], XL: ['part=chart', 'part=chart'] } },
    'metric.js': { cls: 'TsMetric', sizes: { S: [], Wide: ['part=chart'], M: ['part=chart'] } },
    'edge-stats.js': { cls: 'TsEdgeStats', sizes: { S: [], Wide: [], M: ['part=chart'] } },
    'breakdown.js': { cls: 'TsBreakdown', sizes: { S: ['part=bar'], Wide: ['part=bar', 'scroll'], Tall: ['part=bar', 'scroll'], M: ['part=chart', 'scroll'] } },
    'table.js': { cls: 'TsTable', sizes: { Tall: ['scroll'], M: ['scroll'], L: ['scroll'], XL: ['scroll'] } },
    'watchlist.js': { cls: 'TsWatchlist', sizes: { S: ['scroll'], Tall: ['scroll'], M: ['scroll'] } },
    'open-positions.js': { cls: 'TsOpenPositions', sizes: { Wide: ['scroll'], M: ['scroll'], L: ['scroll'] } },
    'capital-funding.js': { cls: 'TsCapitalFunding', sizes: { S: [], Tall: ['scroll'], L: ['scroll'] } },
    'status.js': { cls: 'TsStatus', sizes: { S: [], Tall: ['scroll'], M: ['scroll'] } },
    'feed.js': { cls: 'TsFeed', sizes: { Tall: ['scroll'], M: ['scroll'], L: ['scroll'] } },
    'session-clock.js': { cls: 'TsSessionClock', sizes: { S: [], Banner: [] } },
    'progress.js': { cls: 'TsProgress', sizes: { S: [], Wide: [] } },
  }
  const mods = {}
  before(async () => {
    globalThis.HTMLElement = FakeElement
    for (const file of Object.keys(SURFACES)) mods[file] = await import(`../src/elements/${file}`)
    delete globalThis.HTMLElement
  })

  // Every opening tag in a template, with its class list and the marks the contract names.
  const tags = (html) => [...html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/g)].map(([, name, attrs]) => {
    const get = (a) => (new RegExp(`\\s${a}="([^"]*)"`).exec(attrs) || [])[1]
    const classes = (get('class') || '').split(/\s+/).filter(Boolean)
    const marks = []
    if ((get('part') || '').split(/\s+/).includes('chart')) marks.push('part=chart')
    if ((get('part') || '').split(/\s+/).includes('bar')) marks.push('part=bar')
    if (get('role') === 'grid') marks.push('role=grid')
    if (classes.includes('scroll')) marks.push('scroll')
    return { name, classes, marks }
  })

  test('one shared rule lifts .lift above the stretched link, and only on an href or activatable tile', () => {
    const css = W.SHARED_CSS
    assert.match(css, /:host\(\[activatable\]\) \.lift, :host\(\[href\]\) \.lift \{ position: relative; z-index: 2; \}/)
    // Above the overlay (z-index 1), level with the tile's own buttons, so a later .btn still wins by order.
    assert.match(css, /\[part~="link"\]::after \{[^}]*z-index: 1;/)
    assert.match(css, /\.btn \{[^}]*z-index: 2;/)
    // Nothing lifts .lift on a plain tile: every rule that names it is scoped to the two attributes.
    for (const rule of css.match(/[^{}]*\.lift[^{]*\{/g)) assert.match(rule, /^\s*(?:\/\*[\s\S]*?\*\/\s*)?:host\(\[activatable\]\) \.lift, :host\(\[href\]\) \.lift \{$/)
  })

  test('on a touch screen the header of an href or activatable tile keeps a 44px open target in compact padding', () => {
    const css = W.SHARED_CSS
    const rule = /@media \(pointer: coarse\) \{ :host\(\[activatable\]\) \.hd, :host\(\[href\]\) \.hd \{ min-block-size: max\(18px, calc\(34px - var\(--ts-pad, 18px\)\)\); \} \}/
    assert.match(css, rule)
    // 12px of compact padding, the header and the tile's 10px gap make 44; 18px of comfortable padding needs no more than 18.
    const header = (pad) => Math.max(18, 34 - pad)
    assert.equal(12 + header(12) + 10, 44)
    assert.equal(header(18), 18)
  })

  for (const [file, { cls, sizes }] of Object.entries(SURFACES)) {
    test(`${file}: the surfaces of RFC 0005 §1.2 carry lift at every size, and nothing else does`, () => {
      const Cls = mods[file][cls]
      for (const [size, want] of Object.entries(sizes)) {
        const all = tags(Cls.template(size))
        const marked = all.filter((t) => t.marks.length)
        // Progress keeps its track (part=bar) under the overlay on purpose: it is the headline drawn as a shape.
        const surfaces = file === 'progress.js' ? [] : marked
        assert.deepEqual(surfaces.map((t) => t.marks.join(' ')).sort(), [...want].sort(), `${size}: the surfaces found`)
        for (const t of surfaces) assert.ok(t.classes.includes('lift'), `${size}: <${t.name} class="${t.classes.join(' ')}"> (${t.marks}) is lifted`)
        const lifted = all.filter((t) => t.classes.includes('lift'))
        assert.equal(lifted.length, surfaces.length, `${size}: only the listed surfaces are lifted`)
      }
    })
  }

  test('a click on a lifted surface finds no link, so the delegated listener emits nothing', async () => {
    const el = new DummyTile()
    el.setAttribute('label', 'Orders')
    el.setAttribute('item', 'orders')
    el.setAttribute('activatable', '')
    el.connect()
    await tick()
    const actions = []
    el.addEventListener('ts-action', (e) => actions.push(e.detail))
    // A cell inside a lifted grid: the click lands on it, not on the overlay, and closest() meets no [part~="link"] on the way up.
    const cell = { closest: () => null, localName: 'span', getAttribute: (k) => (k === 'role' ? 'gridcell' : null) }
    el.shadowRoot.section.dispatch('click', { target: cell })
    assert.deepEqual(actions, [])
  })
})

describe('href attribute and property (RFC 0003 §7)', () => {
  test('href attribute wraps the heading label in an a[part="link"][href]', async () => {
    const el = new DummyTile()
    el.setAttribute('label', 'Revenue')
    el.setAttribute('href', 'https://example.com/revenue')
    el.connect()
    await tick()

    const heading = el.shadowRoot.section.querySelector('[part="label"]')
    assert.ok(heading.html.includes('href="https://example.com/revenue"'))
    assert.ok(heading.html.includes('part="link"'))
    assert.ok(heading.html.includes('<a'))
  })

  test('href property reflects to attribute and updates link target', async () => {
    const el = new DummyTile()
    el.setAttribute('label', 'Revenue')
    el.connect()
    await tick()

    assert.equal(el.href, null)
    el.href = '/reports/revenue'
    assert.equal(el.getAttribute('href'), '/reports/revenue')
    await tick()

    const heading = el.shadowRoot.section.querySelector('[part="label"]')
    assert.ok(heading.html.includes('href="/reports/revenue"'))

    el.href = null
    assert.equal(el.hasAttribute('href'), false)
    await tick()
    assert.ok(!heading.html.includes('part="link"'))
  })

  test('invalid href scheme is rejected and does not wrap label in link', async () => {
    const el = new DummyTile()
    el.setAttribute('label', 'Revenue')
    el.setAttribute('href', 'javascript:alert(1)')
    el.connect()
    await tick()

    const heading = el.shadowRoot.section.querySelector('[part="label"]')
    assert.ok(!heading.html.includes('javascript:'))
    assert.ok(!heading.html.includes('part="link"'))
  })

  test('a rejected href leaves a plain label and no link', async () => {
    const el = new DummyTile()
    el.setAttribute('label', 'Revenue')
    el.setAttribute('href', '//evil.example')
    el.connect()
    await tick()

    const heading = el.shadowRoot.section.querySelector('[part="label"]')
    assert.ok(!heading.html.includes('part="link"'))
  })

  test('a rejected href does not disable activatable', async () => {
    for (const bad of ['javascript:alert(1)', '//evil.example']) {
      const el = new DummyTile()
      el.setAttribute('label', 'Revenue')
      el.setAttribute('item', 'rev')
      el.setAttribute('href', bad)
      el.setAttribute('activatable', '')
      el.connect()
      await tick()

      const heading = el.shadowRoot.section.querySelector('[part="label"]')
      assert.ok(heading.html.includes('<button'), `${bad} falls back to the open button`)
      assert.ok(!heading.html.includes('<a '), bad)
      assert.ok(!heading.html.includes('javascript:'), bad)

      const actions = []
      el.addEventListener('ts-action', (e) => actions.push(e.detail))
      const btn = { closest: (sel) => sel === '[part~="link"]' ? btn : null, localName: 'button', getAttribute: (k) => k === 'part' ? 'link' : null }
      el.shadowRoot.section.dispatch('click', { target: btn })
      assert.deepEqual(actions, [{ action: 'open', id: 'rev' }], bad)
    }
  })

  test('clicks on an href link do not fire ts-action open', async () => {
    const el = new DummyTile()
    el.setAttribute('label', 'Revenue')
    el.setAttribute('href', '/details')
    el.setAttribute('item', 'kpi-1')
    el.connect()
    await tick()

    let fired = false
    el.addEventListener('ts-action', () => { fired = true })
    const link = { closest: (sel) => sel === '[part~="link"]' ? link : null, localName: 'a', getAttribute: (k) => k === 'part' ? 'link' : null }
    el.shadowRoot.section.dispatch('click', { target: link })

    assert.equal(fired, false, 'href links navigate natively and fire no action event')
  })
})

describe('activatable attribute and property (RFC 0003 §7)', () => {
  test('activatable attribute wraps heading label in a button[type="button"][part="link"]', async () => {
    const el = new DummyTile()
    el.setAttribute('label', 'Open Drilldown')
    el.setAttribute('activatable', '')
    el.connect()
    await tick()

    const heading = el.shadowRoot.section.querySelector('[part="label"]')
    assert.ok(heading.html.includes('<button type="button"'))
    assert.ok(heading.html.includes('part="link"'))
    assert.equal(el.activatable, true)
  })

  test('activatable property toggles attribute and unwraps when false', async () => {
    const el = new DummyTile()
    el.setAttribute('label', 'Drilldown')
    el.connect()
    await tick()

    assert.equal(el.activatable, false)
    el.activatable = true
    assert.equal(el.hasAttribute('activatable'), true)
    await tick()

    const heading = el.shadowRoot.section.querySelector('[part="label"]')
    assert.ok(heading.html.includes('<button type="button"'))

    el.activatable = false
    assert.equal(el.hasAttribute('activatable'), false)
    await tick()
    assert.ok(!heading.html.includes('<button'))
  })

  test('clicking an activatable tile fires ts-action { action: "open", id }', async () => {
    const el = new DummyTile()
    el.setAttribute('label', 'Orders')
    el.setAttribute('item', 'orders-tile')
    el.setAttribute('activatable', '')
    el.connect()
    await tick()

    const actions = []
    el.addEventListener('ts-action', (e) => actions.push(e.detail))

    const btn = { closest: (sel) => sel === '[part~="link"]' ? btn : null, localName: 'button', getAttribute: (k) => k === 'part' ? 'link' : null }
    el.shadowRoot.section.dispatch('click', { target: btn })

    assert.deepEqual(actions, [{ action: 'open', id: 'orders-tile' }])
  })

  test('id defaults to empty string when no item attribute is set', async () => {
    const el = new DummyTile()
    el.setAttribute('label', 'Orders')
    el.setAttribute('activatable', '')
    el.connect()
    await tick()

    const actions = []
    el.addEventListener('ts-action', (e) => actions.push(e.detail))

    const btn = { closest: (sel) => sel === '[part~="link"]' ? btn : null, localName: 'button', getAttribute: (k) => k === 'part' ? 'link' : null }
    el.shadowRoot.section.dispatch('click', { target: btn })

    assert.deepEqual(actions, [{ action: 'open', id: '' }])
  })

  test('Enter and Space open the tile through the native button click, once each', async () => {
    const el = new DummyTile()
    el.setAttribute('label', 'Orders')
    el.setAttribute('item', 'tile-orders')
    el.setAttribute('activatable', '')
    el.connect()
    await tick()

    const heading = el.shadowRoot.section.querySelector('[part="label"]')
    assert.ok(heading.html.includes('<button type="button"'), 'a real button, so the browser turns Enter and Space into a click')

    const actions = []
    el.addEventListener('ts-action', (e) => actions.push(e.detail))
    const btn = { closest: (sel) => sel === '[part~="link"]' ? btn : null, localName: 'button', getAttribute: (k) => k === 'part' ? 'link' : null }
    // What a browser does for each key: a keydown, then the click it synthesises.
    for (const key of ['Enter', ' ']) {
      const before = actions.length
      el.shadowRoot.section.dispatch('keydown', { key, target: btn })
      assert.equal(actions.length, before, 'keydown alone opens nothing, so the click cannot double it')
      el.shadowRoot.section.dispatch('click', { target: btn })
    }
    assert.deepEqual(actions, [
      { action: 'open', id: 'tile-orders' },
      { action: 'open', id: 'tile-orders' },
    ])
  })

  test('href wins over activatable when both are set', async () => {
    const el = new DummyTile()
    el.setAttribute('label', 'Orders')
    el.setAttribute('href', '/orders')
    el.setAttribute('activatable', '')
    el.connect()
    await tick()

    const heading = el.shadowRoot.section.querySelector('[part="label"]')
    assert.ok(heading.html.includes('<a'))
    assert.ok(!heading.html.includes('<button'))

    const actions = []
    el.addEventListener('ts-action', (e) => actions.push(e.detail))
    const link = { closest: (sel) => sel === '[part~="link"]' ? link : null, localName: 'a', getAttribute: (k) => k === 'part' ? 'link' : null }
    el.shadowRoot.section.dispatch('click', { target: link })
    assert.equal(actions.length, 0, 'href wins; no open action fired')
  })

  test('a valid href with activatable renders the link, and a rejected one gives way to the button', async () => {
    const el = new DummyTile()
    el.setAttribute('label', 'Orders')
    el.setAttribute('href', '/orders')
    el.setAttribute('activatable', '')
    el.connect()
    await tick()
    el.setAttribute('href', 'javascript:void(0)')
    await tick()
    const heading = el.shadowRoot.section.querySelector('[part="label"]')
    assert.ok(heading.html.includes('<button'))
    el.setAttribute('href', '/orders')
    await tick()
    assert.ok(heading.html.includes('<a '))
    assert.ok(!heading.html.includes('<button'))
  })
})

describe('edit-mode suppression for tile activation (RFC 0003 §7)', () => {
  test('activatable clicks and keys are inert while the grid is editing', async () => {
    const el = new DummyTile()
    el.setAttribute('label', 'Tile')
    el.setAttribute('item', 't1')
    el.setAttribute('activatable', '')

    // Simulate grid ancestor in editing mode
    el.closest = (sel) => sel === 'ts-grid' ? { editing: true, hasAttribute: (k) => k === 'editing' } : null
    el.connect()
    await tick()

    const actions = []
    el.addEventListener('ts-action', (e) => actions.push(e.detail))

    const btn = { closest: (sel) => sel === '[part~="link"]' ? btn : null, localName: 'button', getAttribute: (k) => k === 'part' ? 'link' : null }
    let prevented = false
    el.shadowRoot.section.dispatch('click', { target: btn, preventDefault: () => { prevented = true } })
    assert.equal(actions.length, 0, 'no open action while editing')
    assert.equal(prevented, true, 'click is prevented while editing')

    prevented = false
    el.shadowRoot.section.dispatch('keydown', { key: 'Enter', target: btn, preventDefault: () => { prevented = true } })
    assert.equal(actions.length, 0)
    assert.equal(prevented, true, 'Enter is prevented while editing')
  })
})

describe('chart point selection (RFC 0003 §7.1)', () => {
  const named = {
    series: [
      { id: 'rev', name: 'Revenue', points: [{ x: '2026-09-01', y: 100 }, { x: '2026-09-02', y: 200 }] },
    ],
  }

  test('chartModel computes points with values, y, index, logical percentages and accessible label', () => {
    const ctx = {
      fmt: { number: (n) => String(n), money: (n) => `$${n}`, time: (n) => `T${n}`, date: (n) => `D${n}` },
      t: (k) => k,
      now: 0,
      label: 'Trend',
    }
    const vm = S.chartModel(named, 'M', ctx)
    assert.ok(Array.isArray(vm.points))
    assert.equal(vm.points.length, 2)
    assert.deepEqual(vm.points[0], {
      series: 'rev',
      value: '2026-09-01',
      y: 100,
      index: 0,
      xPct: 0.8,
      yPct: 81.3,
      label: 'Revenue: D1788220800000, 100',
    })
    assert.deepEqual(vm.points[1], {
      series: 'rev',
      value: '2026-09-02',
      y: 200,
      index: 1,
      xPct: 99.3,
      yPct: 3,
      label: 'Revenue: D1788307200000, 200',
    })
  })

  test('points from row-oriented data carry row index and preserve x value', () => {
    const rowsData = {
      x: 'date',
      y: [{ key: 'cost', id: 'cost-col', name: 'Costs' }],
      rows: [
        { date: '2026-09-01', cost: 40 },
        { date: '2026-09-02', cost: 60 },
      ],
    }
    const ctx = { fmt: { number: (n) => String(n), date: (n) => `D${n}`, time: (n) => `T${n}` }, t: (k) => k, now: 0, label: 'Rows' }
    const vm = S.chartModel(rowsData, 'M', ctx)
    assert.equal(vm.points.length, 2)
    assert.equal(vm.points[0].series, 'cost-col')
    assert.equal(vm.points[0].value, '2026-09-01')
    assert.equal(vm.points[0].y, 40)
    assert.equal(vm.points[0].index, 0)
    assert.equal(vm.points[1].value, '2026-09-02')
    assert.equal(vm.points[1].y, 60)
    assert.equal(vm.points[1].index, 1)
  })

  test('a point is named by the formatted x, in the formatter locale, and keeps the raw x in its detail', () => {
    const day = 86400000
    const t0 = Date.UTC(2026, 8, 1, 12)
    const fmt = Object.freeze({ number: (n) => String(n), time: (n) => `time ${n - t0}`, date: (n) => `date ${(n - t0) / day}` })
    const ctx = { fmt, t: (k) => k, now: 0, label: 'Trend' }
    const span = S.chartModel({ series: [{ name: 'R', points: [{ x: t0, y: 1 }, { x: t0 + 2 * day, y: 5 }] }] }, 'M', ctx)
    assert.equal(span.points[0].label, 'R: date 0, 1')
    assert.equal(span.points[1].label, 'R: date 2, 5')
    assert.equal(span.points[1].value, t0 + 2 * day, 'the raw x stays in the event detail')
    const within = S.chartModel({ series: [{ name: 'R', points: [{ x: t0, y: 1 }, { x: t0 + 3600000, y: 5 }] }] }, 'M', ctx)
    assert.equal(within.points[1].label, 'R: time 3600000, 5', 'inside a day it reads as a clock time')
    const numeric = S.chartModel({ xType: 'number', series: [{ name: 'R', points: [{ x: 3, y: 1 }, { x: 4, y: 5 }] }] }, 'M', ctx)
    assert.equal(numeric.points[0].label, 'R: 3, 1')
  })

  test('with the real formatter a time axis reads as a date, never the timestamp', async () => {
    const core = await import('../src/core/index.js')
    const fmt = core.createFormatter({ locale: 'de-DE', timeZone: 'UTC' })
    const ctx = { fmt, t: (k) => k, now: 0, label: 'Trend' }
    const day = 86400000
    const vm = S.chartModel({ series: [{ name: 'R', points: [{ x: 1700000000000, y: 1 }, { x: 1700000000000 + 5 * day, y: 5 }] }] }, 'M', ctx)
    assert.ok(!vm.points[0].label.includes('1700000000000'))
    assert.match(vm.points[0].label, /^R: 14\. Nov\.? 2023, /)
  })

  test('arrow keys step between points: Home and End jump, the ends clamp, and right-to-left flips left and right', () => {
    assert.equal(S.stepPoint(1, 5, 'ArrowRight', false), 2)
    assert.equal(S.stepPoint(1, 5, 'ArrowDown', false), 2)
    assert.equal(S.stepPoint(1, 5, 'ArrowLeft', false), 0)
    assert.equal(S.stepPoint(1, 5, 'ArrowUp', false), 0)
    assert.equal(S.stepPoint(0, 5, 'ArrowLeft', false), 0)
    assert.equal(S.stepPoint(4, 5, 'ArrowRight', false), 4)
    assert.equal(S.stepPoint(2, 5, 'Home', false), 0)
    assert.equal(S.stepPoint(2, 5, 'End', false), 4)
    assert.equal(S.stepPoint(1, 5, 'ArrowRight', true), 0)
    assert.equal(S.stepPoint(1, 5, 'ArrowLeft', true), 2)
    assert.equal(S.stepPoint(1, 5, 'Enter', false), -1)
    assert.equal(S.stepPoint(-1, 5, 'ArrowRight', false), -1)
  })

  function makeChart({ data, actions = [] } = {}) {
    const chart = new S.TsChart()
    const root = chart.shadowRoot
    root.querySelector = (sel) => (sel === '.tile' ? root.section : root.section.querySelector(sel))
    if (data) chart.data = data
    chart.actions = actions
    return chart
  }

  test('pts element is hidden and empty unless actions includes select', async () => {
    const chart = makeChart({ data: named })
    chart.connect()
    await tick()

    const pts = chart.shadowRoot.section.querySelector('[data-k="pts"]')
    assert.equal(pts.getAttribute('hidden'), '')
    assert.equal(pts.html, '')

    chart.actions = ['select']
    await tick()
    assert.equal(pts.getAttribute('hidden'), null)
    assert.ok(pts.html.includes('class="pt"'))
    assert.ok(pts.html.includes('data-series="rev"'))
    assert.ok(pts.html.includes('data-index="0"'))

    chart.actions = []
    await tick()
    assert.equal(pts.getAttribute('hidden'), '')
    assert.equal(pts.html, '')
  })

  test('clicking a point button fires ts-action { action: "select", value, series, y, index }', async () => {
    const chart = makeChart({ data: named, actions: ['select'] })
    chart.connect()
    await tick()

    const actions = []
    chart.addEventListener('ts-action', (e) => actions.push(e.detail))

    const ptBtn = {
      closest: (sel) => sel === '.pt' ? ptBtn : null,
      getAttribute: (k) => k === 'data-series' ? 'rev' : k === 'data-index' ? '0' : null,
    }
    chart.shadowRoot.section.dispatch('click', { target: ptBtn })

    assert.deepEqual(actions, [
      { action: 'select', value: '2026-09-01', series: 'rev', y: 100, index: 0 },
    ])
  })

  test('Enter and Space select through the native button click, so keydown alone fires nothing', async () => {
    const chart = makeChart({ data: named, actions: ['select'] })
    chart.connect()
    await tick()

    const actions = []
    chart.addEventListener('ts-action', (e) => actions.push(e.detail))

    const ptBtn = {
      closest: (sel) => sel === '.pt' ? ptBtn : null,
      getAttribute: (k) => k === 'data-series' ? 'rev' : k === 'data-index' ? '0' : null,
    }
    chart.shadowRoot.section.dispatch('keydown', { key: 'Enter', target: ptBtn })
    assert.deepEqual(actions, [], 'the click the browser sends next is the one that selects')
    chart.shadowRoot.section.dispatch('click', { target: ptBtn })
    assert.equal(actions.length, 1)
  })

  test('only the first point is a tab stop; the rest wait for the arrow keys', async () => {
    const chart = makeChart({ data: named, actions: ['select'] })
    chart.connect()
    await tick()
    const html = chart.shadowRoot.section.querySelector('[data-k="pts"]').html
    assert.equal(html.match(/tabindex="0"/g).length, 1)
    assert.equal(html.match(/tabindex="-1"/g).length, 1)
    assert.ok(html.indexOf('tabindex="0"') < html.indexOf('tabindex="-1"'))
  })

  test('point selection is inert while the grid is editing', async () => {
    const chart = makeChart({ data: named, actions: ['select'] })
    chart.closest = (sel) => sel === 'ts-grid' ? { editing: true, hasAttribute: () => true, getAttribute: () => null } : null
    chart.connect()
    await tick()

    const actions = []
    chart.addEventListener('ts-action', (e) => actions.push(e.detail))

    const ptBtn = {
      closest: (sel) => sel === '.pt' ? ptBtn : null,
      getAttribute: (k) => k === 'data-series' ? 'rev' : k === 'data-index' ? '0' : null,
    }
    let prevented = false
    chart.shadowRoot.section.dispatch('click', { target: ptBtn, preventDefault: () => { prevented = true } })

    assert.equal(actions.length, 0, 'no select action emitted while editing')
    assert.equal(prevented, true, 'click was prevented')
  })
})
