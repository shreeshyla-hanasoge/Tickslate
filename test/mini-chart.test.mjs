import { test, describe, before, after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createFormatter, createMessages, EN, WIDGETS } from '../src/core/index.js'
import { resetWarnings } from '../src/elements/dev.js'
import { FakeElement, FakeDocument, tick } from './fake-dom.mjs'

// <ts-mini-chart> (RFC 0004 §6): the pure diff, the theme mapping and the model, then the wrapper against a fake
// Emberwick. Like the other element tests this imports only src/ and node:*, so it runs with no install: the real
// Emberwick is exercised by the browser spec.

let M // mini-chart.js, loaded against the fake HTMLElement
before(async () => {
  globalThis.HTMLElement = FakeElement
  globalThis.document = new FakeDocument()
  M = await import('../src/elements/mini-chart.js')
  delete globalThis.HTMLElement
})
after(() => {
  delete globalThis.document
})
afterEach(() => globalThis.document.reset())

const fmt = createFormatter({ locale: 'en-IN', currency: 'INR', timeZone: 'Asia/Kolkata' })
const t = createMessages()
const ctx = { fmt, t, now: 0, label: 'Watch' }

const T0 = Date.UTC(2026, 9, 26, 3, 45)
const bar = (i, close = 100 + i, extra = {}) => ({ time: T0 + i * 300000, open: 100 + i, high: 102 + i, low: 98 + i, close, ...extra })
const bars = (n, from = 0) => Array.from({ length: n }, (_, i) => bar(from + i))
const model = (data, variant = 'M') => M.miniChartModel(data, variant, ctx)
const chartData = (over = {}) => ({ charts: [{ id: 'abc', instrument: 'ABC Corp', timeframe: '5m', bars: bars(78), ...over }] })

describe('diffBars', () => {
  const prev = bars(5)
  test('identical lists are none, and so are two empty ones', () => {
    assert.deepEqual(M.diffBars(prev, bars(5)), { kind: 'none' })
    assert.deepEqual(M.diffBars([], []), { kind: 'none' })
  })
  test('a changed last bar is one update', () => {
    const next = [...bars(4), bar(4, 150)]
    assert.deepEqual(M.diffBars(prev, next), { kind: 'ops', ops: [{ op: 'update', bar: next[4] }] })
  })
  test('a volume change counts as a change, and so does gaining a volume', () => {
    assert.equal(M.diffBars([bar(0, 100, { volume: 5 })], [bar(0, 100, { volume: 6 })]).kind, 'ops')
    assert.equal(M.diffBars([bar(0)], [bar(0, 100, { volume: 6 })]).kind, 'ops')
  })
  test('a candle closing is one update and one append, in that order', () => {
    const next = [...bars(4), bar(4, 111), bar(5)]
    assert.deepEqual(M.diffBars(prev, next), { kind: 'ops', ops: [{ op: 'update', bar: next[4] }, { op: 'append', bar: next[5] }] })
  })
  test('a new bar alone is one append', () => {
    assert.deepEqual(M.diffBars(prev, bars(6)).ops.map((o) => o.op), ['append'])
  })
  test('appends up to maxAppend are applied one by one, more is a bulk load', () => {
    assert.equal(M.diffBars(prev, bars(15)).kind, 'ops')
    assert.equal(M.diffBars(prev, bars(15)).ops.length, 10)
    assert.equal(M.diffBars(prev, bars(16)).kind, 'set')
    assert.equal(M.diffBars(prev, bars(8), { maxAppend: 2 }).kind, 'set')
    assert.equal(M.diffBars(prev, bars(7), { maxAppend: 2 }).kind, 'ops')
    assert.equal(M.MAX_APPEND, 10)
  })
  test('an earlier bar that changed is a set', () => {
    const next = bars(6)
    next[2] = bar(2, 140)
    assert.deepEqual(M.diffBars(prev, next), { kind: 'set', bars: next })
  })
  test('a shorter list is a set, even when it is a prefix', () => {
    assert.equal(M.diffBars(prev, bars(4)).kind, 'set')
    assert.equal(M.diffBars(prev, []).kind, 'set')
  })
  test('a null prev, or the first bars, is a set', () => {
    assert.deepEqual(M.diffBars(null, prev), { kind: 'set', bars: prev })
    assert.deepEqual(M.diffBars(null, []), { kind: 'set', bars: [] })
    assert.equal(M.diffBars([], prev).kind, 'set')
  })
  test('a different candle at the last position, or a bar that is not newer, is a set', () => {
    assert.equal(M.diffBars(prev, [...bars(4), bar(9)]).kind, 'set')
    assert.equal(M.diffBars(prev, [...bars(5), bar(4)]).kind, 'set')
  })
  test('time-ordered input and the inputs are left alone', () => {
    const before = JSON.stringify(prev)
    const next = bars(7)
    const d = M.diffBars(prev, next)
    assert.deepEqual(d.ops.map((o) => o.bar.time), [next[5].time, next[6].time])
    assert.equal(JSON.stringify(prev), before)
  })
})

