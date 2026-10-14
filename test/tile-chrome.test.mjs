import { test, describe, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { configure, createFormatter, createMessages } from '../src/core/index.js'
import { FakeElement, FakeDocument, tick } from './fake-dom.mjs'

// The shared tile chrome (RFC 0003 §5): one header, group and heading
// semantics, stable parts, typography tokens, forced colours, logical CSS and
// text alternatives. The elements are loaded once the fake HTMLElement is
// installed, so this file imports nothing from src/elements/ statically.

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

let W // widget.js: TsWidget, header, arrowFor, SHARED_CSS
let C // the six widget classes and their pure models
before(async () => {
  globalThis.HTMLElement = FakeElement
  globalThis.document = new FakeDocument()
  W = await import('../src/elements/widget.js')
  const [pnl, equity, clock, card, metric, chart] = await Promise.all([
    import('../src/elements/today-pnl.js'),
    import('../src/elements/equity-curve.js'),
    import('../src/elements/session-clock.js'),
    import('../src/elements/card.js'),
    import('../src/elements/metric.js'),
    import('../src/elements/series-chart.js'),
  ])
  C = { pnl, equity, clock, card, metric, chart }
  delete globalThis.HTMLElement
})
after(() => {
  delete globalThis.document
})
afterEach(() => globalThis.document.reset())

// [widget class, variants, the parts every variant's template holds, the parts only some do]
const WIDGETS = () => [
  ['TsTodayPnl', C.pnl.TsTodayPnl, ['S', 'Wide', 'M'], ['header', 'label', 'value'], { M: ['chart'] }],
  ['TsEquityCurve', C.equity.TsEquityCurve, ['Wide', 'M', 'XL'], ['header', 'label', 'value', 'chart'], {}],
  ['TsSessionClock', C.clock.TsSessionClock, ['S', 'Banner'], ['header', 'label'], { S: ['value'] }],
  ['TsCard', C.card.TsCard, ['S', 'Wide', 'M'], ['header', 'label', 'value'], {}],
  ['TsMetric', C.metric.TsMetric, ['S', 'Wide', 'M'], ['header', 'label', 'value'], { Wide: ['chart'], M: ['chart'] }],
  ['TsChart', C.chart.TsChart, ['Wide', 'M', 'L', 'XL'], ['header', 'label', 'chart'], {}],
]

const hasPart = (html, part) => new RegExp(`\\bpart="${part}"`).test(html)

describe('header()', () => {
  test('renders [dot][label][spacer][meta] with the header and label parts', () => {
    const html = W.header({ dot: true, meta: true })
    assert.match(html, /^<div class="hd" part="header">/)
    const order = ['class="dot live"', 'part="label"', 'class="f1"', 'class="sm mut n meta"']
    order.reduce((from, piece) => {
      const at = html.indexOf(piece, from)
      assert.ok(at >= from, `${piece} follows the one before it`)
      return at
    }, 0)
    assert.match(html, /<span class="lb ell" part="label" role="heading" aria-level="3" data-k="label"><\/span>/)
  })

  test('the dot is decoration; the meta holds the synced words as their own nodes', () => {
    const html = W.header({ dot: true, meta: true })
    assert.match(html, /<span class="dot live" data-k="dot" aria-hidden="true" hidden><\/span>/)
    for (const k of ['pre', 'time', 'post', 'meta']) assert.ok(html.includes(`data-k="${k}"`), k)
  })

  test('with no options it is the label alone: no dot, no spacer, no meta', () => {
    const html = W.header()
    assert.doesNotMatch(html, /class="dot|class="f1"|meta/)
    assert.equal(W.header({}), html)
  })

  test('actions add a slot after the meta, extra goes after the label, inner inside it', () => {
    const html = W.header({ meta: true, actions: true, extra: '<i data-x></i>', inner: '<b></b>', labelClass: 'title' })
    assert.match(html, /class="lb ell title" part="label"[^>]*data-k="label"><b><\/b><\/span><i data-x><\/i><span class="f1"><\/span>/)
    assert.ok(html.indexOf('data-k="meta"') < html.indexOf('<slot name="actions"></slot>'))
  })

  test('a string meta is the widget\'s own right-hand markup', () => {
    assert.match(W.header({ meta: '<em>x</em>' }), /<span class="f1"><\/span><em>x<\/em><\/div>$/)
  })
})

describe('parts', () => {
  test('every widget template holds the parts that apply to it, in every variant', () => {
    for (const [name, Ctor, variants, always, only] of WIDGETS()) {
      for (const variant of variants) {
        const html = Ctor.template(variant)
        for (const part of [...always, ...(only[variant] || [])]) assert.ok(hasPart(html, part), `${name} ${variant} has part="${part}"`)
      }
    }
  })

  test('a part a variant has no use for is not there (no chart in a small tile)', () => {
    assert.ok(!hasPart(C.pnl.TsTodayPnl.template('S'), 'chart'))
    assert.ok(!hasPart(C.metric.TsMetric.template('S'), 'chart'))
    assert.ok(!hasPart(C.clock.TsSessionClock.template('Banner'), 'value'))
  })

  test('every variant has exactly one label heading, and it is the one the base finds', () => {
    for (const [name, Ctor, variants] of WIDGETS()) {
      for (const variant of variants) {
        const html = Ctor.template(variant)
        assert.equal((html.match(/part="label"/g) || []).length, 1, `${name} ${variant}`)
        assert.equal((html.match(/role="heading"/g) || []).length, 1, `${name} ${variant}`)
        assert.equal((html.match(/part="header"/g) || []).length, 1, `${name} ${variant}`)
      }
    }
  })

  test('the loading, empty and error views are parts too, and the tile is a group', async () => {
    const Demo = class extends W.TsWidget {
      static spec = { label: 'Signups', sizes: ['S'] }
      static template() {
        return '<b></b>'
      }
    }
    Demo.prototype.localName = 'x-demo'
    const el = new Demo()
    assert.match(el.shadowRoot.html, /<div class="tile" part="tile" role="group"><\/div>/)
    const section = el.shadowRoot.section
    el.connect()
    await tick()
    assert.ok(hasPart(section.html, 'skeleton'), 'loading')
    assert.ok(hasPart(section.html, 'header') && hasPart(section.html, 'label'), 'the loading view has the header too')
    el.data = null
    await tick()
    assert.ok(hasPart(section.html, 'empty'), 'empty')
    el.error = 'down'
    await tick()
    assert.ok(hasPart(section.html, 'error'), 'error')
    assert.ok(hasPart(section.html, 'label'))
  })

  test('every widget\'s skeleton has a header and a label to fill', () => {
    for (const [name, Ctor, variants] of WIDGETS()) {
      for (const variant of variants) {
        const html = Ctor.skeleton(variant)
        assert.ok(hasPart(html, 'label') || /data-k="label"/.test(html), `${name} ${variant}`)
      }
    }
  })
})

describe('the heading and the group name', () => {
  let Demo
  const make = (attrs = {}, statics = {}) => {
    Demo = class extends W.TsWidget {
      static spec = { label: 'Signups', sizes: ['S'] }
      static template() {
        return '<span class="lb" part="label" role="heading" aria-level="3" data-k="label"></span><b class="v"></b>'
      }
      static viewModel(data) {
        return { ariaLabel: data.aria, live: data.live }
      }
    }
    Object.assign(Demo, statics)
    const el = new Demo()
    el.localName = 'x-demo'
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    return el
  }
  const grid = (attrs) => ({ localName: 'ts-grid', parentElement: null, getAttribute: (k) => (k in attrs ? attrs[k] : null) })
  const draw = async (el, data = { aria: 'Signups, 1' }) => {
    el.data = data
    el.connect()
    await tick()
    return el
  }
  const heading = (el) => el.shadowRoot.section.querySelector('[part="label"]')
  const level = (el) => heading(el).getAttribute('aria-level')

  test('the level is the widget\'s own heading-level, else the grid\'s, else 3', async () => {
    assert.equal(level(await draw(make())), '3')
    assert.equal(level(await draw(make({ 'heading-level': '5' }))), '5')
    const inGrid = make()
    inGrid.parentElement = grid({ 'heading-level': '2' })
    assert.equal(level(await draw(inGrid)), '2')
    const both = make({ 'heading-level': '4' })
    both.parentElement = grid({ 'heading-level': '2' })
    assert.equal(level(await draw(both)), '4', 'the widget wins')
  })

  test('the level is set in the loading view as well as the content', async () => {
    const el = make({ 'heading-level': '1' })
    el.connect()
    await tick()
    assert.equal(level(el), '1')
  })

  test('changing heading-level re-renders with the new level', async () => {
    const el = await draw(make({ 'heading-level': '2' }))
    el.setAttribute('heading-level', '6')
    await tick()
    assert.equal(level(el), '6')
    el.removeAttribute('heading-level')
    await tick()
    assert.equal(level(el), '3')
  })

  test('a value outside 1 to 6 is skipped with one development warning, falling to the next source', async (t) => {
    const warnings = []
    t.mock.method(console, 'warn', (m) => warnings.push(m))
    for (const bad of ['0', '7', 'two', '2.5']) {
      const el = make({ 'heading-level': bad })
      el.parentElement = grid({ 'heading-level': '4' })
      assert.equal(level(await draw(el)), '4', bad)
    }
    const alone = make({ 'heading-level': '9' })
    assert.equal(level(await draw(alone)), '3')
    await draw(alone) // the same element again does not warn twice
    alone.setAttribute('heading-level', '9')
    await tick()
    assert.equal(warnings.filter((w) => /heading-level="9"/.test(w)).length, 1)
    assert.ok(warnings.every((w) => /^tickslate: <x-demo> /.test(w) && /from 1 to 6/.test(w)))
  })

  test('the tile\'s name is the view model\'s ariaLabel, and ends ", live" while live', async () => {
    const el = await draw(make(), { aria: 'Signups, 1,204', live: true })
    assert.equal(el.shadowRoot.section.getAttribute('aria-label'), 'Signups, 1,204, live')
    el.data = { aria: 'Signups, 1,204', live: false }
    await tick()
    assert.equal(el.shadowRoot.section.getAttribute('aria-label'), 'Signups, 1,204')
  })

  test('the ", live" word is the time.live message', async () => {
    configure({ messages: { 'time.live': 'en direct' } })
    try {
      const el = await draw(make(), { aria: 'Signups, 1', live: true })
      assert.equal(el.shadowRoot.section.getAttribute('aria-label'), 'Signups, 1, en direct')
    } finally {
      configure({ messages: null })
    }
  })

  test('only a live view-model result is live: loading, empty and error views never say so', async () => {
    const el = await draw(make(), { aria: 'x', live: true })
    el.data = null
    await tick()
    assert.equal(el.shadowRoot.section.getAttribute('aria-label'), 'Signups')
  })

  test('aria-label is written only when its value changes', async () => {
    const el = make()
    const section = el.shadowRoot.section
    const writes = []
    const set = section.setAttribute.bind(section)
    section.setAttribute = (k, v) => {
      if (k === 'aria-label') writes.push(v)
      set(k, v)
    }
    el.connect()
    await tick()
    el.data = { aria: 'Signups, 1' }
    await tick()
    for (let i = 0; i < 5; i++) {
      el.data = { aria: 'Signups, 1' }
      await tick()
    }
    assert.deepEqual(writes, ['Signups', 'Signups, 1'], 'the skeleton name, then the first content name, and nothing for five repeats')
    el.data = { aria: 'Signups, 2' }
    await tick()
    assert.deepEqual(writes, ['Signups', 'Signups, 1', 'Signups, 2'])
  })

  test('the heading and the tile\'s other attributes are not rewritten on a repeat either', async () => {
    const el = await draw(make())
    const node = heading(el)
    const writes = []
    const set = node.setAttribute.bind(node)
    node.setAttribute = (k, v) => {
      writes.push(k)
      set(k, v)
    }
    for (let i = 0; i < 3; i++) {
      el.requestRender()
      await tick()
    }
    assert.deepEqual(writes, [])
  })

  test('a heading that shows other words than the label is named by the label; one that shows it is not', async () => {
    const el = await draw(make())
    // The fake DOM's nodes hold no text the widget wrote, so the heading reads as showing something else.
    assert.equal(heading(el).getAttribute('aria-label'), 'Signups')
    heading(el).textContent = 'Signups'
    el.requestRender()
    await tick()
    assert.equal(heading(el).getAttribute('aria-label'), null)
  })

  test('a tile with no label from any source has a hidden heading and is named by its tag', async (t) => {
    t.mock.method(console, 'warn', () => {})
    const el = make({}, { spec: null })
    const section = el.shadowRoot.section
    await draw(el, { aria: undefined })
    assert.equal(section.getAttribute('aria-label'), 'x-demo')
    assert.equal(heading(el).getAttribute('aria-hidden'), 'true')
    assert.equal(heading(el).getAttribute('aria-label'), null)
    el.setAttribute('label', 'Named')
    await tick()
    assert.equal(heading(el).getAttribute('aria-hidden'), null)
  })

})

describe('arrows beside gains and losses', () => {
  test('arrowFor reads the sign the reader sees', () => {
    assert.equal(W.arrowFor('+₹2,185.65'), '▲')
    assert.equal(W.arrowFor('−₹715'), '▼')
    assert.equal(W.arrowFor('₹0.00'), '')
    assert.equal(W.arrowFor('—'), '')
    assert.equal(W.arrowFor(''), '')
    assert.equal(W.arrowFor(undefined), '')
    assert.equal(W.arrowFor('-5'), '', 'a hyphen is not a minus sign')
  })

  const fmt = createFormatter({ locale: 'en-IN', currency: 'INR', timeZone: 'Asia/Kolkata' })
  const t = createMessages()

  test('Today\'s P&L: the headline, realised and unrealised carry ▲ or ▼, and fees none', () => {
    const ctx = () => ({ fmt, t, label: "Today's P&L", now: 0 })
    const up = C.pnl.todayPnlModel({ net: 2185.65, realized: 1860, unrealized: -412.95, fees: 87.3 }, 'S', ctx())
    assert.equal(up.netArrow, '▲')
    assert.equal(up.realizedArrow, '▲')
    assert.equal(up.unrealizedArrow, '▼')
    assert.ok(!('feesArrow' in up))
    const down = C.pnl.todayPnlModel({ net: -715, realized: -715, unrealized: 0, fees: 0 }, 'M', ctx())
    assert.equal(down.netArrow, '▼')
    assert.equal(down.unrealizedArrow, '', 'zero carries neither a sign nor an arrow')
    const flat = C.pnl.todayPnlModel({ net: 0, realized: 0, unrealized: 0, fees: 0 }, 'Wide', ctx())
    assert.equal(flat.netArrow, '')
    const none = C.pnl.todayPnlModel({}, 'S', ctx())
    assert.equal(none.netArrow, '')
  })

  test('Today\'s P&L: every variant\'s template has a node for each arrow it shows', () => {
    for (const v of ['S', 'Wide', 'M']) assert.ok(C.pnl.TsTodayPnl.template(v).includes('data-k="netAr"'), v)
    for (const v of ['Wide', 'M']) {
      const html = C.pnl.TsTodayPnl.template(v)
      for (const k of ['realizedAr', 'unrealizedAr']) assert.ok(html.includes(`data-k="${k}"`), `${v} ${k}`)
    }
    for (const v of ['S', 'Wide', 'M']) for (const m of C.pnl.TsTodayPnl.template(v).matchAll(/<span class="ar"[^>]*>/g)) assert.match(m[0], /aria-hidden="true"/)
  })

  test('the equity curve: net, peak and drawdown carry ▲ or ▼', () => {
    const days = [
      { date: '2026-10-05', pnl: 500 },
      { date: '2026-10-06', pnl: -200 },
      { date: '2026-10-07', pnl: 300 },
    ]
    const vm = C.equity.equityCurveModel({ days }, 'XL', { fmt, t, label: 'Equity curve', range: 'All' })
    assert.equal(vm.headlineArrow, '▲')
    assert.equal(vm.peakArrow, '▲')
    assert.equal(vm.maxDrawdownArrow, '▼')
    const loss = C.equity.equityCurveModel({ days: [{ date: '2026-10-05', pnl: -400 }] }, 'M', { fmt, t, label: 'Equity curve', range: 'All' })
    assert.equal(loss.headlineArrow, '▼')
    const none = C.equity.equityCurveModel({ days: [] }, 'M', { fmt, t, label: 'Equity curve', range: 'All' })
    assert.equal(none.headlineArrow, '')
    assert.equal(none.maxDrawdownArrow, '', 'a drawdown of nothing is not a loss')
    for (const v of ['Wide', 'M', 'XL']) assert.ok(C.equity.TsEquityCurve.template(v).includes('data-k="netAr"'), v)
    for (const v of ['M', 'XL']) assert.ok(C.equity.TsEquityCurve.template(v).includes('data-k="maxDrawdownAr"'), v)
  })

  test('the metric still has its own arrow, hidden from a listener', () => {
    for (const v of ['S', 'Wide', 'M']) assert.match(C.metric.TsMetric.template(v), /<span aria-hidden="true" data-k="arrow">/)
  })
})

describe('text alternatives', () => {
  test('range buttons add a visually hidden expansion: 1W is announced as "1W, 1 week"', () => {
    const xl = C.equity.TsEquityCurve.template('XL')
    for (const r of C.equity.RANGES) {
      assert.match(xl, new RegExp(`data-range="${r}"[^>]*><span data-k="rt${r}"></span><span class="visually-hidden" data-k="rl${r}"></span></button>`))
    }
    const fmt = createFormatter({ locale: 'en-IN', currency: 'INR', timeZone: 'Asia/Kolkata' })
    const vm = C.equity.equityCurveModel({ days: [{ date: '2026-10-05', pnl: 1 }] }, 'XL', { fmt, t: createMessages(), label: 'Equity curve', range: '1W' })
    const w = vm.ranges.find((r) => r.value === '1W')
    assert.equal(`${w.text}${w.long}`, '1W, 1 week')
    assert.deepEqual(vm.ranges.map((r) => r.long), [', 1 week', ', 1 month', ', 3 months', ', year to date', ', all days'])
    assert.match(W.SHARED_CSS, /\.visually-hidden \{[^}]*clip-path: inset\(50%\)/)
  })

  test('entry and exit marks differ in shape, not only colour', () => {
    const css = C.pnl.TsTodayPnl.styles
    assert.match(css, /\.mk \{[^}]*border-radius: 50%/)
    assert.match(css, /\.mk\.exit \{[^}]*border-radius: 0; transform: rotate\(45deg\)/)
    assert.doesNotMatch(css, /\.mk\.entry \{[^}]*(rotate|border-radius: 0)/)
  })

  test('decorative glyphs are aria-hidden: the dot, the arrows, the clock\'s tick glyphs and the swatches', () => {
    assert.match(W.header({ dot: true }), /class="dot live"[^>]*aria-hidden="true"/)
    const banner = C.clock.TsSessionClock.template('Banner')
    for (const m of banner.matchAll(/<span[^>]*class="lgm"[^>]*>/g)) assert.match(m[0], /aria-hidden="true"/)
    assert.match(banner, /<span aria-hidden="true">▮ <\/span><span class="nxt">/)
    for (const v of ['Wide', 'M', 'L', 'XL']) for (const m of C.chart.TsChart.template(v).matchAll(/<span class="sw[^>]*>/g)) assert.match(m[0], /aria-hidden="true"/, v)
  })
})

// ── Typography tokens ──────────────────────────────────────────────────────

describe('typography tokens', () => {
  const TOKENS = {
    '--ts-label-size': '10px',
    '--ts-label-case': 'uppercase',
    '--ts-label-tracking': '.12em',
    '--ts-label-weight': '600',
    '--ts-headline-weight': 'var(--ts-num-weight)',
  }
  const declared = (css) => {
    const body = stripComments(css).match(/:where\(:root\) \{([^}]*)\}/)[1]
    return Object.fromEntries([...body.matchAll(/(--ts-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
  }

  test('exist in both token files, with the values the labels and figures had before', async () => {
    const css = declared(read('src/themes/tokens.css'))
    const js = declared((await import('../src/elements/default-tokens.js')).TOKENS_CSS)
    for (const [token, value] of Object.entries(TOKENS)) {
      assert.equal(css[token], value, `tokens.css ${token}`)
      assert.equal(js[token], value, `default-tokens.js ${token}`)
    }
  })

  test('.lb, .big and .xbig read them, with fallbacks that are the same values', () => {
    const css = W.SHARED_CSS
    const lb = css.match(/\.lb \{([^}]*)\}/)[1]
    assert.match(lb, /font-size: var\(--ts-label-size, 10px\)/)
    assert.match(lb, /text-transform: var\(--ts-label-case, uppercase\)/)
    assert.match(lb, /letter-spacing: var\(--ts-label-tracking, \.12em\)/)
    assert.match(lb, /font-weight: var\(--ts-label-weight, 600\)/)
    assert.match(css, /\.big, \.xbig \{ font-weight: var\(--ts-headline-weight, var\(--ts-num-weight, 500\)\); \}/)
  })

  test('the card\'s slotted headline uses the headline weight too', () => {
    assert.match(C.card.TsCard.styles, /font-weight: var\(--ts-headline-weight, var\(--ts-num-weight, 500\)\)/)
  })
})

// ── CSS rules ──────────────────────────────────────────────────────────────

// Named up front, because a test's name is needed before the elements are loaded.
const SHEETS = ['the shared CSS', 'TsTodayPnl', 'TsEquityCurve', 'TsSessionClock', 'TsCard', 'TsMetric', 'TsChart']
const sheet = (name) => (name === 'the shared CSS' ? W.SHARED_CSS : WIDGETS().find(([n]) => n === name)[1].styles)

// `(...)` groups collapsed, so a shorthand's values can be counted.
const collapse = (value) => {
  let v = value
  for (let n = v.length; ; n = v.length) {
    v = v.replace(/\([^()]*\)/g, '()')
    if (v.length === n) return v
  }
}

/** The physical, direction-dependent declarations in a stylesheet. */
export function physicalDeclarations(css) {
  const found = []
  for (const m of stripComments(css).matchAll(/(?:^|[;{\s])([a-z-]+)\s*:\s*([^;{}]*)(?=[;}])/g)) {
    const [, prop, value] = m
    if (/^(?:left|right)$/.test(prop) || /^(?:margin|padding|border|scroll-margin|scroll-padding)-(?:left|right)(?:-|$)/.test(prop) || /^border-(?:top|bottom)-(?:left|right)-radius$/.test(prop)) found.push(`${prop}: ${value}`)
    else if (/^(?:text-align|float|clear)$/.test(prop) && /^(?:left|right)$/.test(value.trim())) found.push(`${prop}: ${value}`)
    else if (/^(?:margin|padding)$/.test(prop) && collapse(value.trim()).split(/\s+/).length === 4) found.push(`${prop}: ${value}`)
    else if (prop === 'border-radius' && /\//.test(value)) found.push(`${prop}: ${value}`)
  }
  return found
}

describe('logical properties only', () => {
  test('the scanner finds what it is meant to', () => {
    assert.deepEqual(physicalDeclarations('a { left: 0; right: 0 } b { margin-left: -3px; padding-right: 2px; text-align: right }').length, 5)
    assert.equal(physicalDeclarations('a { border-left: 1px solid; border-top-left-radius: 4px; float: right; margin: -4px 0 0 -4px; padding: 1px 2px 3px 4px }').length, 5)
    assert.equal(physicalDeclarations('a { inset-inline-start: 0; margin-inline: 4px; text-align: start; margin: 0 auto; padding: var(--ts-pad, 18px); margin: calc(1px + 2px) 0 }').length, 0)
    assert.equal(physicalDeclarations('a { padding: 0 var(--a, 1px) 2px; text-align: center }').length, 0)
    assert.equal(physicalDeclarations('/* left: 0 */ a { top: 0 }').length, 0)
  })

  for (const name of SHEETS) {
    test(`${name} has no left, right, margin-left, padding-right or text-align: left|right`, () => {
      assert.deepEqual(physicalDeclarations(sheet(name)), [])
    })
  }

  test('nor does the JavaScript that places marks and ticks', () => {
    for (const file of ['today-pnl', 'equity-curve', 'session-clock', 'card', 'metric', 'series-chart', 'widget']) {
      const source = stripComments(read(`src/elements/${file}.js`))
      assert.doesNotMatch(source, /\.style\.(?:left|right|marginLeft|marginRight|paddingLeft|paddingRight|textAlign)\b/, file)
      assert.doesNotMatch(source, /style="[^"]*(?:^|[;\s"])(?:left|right|margin-left|margin-right)\s*:/, file)
    }
  })

  test('figures isolate their bidi run, and the drawing boxes force left to right', () => {
    assert.match(W.SHARED_CSS, /\.n, \.big, \.xbig \{[^}]*unicode-bidi: isolate;/)
    assert.match(C.card.TsCard.styles, /slot\[name="value"\]::slotted\(\*\) \{[^}]*unicode-bidi: isolate;/)
    const ltr = {
      pnl: /\.chart, \.axis \{ direction: ltr; \}/,
      equity: /\.plot, \.ax \{ direction: ltr; \}/,
      clock: /\.trk, \.lt \{ direction: ltr; \}/,
      chart: /\.chartcol \{[^}]*direction: ltr;/,
      metric: /\.rhs svg, \.plot svg \{[^}]*direction: ltr;/,
    }
    const classes = { pnl: 'TsTodayPnl', equity: 'TsEquityCurve', clock: 'TsSessionClock', chart: 'TsChart', metric: 'TsMetric' }
    for (const [key, re] of Object.entries(ltr)) assert.match(C[key][classes[key]].styles, re, key)
  })
})

describe('forced colours', () => {
  const ALLOWED = ['Highlight', 'CanvasText', 'ButtonFace']
  // Every CSS system colour keyword, so one outside the three is caught too.
  const SYSTEM = ['AccentColor', 'AccentColorText', 'ActiveText', 'ButtonBorder', 'ButtonFace', 'ButtonText', 'Canvas', 'CanvasText', 'Field', 'FieldText', 'GrayText', 'Highlight', 'HighlightText', 'LinkText', 'Mark', 'MarkText', 'SelectedItem', 'SelectedItemText', 'VisitedText']
  const KEYWORD = new RegExp(`(?<![\\w-])(${SYSTEM.join('|')})(?![\\w-])`, 'g')

  /** [media query body, rest] where the rest is the CSS with every forced-colors block cut out. */
  function split(css) {
    const text = stripComments(css)
    const inside = []
    let rest = ''
    for (let i = 0; i < text.length; ) {
      const at = text.indexOf('@media (forced-colors: active)', i)
      if (at < 0) {
        rest += text.slice(i)
        break
      }
      rest += text.slice(i, at)
      const open = text.indexOf('{', at)
      let depth = 1
      let j = open + 1
      while (depth && j < text.length) depth += text[j] === '{' ? 1 : text[j] === '}' ? -1 : 0, j++
      inside.push(text.slice(open + 1, j - 1))
      i = j
    }
    return { inside: inside.join('\n'), rest }
  }

  test('the splitter works', () => {
    const { inside, rest } = split('a { color: red } @media (forced-colors: active) { b { color: Highlight } c { x: y } } d { color: blue }')
    assert.match(inside, /b \{ color: Highlight \}/)
    assert.match(inside, /c \{ x: y \}/)
    assert.doesNotMatch(rest, /Highlight/)
    assert.match(rest, /d \{ color: blue \}/)
  })

  for (const name of SHEETS) {
    test(`${name}: system colours only inside the forced-colors query, and only the three`, () => {
      const { inside, rest } = split(sheet(name))
      assert.deepEqual(rest.match(KEYWORD) || [], [], 'no system colour outside the query')
      for (const word of inside.match(KEYWORD) || []) assert.ok(ALLOWED.includes(word), `${word} is not one of ${ALLOWED.join(', ')}`)
      assert.doesNotMatch(rest, /#[0-9a-f]{3,8}\b|\b(?:rgb|hsl)a?\(/i, 'and no colour value')
      assert.doesNotMatch(inside, /#[0-9a-f]{3,8}\b|\b(?:rgb|hsl)a?\(/i)
    })
  }

  // [what stays visible, where it lives, the selector it is drawn with]
  const VISIBLE = [
    ['the live dot', () => W.SHARED_CSS, /\.dot\.live \{ background: Highlight; \}/],
    ['the selected button', () => W.SHARED_CSS, /\.btn\.on \{ background: Highlight; color: ButtonFace; \}/],
    ['the profit and loss lines and the zero line', () => W.SHARED_CSS, /\.lp, \.ln, \.lz \{ stroke: CanvasText; \}/],
    ['the session clock\'s fill', () => C.clock.TsSessionClock.styles, /\.fill, \.lf \{ background: Highlight; \}/],
    ['the session clock\'s ticks', () => C.clock.TsSessionClock.styles, /\.tk, \.tk\.b \{ background: CanvasText; \}/],
    ['the session clock\'s marker', () => C.clock.TsSessionClock.styles, /\.mk \{[^}]*border: 2px solid CanvasText; box-shadow: none;/],
    ['the session clock\'s tracks', () => C.clock.TsSessionClock.styles, /\.trk, \.rail \{[^}]*border: 1px solid CanvasText;/],
    ['Today\'s P&L entry marks', () => C.pnl.TsTodayPnl.styles, /\.mk\.entry \{ background: Highlight;/],
    ['Today\'s P&L exit marks', () => C.pnl.TsTodayPnl.styles, /\.mk\.exit \{ background: CanvasText;/],
    ['chart lines', () => C.chart.TsChart.styles, /\.sl, \.sd \{ stroke: CanvasText; \}/],
    ['chart series told apart by dash', () => C.chart.TsChart.styles, /\.sl\.c-3, \.sl\.c-4 \{ stroke-dasharray: 6 3; \}/],
    ['the metric sparkline', () => C.metric.TsMetric.styles, /\.sl \{ stroke: CanvasText; \}/],
    ['the metric target bar fill', () => C.metric.TsMetric.styles, /\.fill \{ fill: Highlight; \}/],
    ['the metric target bar track', () => C.metric.TsMetric.styles, /\.tbar \{[^}]*border: 1px solid CanvasText;/],
  ]
  for (const [what, css, re] of VISIBLE) {
    test(`${what} keeps a system colour under forced colours`, () => {
      const { inside } = split(css())
      assert.match(inside, re)
    })
  }
})
