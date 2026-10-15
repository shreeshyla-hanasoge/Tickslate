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

  test('returns null for empty, null or non-string values', () => {
    assert.equal(W.validateHref(null), null)
    assert.equal(W.validateHref(undefined), null)
    assert.equal(W.validateHref(''), null)
    assert.equal(W.validateHref(123), null)
  })
})

describe('shared CSS rules for tile activation', () => {
  test('includes stretched link, whole-tile focus ring and actions slot elevation', () => {
    const css = W.SHARED_CSS
    assert.match(css, /\[part~="link"\]::after\s*\{\s*content:\s*'';\s*position:\s*absolute;\s*inset:\s*0;\s*z-index:\s*1;\s*\}/)
    assert.match(css, /\.tile:has\(\[part~="link"\]:focus-visible\)\s*\{\s*outline:\s*2px solid var\(--ts-focus, var\(--ts-accent\)\);\s*outline-offset:\s*-2px;\s*\}/)
    assert.match(css, /slot\[name="actions"\],\s*::slotted\(\*\)\s*\{\s*position:\s*relative;\s*z-index:\s*2;\s*\}/)
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

  test('Enter or Space keydown fires ts-action open', async () => {
    const el = new DummyTile()
    el.setAttribute('label', 'Orders')
    el.setAttribute('item', 'tile-orders')
    el.setAttribute('activatable', '')
    el.connect()
    await tick()

    const actions = []
    el.addEventListener('ts-action', (e) => actions.push(e.detail))

    const btn = { closest: (sel) => sel === '[part~="link"]' ? btn : null, localName: 'button', getAttribute: (k) => k === 'part' ? 'link' : null }
    el.shadowRoot.section.dispatch('keydown', { key: 'Enter', target: btn })
    el.shadowRoot.section.dispatch('keydown', { key: ' ', target: btn })

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
      fmt: { number: (n) => String(n), money: (n) => `$${n}` },
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
      label: 'Revenue: 2026-09-01, 100',
    })
    assert.deepEqual(vm.points[1], {
      series: 'rev',
      value: '2026-09-02',
      y: 200,
      index: 1,
      xPct: 99.3,
      yPct: 3,
      label: 'Revenue: 2026-09-02, 200',
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
    const ctx = { fmt: { number: (n) => String(n) }, t: (k) => k, now: 0, label: 'Rows' }
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

  test('Enter on a point button fires ts-action select', async () => {
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

    assert.deepEqual(actions, [
      { action: 'select', value: '2026-09-01', series: 'rev', y: 100, index: 0 },
    ])
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