describe('emberwickTheme', () => {
  const TOKENS = {
    '--ts-surface': 'rgb(250, 249, 245)', '--ts-line': 'rgb(232, 229, 220)', '--ts-axis': 'rgb(148, 140, 124)', '--ts-muted': 'rgb(110, 106, 96)',
    '--ts-ink': 'rgb(24, 24, 22)', '--ts-profit': 'rgb(0, 140, 90)', '--ts-loss': 'rgb(200, 40, 50)', '--ts-accent': 'rgb(44, 82, 196)',
    '--ts-font-num': "'Newsreader', serif",
  }
  const reader = (table) => (token) => table[token] || ''
  let theme
  before(() => {
    theme = M.emberwickTheme(reader(TOKENS))
  })

  test('maps every row of the table', () => {
    assert.equal(theme.background, TOKENS['--ts-surface'])
    assert.equal(theme.grid, TOKENS['--ts-line'])
    assert.equal(theme.axisLine, TOKENS['--ts-axis'])
    assert.equal(theme.text, TOKENS['--ts-muted'])
    assert.equal(theme.textStrong, TOKENS['--ts-ink'])
    assert.equal(theme.labelBg, TOKENS['--ts-ink'])
    assert.equal(theme.labelText, TOKENS['--ts-surface'])
    assert.equal(theme.tagText, TOKENS['--ts-surface'])
    for (const key of ['up', 'wickUp', 'upFill']) assert.equal(theme[key], TOKENS['--ts-profit'], key)
    for (const key of ['down', 'wickDown', 'downFill']) assert.equal(theme[key], TOKENS['--ts-loss'], key)
    assert.equal(theme.crosshair, TOKENS['--ts-muted'])
    assert.equal(theme.profilePoc, TOKENS['--ts-accent'])
    assert.equal(theme.profileVaLine, TOKENS['--ts-muted'])
    assert.equal(theme.font, "11px 'Newsreader', serif")
    assert.equal(typeof theme.priceAxisWidth, 'number')
    assert.equal(typeof theme.timeAxisHeight, 'number')
  })
  test('translucent entries are the opaque colour with an alpha applied', () => {
    assert.equal(theme.volumeUp, 'rgba(0, 140, 90, 0.4)')
    assert.equal(theme.volumeDown, 'rgba(200, 40, 50, 0.4)')
    assert.equal(theme.watermark, 'rgba(232, 229, 220, 0.4)')
    assert.equal(theme.profileFill, 'rgba(44, 82, 196, 0.25)')
    assert.equal(theme.profileValueArea, 'rgba(44, 82, 196, 0.45)')
  })
  test('an alpha is multiplied into a colour that already had one', () => {
    const t2 = M.emberwickTheme(reader({ ...TOKENS, '--ts-line': 'rgba(0, 0, 0, 0.5)' }))
    assert.equal(t2.watermark, 'rgba(0, 0, 0, 0.2)')
    assert.equal(t2.grid, 'rgba(0, 0, 0, 0.5)')
  })
  test('the red-up palette swaps profit and loss, so the candles and the volume follow', () => {
    const swapped = M.emberwickTheme(reader({ ...TOKENS, '--ts-profit': TOKENS['--ts-loss'], '--ts-loss': TOKENS['--ts-profit'] }))
    assert.equal(swapped.up, TOKENS['--ts-loss'])
    assert.equal(swapped.down, TOKENS['--ts-profit'])
    assert.equal(swapped.volumeUp, 'rgba(200, 40, 50, 0.4)')
  })
  test('a token that is unset leaves Emberwick its own default for the keys it feeds', () => {
    const bare = M.emberwickTheme(reader({ '--ts-profit': TOKENS['--ts-profit'] }))
    assert.ok(!('background' in bare) && !('font' in bare) && !('profileFill' in bare) && !('watermark' in bare))
    assert.equal(bare.up, TOKENS['--ts-profit'])
  })
})

