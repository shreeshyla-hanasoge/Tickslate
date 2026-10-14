import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { TsChart, chartModel, niceDomain, BOX, MAX_SERIES } from '../src/elements/series-chart.js'
import { EN, createFormatter, createMessages } from '../src/core/index.js'
import { checkShape, shapeMessage, resetWarnings } from '../src/elements/dev.js'

const fmt = createFormatter({ locale: 'en-US', currency: 'USD', timeZone: 'UTC' })
const ctx = { fmt, t: createMessages(), now: 0, label: 'Revenue and cost' }
const model = (data, variant = 'M') => chartModel(data, variant, ctx)

const D = (day) => Date.UTC(2026, 8, day)
const rows = [
  { date: '2026-09-01', revenue: 11800, cost: 7900 },
  { date: '2026-09-02', revenue: 12400, cost: 8100 },
]
const named = {
  series: [
    { name: 'revenue', points: [{ x: '2026-09-01', y: 11800 }, { x: '2026-09-02', y: 12400 }] },
    { name: 'cost', points: [{ x: '2026-09-01', y: 7900 }, { x: '2026-09-02', y: 8100 }] },
  ],
}

describe('without a DOM', () => {
  test('the class module loads and declares its contract', () => {
    assert.equal(typeof TsChart, 'function')
    assert.equal(TsChart.catalogKey, 'chart')
    assert.equal(TsChart.emptyText, 'No data yet')
    assert.deepEqual(TsChart.chartModel(named, 'M', ctx), model(named))
    assert.equal(TsChart.viewModel(named, 'M', ctx).chartLabel, model(named).ariaLabel)
  })

  test('the viewModel names the tile by its label alone, and the svg carries the summary once', () => {
    const vm = TsChart.viewModel(named, 'M', ctx)
    assert.equal(vm.ariaLabel, 'Revenue and cost')
    assert.ok(!vm.ariaLabel.includes(vm.chartLabel), 'the summary is not repeated in the region name')
    assert.equal(vm.chartLabel, 'revenue, last 12,400; cost, last 8,100')
    const empty = TsChart.viewModel({ series: [] }, 'M', ctx)
    assert.equal(empty.ariaLabel, 'Revenue and cost')
    assert.equal(empty.chartLabel, 'Revenue and cost, no data')
  })

  test('templates and skeletons exist for each size, with no colours', () => {
    for (const v of ['Wide', 'M', 'L', 'XL']) {
      assert.match(TsChart.template(v), /role="img"/)
      assert.match(TsChart.skeleton(v), /class="sk /)
    }
    assert.doesNotMatch(TsChart.styles, /#[0-9a-f]{3,8}\b|\b(rgb|hsl)a?\(/i)
    assert.doesNotMatch(TsChart.styles, /\b(left|right|margin-left|margin-right|padding-left|padding-right)\s*:/)
    assert.doesNotMatch(TsChart.template('M'), /style=/, 'no inline styles, for a strict style-src')
  })

  test('the sizes differ as the design sheet says', () => {
    const wide = TsChart.template('Wide')
    assert.doesNotMatch(wide, /data-k="lg1"|data-k="grid"|data-k="y0"/, 'Wide has no legend, gridlines or y labels')
    assert.match(wide, /data-k="first"/, 'but names the first series in the header')
    const m = TsChart.template('M')
    assert.match(m, /class="legend"/)
    assert.match(m, /data-k="grid"/)
    assert.match(m, /data-k="y0"/)
    assert.doesNotMatch(m, /class="rail"/)
    for (const v of ['L', 'XL']) {
      assert.match(TsChart.template(v), /class="rail"/)
      assert.doesNotMatch(TsChart.template(v), /class="legend"/)
    }
  })

  test('every size holds four series slots in the series colours, and the CSS names the tokens', () => {
    for (const v of ['Wide', 'M', 'L', 'XL']) {
      for (const n of [1, 2, 3, 4]) assert.match(TsChart.template(v), new RegExp(`class="sl c-${n}" data-k="l${n}"`))
    }
    for (const n of [1, 2, 3, 4]) assert.match(TsChart.styles, new RegExp(`\\.c-${n} \\{ --c: var\\(--ts-series-${n}\\)`))
    assert.match(TsChart.styles, /\.zl \{[^}]*var\(--ts-axis\)/)
  })

  test('dataShape lists both forms as optional and explains a wrong series', () => {
    assert.ok(Object.values(TsChart.dataShape).every((f) => f.optional === true))
    assert.equal(checkShape(named, TsChart.dataShape), null)
    assert.equal(checkShape({ rows, x: 'date', y: ['revenue'] }, TsChart.dataShape), null)
    const bad = checkShape({ series: [{ points: [] }, { points: [] }, { name: 'x', points: {} }] }, TsChart.dataShape)
    assert.equal(shapeMessage(bad), 'data.series[2].points should be array (got object)')
  })

  test('the empty text is the EN message', () => {
    assert.equal(TsChart.emptyText, EN['widget.chart.empty'])
    assert.equal(TsChart.emptyText, 'No data yet')
  })
})

describe('both data forms draw the same chart', () => {
  test('rows with two y keys equal named series', () => {
    const a = model({ rows, x: 'date', y: ['revenue', 'cost'] })
    const b = model(named)
    assert.deepEqual(a.series.map((s) => s.line), b.series.map((s) => s.line))
    assert.deepEqual(a.series.map((s) => s.last), ['12,400', '8,100'])
    assert.deepEqual(a.axis, b.axis)
    assert.deepEqual(a.ticks, b.ticks)
    assert.equal(a.zeroY, b.zeroY)
  })

  test('rows name each series by its key, or by name, and take a kind', () => {
    const vm = model({ rows, x: 'date', y: [{ key: 'revenue', name: 'Revenue', kind: 'area' }, 'cost'] })
    assert.deepEqual(vm.legend, [{ name: 'Revenue', index: 1 }, { name: 'cost', index: 2 }])
    assert.equal(vm.series[0].kind, 'area')
    assert.equal(vm.series[1].kind, 'line')
    assert.ok(vm.series[0].area.endsWith('Z'))
    assert.equal(vm.series[1].area, '')
  })

  test('y may be one key as a string', () => {
    const vm = model({ rows, x: 'date', y: 'revenue' })
    assert.equal(vm.series.length, 1)
    assert.equal(vm.series[0].last, '12,400')
  })

  test('the accessible name gives each series and its last value', () => {
    const vm = model({ rows: rows.map((r) => ({ ...r })), x: 'date', y: [{ key: 'revenue', name: 'Revenue' }, { key: 'cost', name: 'Cost' }] })
    assert.equal(vm.ariaLabel, 'Revenue, last 12,400; Cost, last 8,100')
  })
})

describe('reading', () => {
  test('x is read with toTime by default: seconds, ms, ISO and Date agree', () => {
    const t = D(3)
    const DAY = 86400000
    const pts = (xs) => ({ series: [{ name: 'a', points: xs.map((x, i) => ({ x, y: i })) }] })
    const forms = [
      [t / 1000, (t + DAY) / 1000],
      [t, t + DAY],
      [new Date(t), new Date(t + DAY)],
      ['2026-09-03', '2026-09-04'],
    ]
    const lines = forms.map((xs) => model(pts(xs)).series[0].line)
    assert.equal(new Set(lines).size, 1)
    assert.equal(model(pts(forms[0])).axis.start, 'Sep 3')
  })

  test('xType number reads x with toNumber and labels it as a number', () => {
    const vm = model({ xType: 'number', series: [{ name: 'a', points: [{ x: 0, y: 1 }, { x: '5', y: 2 }, { x: 10, y: 3 }] }] })
    assert.deepEqual(vm.axis, { start: '0', middle: '5', end: '10' })
    assert.equal(vm.dropped, 0)
    // a date string is not a number
    assert.equal(model({ xType: 'number', series: [{ name: 'a', points: [{ x: '2026-09-01', y: 1 }, { x: 1, y: 2 }] }] }).dropped, 1)
  })

  test('y is read with toNumber: numeric strings count, junk is dropped and counted', () => {
    const vm = model({ series: [{ name: 'a', points: [{ x: 1, y: '10' }, { x: 2, y: 'n/a' }, { x: 3, y: null }, { x: 4, y: '12.5' }, { y: 3 }, 'junk'] }] })
    assert.equal(vm.dropped, 4)
    assert.equal(vm.series[0].last, '12.5')
  })

  test('rows: an unreadable x drops the row once, a missing y drops that point', () => {
    const vm = model({
      rows: [
        { d: '2026-09-01', a: 1, b: 2 },
        { d: 'later', a: 5, b: 6 },
        { d: '2026-09-02', a: 3 },
        { d: '2026-09-03', a: 4, b: 'x' },
        null,
      ],
      x: 'd',
      y: ['a', 'b'],
    })
    // 'later' (1 row) + b missing (1) + b unreadable (1) + null row (1)
    assert.equal(vm.dropped, 4)
    assert.equal(vm.series[0].last, '4')
    assert.equal(vm.series[1].last, '2')
  })

  test('rows with no usable x key or no y keys give no series, never a throw', () => {
    // no x key: the series exists, empty, and every row is dropped
    assert.equal(model({ rows, y: 'revenue' }).series[0].last, '—')
    assert.equal(model({ rows, y: 'revenue' }).dropped, 2)
    assert.equal(model({ rows, x: 'date' }).series.length, 0)
    assert.equal(model({ rows, x: 'nope', y: 'revenue' }).dropped, 2)
  })

  test('points arriving out of order are sorted, not drawn doubling back', () => {
    const a = model({ series: [{ name: 'a', points: [{ x: 3, y: 30 }, { x: 1, y: 10 }, { x: 2, y: 20 }] }], xType: 'number' })
    const b = model({ series: [{ name: 'a', points: [{ x: 1, y: 10 }, { x: 2, y: 20 }, { x: 3, y: 30 }] }], xType: 'number' })
    assert.equal(a.series[0].line, b.series[0].line)
    assert.equal(a.series[0].last, '30')
  })

  test('garbage data never throws', () => {
    for (const data of [undefined, null, 5, 'x', [], {}, { series: 5 }, { series: [null, 3, {}] }, { rows: 'x' }, { series: [{ points: 'x' }] }]) {
      for (const v of ['Wide', 'M', 'L', 'XL']) assert.doesNotThrow(() => model(data, v))
    }
  })
})

describe('kinds and the series cap', () => {
  const mixed = {
    series: [
      { name: 'Daily', kind: 'area', points: [{ x: 1, y: 3 }, { x: 2, y: 5 }, { x: 3, y: 4 }] },
      { name: 'Average', kind: 'line', points: [{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 4.5 }] },
    ],
    xType: 'number',
  }

  test('line and area mix: only the area has a fill, and both share one scale', () => {
    const vm = model(mixed)
    assert.equal(vm.series[0].kind, 'area')
    assert.ok(vm.series[0].area.endsWith('Z'))
    assert.equal(vm.series[1].area, '')
    assert.match(vm.series[0].line, /^M3 /)
    assert.match(vm.series[1].line, /^M3 /)
    assert.equal(vm.zero, true, 'an area is anchored on zero')
  })

  test('an unknown kind is a line', () => {
    assert.equal(model({ xType: 'number', series: [{ name: 'a', kind: 'bar', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }] }).series[0].kind, 'line')
  })

  test('beyond four series only the first four render, and the extra is counted', () => {
    const many = { xType: 'number', series: Array.from({ length: 6 }, (_, i) => ({ name: `s${i}`, points: [{ x: 1, y: i }, { x: 2, y: i + 1 }] })) }
    const vm = model(many)
    assert.equal(MAX_SERIES, 4)
    assert.deepEqual(vm.series.map((s) => s.name), ['s0', 's1', 's2', 's3'])
    assert.equal(vm.legend.length, 4)
    assert.equal(vm.extra, 2)
    assert.equal(model(mixed).extra, 0)
  })

  test('a series without a name is called Series n', () => {
    assert.equal(model({ xType: 'number', series: [{ points: [{ x: 1, y: 1 }] }, { points: [] }] }).legend[1].name, 'Series 2')
  })
})

describe('edge cases', () => {
  test('an empty series shows a dash and says no data, and the others still draw', () => {
    const vm = model({ xType: 'number', series: [{ name: 'a', points: [{ x: 1, y: 1 }, { x: 2, y: 3 }] }, { name: 'b', points: [] }] })
    assert.equal(vm.series[1].line, '')
    assert.equal(vm.series[1].dot, '')
    assert.equal(vm.series[1].last, '—')
    assert.equal(vm.ariaLabel, 'a, last 3; b, no data')
    assert.notEqual(vm.series[0].line, '')
  })

  test('no points anywhere: no axes, no zero line, no ticks, and a name that says so', () => {
    const vm = model({ series: [] })
    assert.equal(vm.ariaLabel, 'Revenue and cost, no data')
    assert.deepEqual(vm.axis, { start: '', middle: '', end: '' })
    assert.equal(vm.zeroPath, '')
    assert.equal(vm.grid, '')
    assert.deepEqual(vm.ticks, [])
    assert.equal(vm.zeroY, BOX.height - 3)
  })

  test('a single point is a level line across when it is all there is', () => {
    const vm = model({ xType: 'number', series: [{ name: 'a', points: [{ x: 5, y: 7 }] }] })
    assert.match(vm.series[0].line, /^M3 [\d.]+ L397 [\d.]+$/)
    assert.match(vm.series[0].dot, /^M397 /)
    assert.equal(vm.series[0].last, '7')
    assert.equal(vm.axis.start, '5')
    assert.equal(vm.axis.end, '', 'one x has no middle or end')
  })

  test('a single point beside a longer series is only a dot where it falls', () => {
    const vm = model({ xType: 'number', series: [{ name: 'a', points: [{ x: 0, y: 1 }, { x: 10, y: 3 }] }, { name: 'b', points: [{ x: 5, y: 2 }] }] })
    assert.equal(vm.series[1].line, '')
    assert.equal(vm.series[1].area, '')
    assert.match(vm.series[1].dot, /^M200 [\d.]+h0$/)
  })

  test('a flat series draws and has ticks', () => {
    const vm = model({ xType: 'number', series: [{ name: 'a', points: [{ x: 1, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 5 }] }] })
    assert.match(vm.series[0].line, /^M3 /)
    assert.equal(vm.ticks.length, 4)
    assert.equal(new Set(vm.ticks).size, 4)
  })

  test('negative values draw a zero line, and its zeroY lies inside the plot', () => {
    const vm = model({ xType: 'number', series: [{ name: 'a', points: [{ x: 1, y: -4 }, { x: 2, y: 6 }] }] })
    assert.equal(vm.zero, true)
    assert.equal(vm.zeroPath, `M0 ${vm.zeroY}H400`)
    assert.ok(vm.zeroY > 3 && vm.zeroY < 97)
    assert.ok(vm.ticks.some((t) => t === '0'), vm.ticks.join())
    assert.ok(vm.ticks.some((t) => t.startsWith('−')))
  })

  test('lines far from zero have no zero line', () => {
    const vm = model({ xType: 'number', series: [{ name: 'a', points: [{ x: 1, y: 180 }, { x: 2, y: 190 }] }] })
    assert.equal(vm.zero, false)
    assert.equal(vm.zeroPath, '')
  })

  test('a long series is fine', () => {
    const points = Array.from({ length: 200000 }, (_, i) => ({ x: i, y: Math.sin(i / 99) * 50 }))
    const vm = model({ xType: 'number', series: [{ name: 'a', points }] })
    assert.ok(vm.series[0].line.length > 1000)
  })
})

describe('axes', () => {
  const one = (xs, extra = {}) => ({ series: [{ name: 'a', points: xs.map((x, i) => ({ x, y: i + 1 })) }], ...extra })

  test('a span under a day is labelled with fmt.time', () => {
    const vm = model(one([D(1) + 9.5 * 3600e3, D(1) + 12 * 3600e3, D(1) + 14.5 * 3600e3]))
    assert.deepEqual(vm.axis, { start: '09:30', middle: '12:00', end: '14:30' })
  })

  test('a longer span is labelled with days, in the formatter locale and zone', () => {
    const pts = one([D(1), D(15), D(29)])
    assert.deepEqual(model(pts).axis, { start: 'Sep 1', middle: 'Sep 15', end: 'Sep 29' })
    const de = chartModel(pts, 'M', { ...ctx, fmt: createFormatter({ locale: 'de-DE', timeZone: 'UTC' }) })
    assert.equal(de.axis.start, '1. Sept.')
    // 23:00 UTC on 1 Sep is already 2 Sep in Tokyo
    const tokyo = chartModel(one([D(1) + 23 * 3600e3, D(3), D(5)]), 'M', { ...ctx, fmt: createFormatter({ locale: 'en-US', timeZone: 'Asia/Tokyo' }) })
    assert.equal(tokyo.axis.start, 'Sep 2')
  })

  test('a span of a year or more carries the year', () => {
    const vm = model(one([D(1), Date.UTC(2027, 2, 1), Date.UTC(2027, 8, 1)]))
    assert.equal(vm.axis.start, 'Sep 1, 2026')
    assert.equal(vm.axis.end, 'Sep 1, 2027')
  })

  test('day formatters are cached, one per locale, zone and year form', () => {
    const real = Intl.DateTimeFormat
    let made = 0
    Intl.DateTimeFormat = function (...a) { made++; return new real(...a) }
    try {
      const f = createFormatter({ locale: 'fr-FR', timeZone: 'Europe/Paris' })
      const c = { ...ctx, fmt: f }
      const before = made
      chartModel(one([D(1), D(9), D(17)]), 'M', c)
      const first = made - before
      chartModel(one([D(2), D(9), D(18)]), 'M', c)
      chartModel(one([D(3), D(9), D(19)]), 'M', c)
      assert.equal(made - before, first, 'later renders build no new formatter')
    } finally {
      Intl.DateTimeFormat = real
    }
  })

  test('Wide has no y labels or gridlines; M and up have four and gridlines', () => {
    const data = one([D(1), D(15), D(29)])
    assert.deepEqual(model(data, 'Wide').ticks, [])
    assert.equal(model(data, 'Wide').grid, '')
    for (const v of ['M', 'L', 'XL']) {
      const vm = model(data, v)
      assert.equal(vm.ticks.length, 4)
      assert.match(vm.grid, /^M0 3H400/)
    }
  })

  test('tick labels are compact, and money, percent and unit follow the format', () => {
    const pts = (y1, y2) => ({ xType: 'number', series: [{ name: 'a', points: [{ x: 1, y: y1 }, { x: 2, y: y2 }] }] })
    assert.deepEqual(model(pts(0, 90000)).ticks, ['90K', '60K', '30K', '0'])
    assert.deepEqual(model({ ...pts(0, 90000), format: 'money' }).ticks, ['$90K', '$60K', '$30K', '$0'])
    assert.deepEqual(model({ ...pts(0, 0.3), format: 'percent' }).ticks, ['30%', '20%', '10%', '0%'])
    assert.deepEqual(model({ ...pts(0.1, 0.4), format: 'percent' }).ticks.length, 4)
    assert.deepEqual(model(pts(0, 1)).ticks.length, new Set(model(pts(0, 1)).ticks).size)
    assert.match(model({ ...pts(100, 200), unit: 'millisecond' }).ticks[0], /ms/)
  })

  test('the zero line and the gridlines never coincide', () => {
    const vm = model({ xType: 'number', series: [{ name: 'a', kind: 'area', points: [{ x: 1, y: 0 }, { x: 2, y: 9 }] }] })
    const ys = [...vm.grid.matchAll(/M0 ([\d.]+)H/g)].map((m) => Number(m[1]))
    assert.equal(ys.length, 3)
    assert.ok(!ys.includes(vm.zeroY))
  })
})

describe('niceDomain', () => {
  test('covers the range in three equal round steps', () => {
    assert.deepEqual(niceDomain(0, 90000).ticks, [0, 30000, 60000, 90000])
    assert.deepEqual(niceDomain(0, 9).ticks, [0, 3, 6, 9])
    for (const [lo, hi] of [[3800, 5120], [-4, 6], [0.001, 0.0042], [98.2, 99.9], [5, 5], [0, 0], [-7, -2], [1e9, 3.4e9]]) {
      const n = niceDomain(lo, hi)
      assert.ok(n.lo <= lo && n.hi >= hi, `${lo}..${hi} -> ${n.lo}..${n.hi}`)
      assert.equal(n.ticks.length, 4)
      const steps = n.ticks.slice(1).map((t, i) => Number((t - n.ticks[i]).toPrecision(9)))
      assert.equal(new Set(steps).size, 1, `${lo}..${hi} steps ${steps}`)
    }
  })

  test('zero is a tick whenever it is in range', () => {
    for (const [lo, hi] of [[-4, 6], [0, 7], [-13, 0], [-250, 900]]) assert.ok(niceDomain(lo, hi).ticks.includes(0), `${lo}..${hi}`)
  })
})

describe('formats', () => {
  const last = (data) => model({ xType: 'number', ...data, series: [{ name: 'a', points: [{ x: 1, y: data.y }] }] }).series[0].last
  test('the last value follows format, decimals and unit', () => {
    assert.equal(last({ y: 12400 }), '12,400')
    assert.equal(last({ y: 12400, format: 'money', decimals: 0 }), '$12,400')
    assert.equal(last({ y: 0.126, format: 'percent', decimals: 1 }), '12.6%')
    assert.equal(last({ y: 182, unit: 'millisecond' }), '182 ms')
    assert.equal(last({ y: 90000, format: 'duration' }), '1:30')
    assert.equal(last({ y: -5 }), '−5')
    assert.equal(last({ y: 3, format: 'bogus' }), '3')
  })

  test('asOf and live feed the header', () => {
    const vm = model({ ...named, asOf: Date.UTC(2026, 9, 12, 14, 5), live: true })
    assert.equal(vm.time, '14:05')
    assert.equal(vm.live, true)
    assert.equal(model(named).time, '')
    assert.equal(model({ ...named, live: 'yes' }).live, false)
  })
})

// ── update(): what the DOM sees ──────────────────────────────────────────

class FakeNode {
  constructor() {
    this.writes = []
    this._text = ''
    this.attrs = new Map()
  }
  get textContent() {
    return this._text
  }
  set textContent(v) {
    this.writes.push('text')
    this._text = v
  }
  set innerHTML(v) {
    throw new Error('update() must not write markup')
  }
  getAttribute(k) {
    return this.attrs.has(k) ? this.attrs.get(k) : null
  }
  setAttribute(k, v) {
    this.writes.push(k)
    this.attrs.set(k, String(v))
  }
  toggleAttribute(k, force) {
    const had = this.attrs.has(k)
    if (Boolean(force) !== had) this.writes.push(k)
    if (force) this.attrs.set(k, '')
    else this.attrs.delete(k)
    return Boolean(force)
  }
}

// update() needs $() and, for its warning, an identity, so it is driven
// without constructing an element.
const fakeWidget = (variant) => {
  const nodes = new Map()
  // Like the real $(), only what the variant's template holds exists.
  const html = TsChart.template(variant)
  const w = Object.create(TsChart.prototype)
  w.localName = 'ts-chart'
  w._uid = Math.random()
  w.getAttribute = (k) => (k === 'item' ? 'revenue' : null)
  w.$ = (sel) => {
    const k = /data-k="(\w+)"/.exec(sel)[1]
    if (!html.includes(`data-k="${k}"`)) return null
    if (!nodes.has(k)) nodes.set(k, new FakeNode())
    return nodes.get(k)
  }
  w.node = (k) => w.$(`[data-k="${k}"]`)
  w.total = () => [...nodes.values()].reduce((n, node) => n + node.writes.length, 0)
  w.written = () => new Set([...nodes.values()].flatMap((node) => node.writes))
  return w
}

const pointsOf = (n) => Array.from({ length: n }, (_, i) => ({ x: D(1) + i * 3600e3 * 6, y: 100 + ((i * 37) % 23) }))
const seriesData = (n, more = {}) => ({ series: [{ name: 'Revenue', kind: 'area', points: pointsOf(n) }, { name: 'Cost', points: pointsOf(n).map((p) => ({ ...p, y: p.y / 2 })) }], ...more })

describe('update()', () => {
  test('M writes paths, legend, axes and the svg label', () => {
    const w = fakeWidget('M')
    w.update(model(seriesData(12), 'M'), 'M')
    assert.equal(w.node('label').textContent, 'Revenue and cost')
    assert.match(w.node('l1').getAttribute('d'), /^M3 /)
    assert.ok(w.node('a1').getAttribute('d').endsWith('Z'))
    assert.equal(w.node('a2').getAttribute('d'), '')
    assert.equal(w.node('lg1').getAttribute('hidden'), null)
    assert.equal(w.node('lg3').getAttribute('hidden'), '')
    assert.equal(w.node('n2').textContent, 'Cost')
    assert.equal(w.node('sw1').getAttribute('class'), 'sw c-1 area')
    assert.equal(w.node('sw2').getAttribute('class'), 'sw c-2')
    assert.equal(w.node('svg').getAttribute('aria-label'), model(seriesData(12), 'M').ariaLabel)
    assert.equal(w.node('x0').textContent, 'Sep 1')
    assert.equal(w.node('y3').textContent, '0')
    assert.equal(w.node('dot').getAttribute('hidden'), '')
  })

  test('Wide names the first series in the header and has no legend', () => {
    const w = fakeWidget('Wide')
    w.update(model(seriesData(12), 'Wide'), 'Wide')
    assert.equal(w.node('first').getAttribute('hidden'), null)
    assert.equal(w.node('n1').textContent, 'Revenue')
    assert.equal(w.node('sw1').getAttribute('class'), 'sw c-1 area')
    assert.equal(w.node('lg1'), null)
    assert.equal(w.node('y0'), null)
  })

  test('L shows each series and its last value in the rail', () => {
    const w = fakeWidget('L')
    w.update(model(seriesData(12), 'L'), 'L')
    assert.equal(w.node('v1').textContent, model(seriesData(12), 'L').series[0].last)
    assert.equal(w.node('lg4').getAttribute('hidden'), '')
  })

  test('identical data writes nothing the second time', () => {
    for (const v of ['Wide', 'M', 'L', 'XL']) {
      const w = fakeWidget(v)
      w.update(model(seriesData(12), v), v)
      const first = w.total()
      assert.ok(first > 0)
      w.update(model(seriesData(12), v), v)
      assert.equal(w.total(), first, `${v}: identical data writes nothing`)
    }
  })

  test('replacing data with one more point rewrites only path d attributes and text', () => {
    for (const v of ['Wide', 'M', 'XL']) {
      const w = fakeWidget(v)
      w.update(model(seriesData(12), v), v)
      const snapshot = new Map()
      for (const k of ['a1', 'l1', 'd1', 'a2', 'l2', 'd2', 'grid', 'zero', 'x0', 'x1', 'x2', 'y0', 'y1', 'y2', 'y3', 'svg', 'v1', 'v2', 'n1', 'n2', 'sw1', 'sw2', 'lg1', 'first', 'label', 'time', 'meta', 'dot']) {
        const node = w.node(k)
        if (node) snapshot.set(k, node.writes.length)
      }
      w.update(model(seriesData(13), v), v)
      const names = new Set()
      for (const [k, count] of snapshot) for (const written of w.node(k).writes.slice(count)) names.add(written)
      assert.ok(names.size > 0, v)
      for (const name of names) assert.ok(['d', 'text', 'aria-label'].includes(name), `${v} wrote ${name}`)
    }
  })

  test('fewer series hide their legend items and clear their paths', () => {
    const w = fakeWidget('M')
    w.update(model(seriesData(12), 'M'), 'M')
    w.update(model({ series: [seriesData(12).series[0]] }, 'M'), 'M')
    assert.equal(w.node('lg2').getAttribute('hidden'), '')
    assert.equal(w.node('l2').getAttribute('d'), '')
    assert.equal(w.node('d2').getAttribute('d'), '')
  })

  test('nothing but textContent and attributes is ever written, whatever the data', () => {
    for (const v of ['Wide', 'M', 'L', 'XL']) {
      const w = fakeWidget(v)
      for (const data of [seriesData(12), { series: [] }, {}, { rows, x: 'date', y: ['revenue', 'cost'] }, { series: [{ name: 'a', points: [{ x: 1, y: 1 }] }] }, null]) {
        w.update(model(data, v), v)
      }
    }
  })

  test('more than four series warn once in development', () => {
    resetWarnings()
    const calls = []
    const real = console.warn
    console.warn = (m) => calls.push(m)
    try {
      const w = fakeWidget('M')
      const six = { xType: 'number', series: Array.from({ length: 6 }, (_, i) => ({ name: `s${i}`, points: [{ x: 1, y: i }, { x: 2, y: i }] })) }
      w.update(model(six), 'M')
      w.update(model(six), 'M')
      w.update(model(named), 'M')
      assert.deepEqual(calls, ['tickslate: <ts-chart item="revenue"> draws at most 4 series; 6 were given.'])
    } finally {
      console.warn = real
      resetWarnings()
    }
  })
})