describe('miniChartModel', () => {
  test('an unreadable bar or mark is dropped and counted; a numeric string is accepted', () => {
    const m = model(chartData({
      bars: [bar(0), { time: 'nope', open: 1, high: 1, low: 1, close: 1 }, { ...bar(1), close: '104.5' }, { ...bar(2), high: 'x' }, null, { ...bar(3), volume: '1200' }],
      marks: [{ t: T0, kind: 'entry' }, { t: 'x', kind: 'exit' }, { t: T0, kind: 'flag' }, { t: T0 + 1, kind: 'exit', label: 'TP' }],
    }))
    const c = m.charts[0]
    assert.equal(m.dropped, 5)
    assert.deepEqual(c.bars.map((b) => b.close), [100, 104.5, 103])
    assert.equal(c.bars[2].volume, 1200)
    assert.ok(!('volume' in c.bars[0]))
    assert.deepEqual(c.marks, [{ time: T0, kind: 'entry', shape: 'circle' }, { time: T0 + 1, kind: 'exit', shape: 'diamond', text: 'TP' }])
  })
  test('bars come out ascending with one per time', () => {
    const c = model(chartData({ bars: [bar(2), bar(0), bar(1), bar(1, 200)] })).charts[0]
    assert.deepEqual(c.bars.map((b) => b.time), [T0, T0 + 300000, T0 + 600000])
    assert.equal(c.bars[1].close, 200)
  })
  test('the summary names the instrument, timeframe, last, change, bars and marks, with plural forms', () => {
    const c = model(chartData({ changePct: 0.012, marks: [{ t: T0, kind: 'entry' }, { t: T0 + 1, kind: 'entry' }, { t: T0 + 2, kind: 'exit' }] })).charts[0]
    assert.equal(c.summary, 'ABC Corp, 5m: last 177.00, up 1.20%, 78 bars, 2 entries and 1 exit')
    const one = model(chartData({ bars: bars(1), changePct: -0.034, marks: [{ t: T0, kind: 'exit' }] })).charts[0]
    assert.equal(one.summary, 'ABC Corp, 5m: last 100.00, down 3.40%, 1 bar, 1 exit')
    assert.equal(one.changeText, '−3.40%')
    assert.equal(one.changeArrow, '▼')
    assert.equal(one.changeTone, 'neg')
  })
  test('the change carries a word, a zero change is unchanged, and no change leaves it out', () => {
    assert.match(model(chartData({ changePct: 0 })).charts[0].summary, /unchanged/)
    assert.equal(model(chartData({ changePct: 0 })).charts[0].changeArrow, '')
    const none = model(chartData({ timeframe: undefined })).charts[0]
    assert.equal(none.summary, 'ABC Corp: last 177.00, 78 bars')
    assert.equal(none.changeText, '')
  })
  test('a chart with no bars says so', () => {
    assert.equal(model(chartData({ bars: [] })).charts[0].summary, 'ABC Corp: no bars yet')
    assert.equal(model({ charts: [] }).charts.length, 0)
    assert.equal(model(null).charts.length, 0)
  })
  test('M and L show one chart and XL two', () => {
    const two = { charts: [chartData().charts[0], { ...chartData().charts[0], id: 'xyz', instrument: 'XYZ Ltd' }, { ...chartData().charts[0], id: 'third' }] }
    assert.equal(model(two, 'M').charts.length, 1)
    assert.equal(model(two, 'L').charts.length, 1)
    const xl = model(two, 'XL')
    assert.deepEqual(xl.charts.map((c) => c.id), ['abc', 'xyz'])
    // The group is named by the label and the headline; the full sentences belong to each chart's image.
    assert.equal(xl.ariaLabel, 'Watch, ABC Corp, last 177.00, XYZ Ltd, last 177.00')
    for (const c of xl.charts) assert.ok(!xl.ariaLabel.includes(c.summary))
  })
  test('timeframes are listed at L only, with the current one pressed', () => {
    const data = chartData({ timeframes: ['1m', '5m', '5m', '15m', 7] })
    assert.deepEqual(model(data, 'L').charts[0].timeframes, [{ value: '1m', on: false }, { value: '5m', on: true }, { value: '15m', on: false }])
    assert.deepEqual(model(data, 'M').charts[0].timeframes, [])
  })
  test('a volume profile is the host\'s object, passed through untouched, for the L chart only', () => {
    const volumeProfile = { version: 1, step: 0.5, sessions: [] }
    assert.equal(model({ ...chartData(), volumeProfile }, 'L').charts[0].profile, volumeProfile)
    assert.equal(model({ ...chartData(), volumeProfile }, 'M').charts[0].profile, null)
    assert.equal(model({ ...chartData(), volumeProfile: null }, 'L').charts[0].profile, null)
  })
  test('a different instrument or timeframe is a different series key', () => {
    const k = (over) => model(chartData(over)).charts[0].key
    assert.notEqual(k({}), k({ timeframe: '15m' }))
    assert.notEqual(k({}), k({ instrument: 'XYZ' }))
    assert.equal(k({}), k({ bars: bars(3) }))
  })
  test('the class model is the same function and the catalog entry is the RFC\'s', () => {
    assert.deepEqual(M.TsMiniChart.miniChartModel(chartData(), 'M', ctx), model(chartData()))
    const { tag, sizes, category } = WIDGETS.miniChart
    assert.deepEqual({ tag, sizes, category }, { tag: 'ts-mini-chart', sizes: ['M', 'L', 'XL'], category: 'Markets' })
    assert.equal(M.TsMiniChart.emptyText, EN['widget.miniChart.empty'])
  })
  test('the template has no words, a canvas box that is aria-hidden and a wrapper that is an image', () => {
    for (const v of ['M', 'L', 'XL']) {
      const html = M.TsMiniChart.template(v)
      assert.doesNotMatch(html, />[^<]*\p{L}[^<]*</u)
      assert.equal((html.match(/role="img"/g) || []).length, v === 'XL' ? 2 : 1)
      assert.equal((html.match(/class="cv"[^>]*aria-hidden="true"/g) || []).length, v === 'XL' ? 2 : 1)
      // Emberwick makes its container a tab stop unless it has a tabindex; inside aria-hidden that is unreachable.
      assert.equal((html.match(/class="cv"[^>]*tabindex="-1"/g) || []).length, v === 'XL' ? 2 : 1)
      assert.equal(html.includes('data-k="tfGroup"'), v === 'L')
      assert.doesNotMatch(html, /\sstyle=/)
    }
  })
})

// ── The wrapper, against a fake Emberwick ─────────────────────────────────

class FakeChart {
  static all = []
  constructor(host, opts) {
    this.host = host
    this.opts = opts
    this.calls = []
    this.destroyed = false
    FakeChart.all.push(this)
  }
  setData(b) { this.calls.push(['setData', b.length]) }
  update(b) { this.calls.push(['update', b.time]) }
  append(b) { this.calls.push(['append', b.time]) }
  setMarkers(m) { this.calls.push(['setMarkers', m.length]) }
  setTheme(th) { this.calls.push(['setTheme', th]) }
  setCountdown(on) { this.calls.push(['setCountdown', on]) }
  setAnimate(on) { this.calls.push(['setAnimate', on]) }
  resize() { this.calls.push(['resize']) }
  destroy() { this.destroyed = true; this.calls.push(['destroy']) }
  names() { return this.calls.map((c) => c[0]) }
}

class FakeProfile {
  constructor(chart, data) { this.chart = chart; this.data = data; this.calls = []; this.destroyed = false }
  setData(d) { check(d); this.data = d; this.calls.push(['setData', d]) }
  destroy() { this.destroyed = true }
}
function check(d) {
  if (d && !(d.step > 0)) throw new Error('step must be above 0')
  for (const s of (d && d.sessions) || []) if (s.start > s.end) throw new Error('session start is after its end')
}
const profiles = { created: [] }
const fakeProfiles = {
  createVolumeProfile(chart, o) {
    check(o.data)
    const p = new FakeProfile(chart, o.data)
    profiles.created.push(p)
    return p
  },
}

const GOOD = { version: 1, source: 'tick data', step: 0.5, sessions: [{ start: T0, end: T0 + 3600000, lo: 99, bins: [1, 4, 9, 4, 1] }] }

describe('the wrapper', () => {
  let real
  let imported
  const els = []

  const mount = (attrs = {}) => {
    const el = new M.TsMiniChart()
    els.push(el)
    el.setAttribute('label', 'Watch')
    el.setAttribute('time-zone', 'Asia/Kolkata')
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    // The real reader paints tokens onto a canvas; the browser spec covers it. Here a table stands in.
    el._readToken = () => (token) => (token === '--ts-profit' ? 'rgb(0, 140, 90)' : token === '--ts-loss' ? 'rgb(200, 40, 50)' : '')
    el.connect()
    return el
  }
  const settle = async () => {
    for (let i = 0; i < 4; i++) await tick()
  }
  const only = () => FakeChart.all.filter((c) => !c.destroyed)

  before(() => {
    real = { ...M.peers }
    globalThis.HTMLElement = FakeElement
  })
  after(() => {
    delete globalThis.HTMLElement
  })
  afterEach(() => {
    for (const el of els.splice(0)) if (el.isConnected) el.disconnect()
    Object.assign(M.peers, real)
    FakeChart.all.length = 0
    profiles.created.length = 0
    resetWarnings()
    mock.restoreAll()
  })
  const install = () => {
    imported = { chart: 0, profiles: 0 }
    M.peers.chart = async () => (imported.chart++, { Chart: FakeChart })
    M.peers.profiles = async () => (imported.profiles++, fakeProfiles)
  }

  test('nothing is imported until there are bars, and then once: setData with the bars and the markers', async () => {
    install()
    const el = mount()
    await settle()
    assert.equal(imported.chart, 0)
    el.data = chartData({ marks: [{ t: T0, kind: 'entry' }] })
    await settle()
    assert.equal(imported.chart, 1)
    const [chart] = only()
    assert.equal(chart.names().join(), 'setData,setMarkers')
    assert.deepEqual(chart.calls[0], ['setData', 78])
    assert.equal(chart.opts.watermark, false)
    assert.equal(chart.opts.countdown, false)
    assert.equal(chart.opts.timeZone, 'Asia/Kolkata')
    assert.equal(chart.opts.animate, true)
    assert.equal(chart.opts.theme.up, 'rgb(0, 140, 90)')
    // Only a profile loads the profiles entry.
    assert.equal(imported.profiles, 0)
  })

  test('the frozen widget clock reaches the countdown, and countdown follows the data', async () => {
    install()
    const el = mount()
    el.clock = () => 1234
    el.data = { ...chartData(), countdown: true }
    await settle()
    const [chart] = only()
    assert.equal(chart.opts.clock(), 1234)
    assert.equal(chart.opts.countdown, true)
    el.data = { ...chartData(), countdown: false }
    await settle()
    assert.deepEqual(chart.calls.at(-1), ['setCountdown', false])
  })

  test('later data is update/append, never a second setData, and the same data does nothing', async () => {
    install()
    const el = mount()
    const base = chartData()
    el.data = base
    await settle()
    const [chart] = only()
    const n = chart.calls.length
    el.data = { charts: [{ ...base.charts[0], bars: [...bars(77), bar(77, 150)] }] }
    await settle()
    assert.deepEqual(chart.calls.slice(n), [['update', bars(78)[77].time]])
    el.data = { charts: [{ ...base.charts[0], bars: [...bars(77), bar(77, 150), bar(78)] }] }
    await settle()
    assert.deepEqual(chart.calls.slice(n + 1), [['append', bar(78).time]])
    const m = chart.calls.length
    el.data = { charts: [{ ...base.charts[0], bars: [...bars(77), bar(77, 150), bar(78)] }] }
    await settle()
    assert.equal(chart.calls.length, m)
    assert.equal(only().length, 1)
    assert.equal(FakeChart.all.length, 1)
  })

  test('a different timeframe is a fresh setData; an earlier bar changing is too', async () => {
    install()
    const el = mount()
    el.data = chartData()
    await settle()
    const [chart] = only()
    el.data = chartData({ timeframe: '15m', bars: bars(40) })
    await settle()
    assert.deepEqual(chart.calls.at(-1), ['setData', 40])
    const edited = bars(40)
    edited[3] = bar(3, 190)
    el.data = chartData({ timeframe: '15m', bars: edited })
    await settle()
    assert.deepEqual(chart.calls.at(-1), ['setData', 40])
  })

  test('markers are set again only when they change', async () => {
    install()
    const el = mount()
    el.data = chartData({ marks: [{ t: T0, kind: 'entry' }] })
    await settle()
    const [chart] = only()
    el.data = chartData({ marks: [{ t: T0, kind: 'entry' }] })
    await settle()
    el.data = chartData({ marks: [{ t: T0, kind: 'entry' }, { t: T0 + 1, kind: 'exit' }] })
    await settle()
    assert.equal(chart.names().filter((n) => n === 'setMarkers').length, 2)
  })

  test('a theme attribute change calls setTheme with the re-read tokens, once for a burst', async () => {
    install()
    const el = mount()
    el.data = chartData()
    await settle()
    const [chart] = only()
    let table = { '--ts-profit': 'rgb(0, 140, 90)' }
    el._readToken = () => (token) => table[token] || ''
    el._onTheme()
    el._onTheme()
    await settle()
    assert.equal(chart.names().filter((n) => n === 'setTheme').length, 1)
    table = { '--ts-profit': 'rgb(1, 2, 3)' }
    el._onTheme()
    await settle()
    assert.equal(chart.calls.at(-1)[1].up, 'rgb(1, 2, 3)')
  })

  test('one observer on <html> serves every mini chart, for the theme attributes on any ancestor, and the system scheme', async () => {
    install()
    const seen = []
    const listeners = []
    globalThis.MutationObserver = class {
      constructor(cb) { this.cb = cb; seen.push(this) }
      observe(el, opts) { this.el = el; this.opts = opts }
      disconnect() { this.gone = true }
    }
    globalThis.matchMedia = (q) => ({ matches: false, media: q, addEventListener: (_, fn) => listeners.push(fn), removeEventListener: () => listeners.splice(0) })
    const html = { tag: 'html' }
    const wrapper = { tag: 'main', parentNode: html }
    try {
      const a = new M.TsMiniChart()
      const b = new M.TsMiniChart()
      els.push(a, b)
      a.parentNode = wrapper
      b.parentNode = html
      a.setAttribute('label', 'A')
      b.setAttribute('label', 'B')
      a.connect()
      b.connect()
      globalThis.document.documentElement = html
      let woke = []
      a._onTheme = () => woke.push('a')
      b._onTheme = () => woke.push('b')
      a._watchTheme()
      b._watchTheme()
      assert.equal(seen.length, 1)
      assert.equal(seen[0].el, html)
      assert.deepEqual(seen[0].opts, { attributes: true, attributeFilter: ['data-theme', 'class', 'data-ts-theme', 'data-ts-palette', 'style'], subtree: true })
      // A change on the wrapper wakes only the chart under it; one on <html> wakes both.
      const cb = seen[0].cb
      cb([{ target: wrapper }])
      assert.deepEqual(woke, ['a'])
      woke = []
      cb([{ target: html }])
      assert.deepEqual(woke.sort(), ['a', 'b'])
      woke = []
      cb([{ target: { tag: 'aside' } }])
      assert.deepEqual(woke, [])
      a.disconnect()
      assert.ok(!seen[0].gone, 'still watching for the other')
      b.disconnect()
      assert.ok(seen[0].gone)
      assert.equal(listeners.length, 0)
    } finally {
      delete globalThis.MutationObserver
      delete globalThis.matchMedia
      delete globalThis.document.documentElement
    }
  })

  test('a render that finds the same tokens does not call setTheme; one that finds a changed token does', async () => {
    install()
    const el = mount()
    el.data = chartData()
    await settle()
    const [chart] = only()
    el.data = chartData({ bars: bars(79) })
    await settle()
    assert.equal(chart.names().filter((n) => n === 'setTheme').length, 0)
    // Nothing moved on the page's attributes, only a token behind them (a stylesheet swap).
    el._readToken = () => (token) => (token === '--ts-profit' ? 'rgb(9, 9, 9)' : '')
    el.data = chartData({ bars: bars(80) })
    await settle()
    assert.equal(chart.names().filter((n) => n === 'setTheme').length, 1)
    el._onTheme()
    await settle()
    assert.equal(chart.names().filter((n) => n === 'setTheme').length, 1, 'an unchanged re-read is not repeated')
  })

  test('reduced motion is followed while the page is open', async () => {
    install()
    const listeners = {}
    const state = { reduce: false }
    globalThis.matchMedia = (q) => ({
      get matches() { return q.includes('reduced-motion') ? state.reduce : false },
      media: q,
      addEventListener: (_, fn) => { listeners[q] = fn },
      removeEventListener: () => { delete listeners[q] },
    })
    try {
      const el = mount()
      el.data = chartData()
      await settle()
      const [chart] = only()
      assert.equal(chart.opts.animate, true)
      state.reduce = true
      listeners['(prefers-reduced-motion: reduce)']()
      assert.deepEqual(chart.calls.at(-1), ['setAnimate', false])
      state.reduce = false
      listeners['(prefers-reduced-motion: reduce)']()
      assert.deepEqual(chart.calls.at(-1), ['setAnimate', true])
    } finally {
      delete globalThis.matchMedia
    }
  })

  test('while the import is pending the tile is busy and the plot shows its skeleton; neither stays', async () => {
    install()
    let release
    M.peers.chart = () => new Promise((resolve) => (release = () => resolve({ Chart: FakeChart })))
    const el = mount()
    el.data = chartData()
    await settle()
    assert.equal(el._section.getAttribute('aria-busy'), 'true')
    assert.equal(el.$('[data-k="load0"]').hasAttribute('hidden'), false)
    release()
    await settle()
    assert.equal(only().length, 1)
    assert.equal(el._section.getAttribute('aria-busy'), null)
    assert.equal(el.$('[data-k="load0"]').hasAttribute('hidden'), true)
  })

  test('disconnecting destroys the chart; reconnecting draws it again', async () => {
    install()
    const el = mount()
    el.data = chartData()
    await settle()
    const [first] = only()
    el.disconnect()
    assert.equal(first.destroyed, true)
    el.connect()
    await settle()
    assert.equal(only().length, 1)
    assert.notEqual(only()[0], first)
    assert.deepEqual(only()[0].calls[0], ['setData', 78])
  })

  test('a size change resizes, and a variant change makes a new chart in the new box', async () => {
    install()
    globalThis.ResizeObserver = class {
      constructor(cb) { this.cb = cb; globalThis.__ro = this }
      observe() {}
      disconnect() {}
    }
    try {
      const el = mount()
      el.data = chartData()
      await settle()
      const [chart] = only()
      globalThis.__ro.cb()
      assert.equal(chart.names().at(-1), 'resize')
      el.setAttribute('size', 'L')
      await settle()
      assert.equal(chart.destroyed, true)
      assert.equal(only().length, 1)
      assert.equal(only()[0].opts !== chart.opts, true)
    } finally {
      delete globalThis.ResizeObserver
      delete globalThis.__ro
    }
  })

  test('XL makes two charts, and an empty second slot makes none', async () => {
    install()
    const el = mount({ size: 'XL' })
    el.data = { charts: [chartData().charts[0], { ...chartData().charts[0], id: 'xyz', instrument: 'XYZ' }] }
    await settle()
    assert.equal(only().length, 2)
    assert.notEqual(only()[0].host, only()[1].host)
    el.data = chartData()
    await settle()
    assert.equal(only().length, 1)
  })

  test('a missing Emberwick is the error view and one development warning, however many tiles', async () => {
    const warn = mock.method(console, 'warn', () => {})
    M.peers.chart = async () => {
      throw new Error("Cannot find package 'emberwick'")
    }
    const a = mount()
    const b = mount()
    a.data = chartData()
    b.data = chartData()
    await settle()
    for (const el of [a, b]) {
      assert.equal(el._shown, 'view:error')
      assert.equal(el._section.querySelector('[data-k="message"]').textContent, EN['miniChart.noPeer'])
    }
    assert.equal(warn.mock.calls.filter((c) => /emberwick/.test(c.arguments[0])).length, 1)
    assert.equal(EN['miniChart.noPeer'], "The chart library isn't installed")
  })

  test('a peer with no Chart class is the same error', async () => {
    mock.method(console, 'warn', () => {})
    M.peers.chart = async () => ({})
    const el = mount()
    el.data = chartData()
    await settle()
    assert.equal(el._shown, 'view:error')
  })

  test('a volume profile is created once, updated on change, cleared when taken away, and loads its entry only then', async () => {
    install()
    const el = mount({ size: 'L' })
    el.data = chartData()
    await settle()
    assert.equal(imported.profiles, 0)
    assert.equal(profiles.created.length, 0)
    el.data = { ...chartData(), volumeProfile: GOOD }
    await settle()
    assert.equal(profiles.created.length, 1)
    assert.equal(profiles.created[0].data, GOOD)
    assert.equal(imported.profiles, 1)
    el.data = { ...chartData(), volumeProfile: GOOD }
    await settle()
    assert.equal(profiles.created.length, 1)
    assert.equal(profiles.created[0].calls.length, 0)
    const next = { ...GOOD, source: 'other' }
    el.data = { ...chartData(), volumeProfile: next }
    await settle()
    assert.deepEqual(profiles.created[0].calls, [['setData', next]])
    el.data = { ...chartData(), volumeProfile: null }
    await settle()
    assert.deepEqual(profiles.created[0].calls.at(-1), ['setData', null])
    assert.equal(profiles.created.length, 1)
  })

  test('an equal profile in a new object each tick neither reloads nor calls setData; a changed bin does', async () => {
    install()
    const el = mount({ size: 'L' })
    el.data = chartData()
    await settle()
    const copy = (over = {}) => JSON.parse(JSON.stringify({ ...GOOD, ...over }))
    el.data = { ...chartData(), volumeProfile: copy() }
    await settle()
    for (let i = 0; i < 5; i++) {
      el.data = { ...chartData(), volumeProfile: copy() }
      await settle()
    }
    assert.equal(profiles.created.length, 1)
    assert.equal(profiles.created[0].calls.length, 0)
    const moved = copy()
    moved.sessions[0].bins = [1, 4, 4, 9, 1]
    el.data = { ...chartData(), volumeProfile: moved }
    await settle()
    assert.equal(profiles.created[0].calls.length, 1)
    assert.equal(M.profileKey(copy()), M.profileKey(copy()))
    assert.notEqual(M.profileKey(copy()), M.profileKey(moved))
  })

  test('an equal bad profile re-sent each tick keeps the error view and makes no new chart', async () => {
    install()
    mock.method(console, 'warn', () => {})
    const el = mount({ size: 'L' })
    el.data = chartData()
    await settle()
    const bad = () => ({ ...GOOD, step: 0 })
    el.data = { ...chartData(), volumeProfile: bad() }
    await settle()
    assert.equal(el._shown, 'view:error')
    const made = FakeChart.all.length
    for (let i = 0; i < 5; i++) {
      el.data = { ...chartData(), volumeProfile: bad() }
      await settle()
      assert.equal(el._shown, 'view:error')
    }
    assert.equal(FakeChart.all.length, made)
  })

  test('a profile of version 2 is the badProfile view', async () => {
    install()
    mock.method(console, 'warn', () => {})
    const el = mount({ size: 'L' })
    el.data = chartData()
    await settle()
    el.data = { ...chartData(), volumeProfile: { ...GOOD, version: 2 } }
    await settle()
    assert.equal(el._shown, 'view:error')
    assert.equal(el._section.querySelector('[data-k="message"]').textContent, "The volume profile couldn't be drawn")
    assert.equal(profiles.created.length, 0)
    el.data = { ...chartData(), volumeProfile: GOOD }
    await settle()
    assert.equal(el._shown, 'L')
  })

  test('no profile is drawn at M, and an empty one loads nothing', async () => {
    install()
    const m = mount()
    m.data = { ...chartData(), volumeProfile: GOOD }
    const l = mount({ size: 'L' })
    l.data = { ...chartData(), volumeProfile: { version: 1, step: 1, sessions: [] } }
    await settle()
    assert.equal(profiles.created.length, 0)
    assert.equal(imported.profiles, 0)
  })

  test('a profile Emberwick rejects is the badProfile error view, until the host sends another', async () => {
    install()
    const warn = mock.method(console, 'warn', () => {})
    const el = mount({ size: 'L' })
    el.data = chartData()
    await settle()
    const bad = { ...GOOD, step: 0 }
    el.data = { ...chartData(), volumeProfile: bad }
    await settle()
    assert.equal(el._shown, 'view:error')
    assert.equal(el._section.querySelector('[data-k="message"]').textContent, "The volume profile couldn't be drawn")
    assert.equal(warn.mock.calls.length, 1)
    el.data = { ...chartData(), volumeProfile: GOOD }
    await settle()
    assert.equal(el._shown, 'L')
    assert.equal(profiles.created.length, 1)
    // A rejected replacement on a live profile fails the same way.
    el.data = { ...chartData(), volumeProfile: { ...GOOD, sessions: [{ ...GOOD.sessions[0], start: T0 + 9, end: T0 }] } }
    await settle()
    assert.equal(el._shown, 'view:error')
  })

  test('the loading and empty views drop the charts', async () => {
    install()
    const el = mount()
    el.data = chartData()
    await settle()
    const [chart] = only()
    el.data = null
    await settle()
    assert.equal(chart.destroyed, true)
    el.data = chartData()
    await settle()
    assert.equal(only().length, 1)
  })

  test('the wrapper is named by the summary, the empty box says why, and the figure carries a sign', async () => {
    install()
    const el = mount()
    el.data = chartData({ changePct: -0.034 })
    await settle()
    assert.equal(el.$('[data-k="plot0"]').getAttribute('aria-label'), 'ABC Corp, 5m: last 177.00, down 3.40%, 78 bars')
    assert.equal(el.$('[data-k="chg0V"]').textContent, '−3.40%')
    assert.equal(el.$('[data-k="chg0Ar"]').textContent, '▼')
    assert.equal(el.$('[data-k="chg0"]').getAttribute('class'), 'n sm neg')
    el.data = chartData({ bars: [] })
    await settle()
    assert.equal(el.$('[data-k="none0"]').hasAttribute('hidden'), false)
    assert.equal(el.$('[data-k="none0"]').textContent, 'ABC Corp: no bars yet')
    // Bars that went away empty the chart it has; they do not make a new one.
    assert.deepEqual(only()[0].calls.at(-1), ['setData', 0])
  })

  test('timeframe buttons appear only when listed in actions, and pressing one fires the action', async () => {
    install()
    const el = mount({ size: 'L' })
    const data = chartData({ timeframes: ['1m', '5m', '15m'] })
    el.data = data
    await settle()
    const group = el.$('[data-k="tfGroup"]')
    assert.equal(group.hasAttribute('hidden'), true)
    el.actions = ['timeframe']
    await settle()
    assert.equal(group.hasAttribute('hidden'), false)
    assert.equal(group.getAttribute('aria-label'), 'Timeframe')
    for (const v of ['1m', '5m', '15m']) assert.match(group.innerHTML, new RegExp(`data-tf="${v}"`))
    assert.match(group.innerHTML, /class="btn on" aria-pressed="true" data-tf="5m"/)
    const events = []
    el.addEventListener('ts-action', (e) => events.push(e.detail))
    const press = (value) => el._section.dispatch('click', { target: { closest: () => ({ getAttribute: () => value }) } })
    press('15m')
    press('5m')
    assert.deepEqual(events, [{ action: 'timeframe', id: 'abc', value: '15m' }])
  })

  test('the chart library is never named in the all-in entry or the shared widget code', () => {
    for (const file of ['index.js', 'widget.js', 'registry.js', 'html.js']) {
      assert.doesNotMatch(readFileSync(new URL(`../src/elements/${file}`, import.meta.url), 'utf8'), /emberwick/i, file)
    }
    const own = readFileSync(new URL('../src/elements/mini-chart.js', import.meta.url), 'utf8')
    assert.match(own, /import\('emberwick'\)/)
    assert.match(own, /import\('emberwick\/profiles'\)/)
    assert.doesNotMatch(own, /^import .*emberwick/m, 'Emberwick is imported lazily, never statically')
  })
})
