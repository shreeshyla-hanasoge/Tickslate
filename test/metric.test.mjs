import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { TsMetric, metricModel, STRINGS, SPARK_BOX } from '../src/elements/metric.js'
import { createFormatter } from '../src/core/index.js'

const fmt = createFormatter({ locale: 'en-US', currency: 'USD', timeZone: 'UTC' })
const ctx = { fmt, now: 0, label: 'Signups' }
const model = (data, variant = 'S') => metricModel(data, variant, ctx)

describe('without a DOM', () => {
  test('the class module loads and declares its contract', () => {
    assert.equal(typeof TsMetric, 'function')
    assert.equal(TsMetric.catalogKey, 'metric')
    assert.equal(TsMetric.emptyText, 'No data yet')
    assert.deepEqual(TsMetric.metricModel({ value: 1 }, 'S', ctx), model({ value: 1 }))
    assert.deepEqual(TsMetric.viewModel({ value: 1 }, 'S', ctx), model({ value: 1 }))
  })

  test('templates and skeletons exist for each size, with no colours', () => {
    for (const v of ['S', 'Wide', 'M']) {
      assert.match(TsMetric.template(v), /data-k="value"/)
      assert.match(TsMetric.skeleton(v), /class="sk /)
    }
    assert.doesNotMatch(TsMetric.styles, /#[0-9a-f]{3,8}\b|\b(rgb|hsl)a?\(/i)
    assert.doesNotMatch(TsMetric.styles, /\b(left|right|margin-left|margin-right|padding-left|padding-right)\s*:/)
  })

  test('the sizes differ as the RFC says', () => {
    assert.doesNotMatch(TsMetric.template('S'), /data-k="spark"|data-k="target"/)
    assert.match(TsMetric.template('Wide'), /data-k="spark"/)
    assert.doesNotMatch(TsMetric.template('Wide'), /data-k="target"/)
    assert.match(TsMetric.template('M'), /data-k="spark"/)
    assert.match(TsMetric.template('M'), /data-k="target"/)
    assert.match(TsMetric.template('M'), /data-k="caption"/)
  })

  test('the arrow is aria-hidden in every template', () => {
    for (const v of ['S', 'Wide', 'M']) assert.match(TsMetric.template(v), /<span aria-hidden="true" data-k="arrow">/)
  })

  test('dataShape requires value and lists the rest as optional', () => {
    const { value, ...rest } = TsMetric.dataShape
    assert.equal(value, 'numeric')
    assert.deepEqual(Object.keys(rest).sort(), [
      'asOf', 'caption', 'compact', 'compareLabel', 'decimals', 'delta', 'deltaPct', 'format', 'goodWhen',
      'live', 'percentPoints', 'previous', 'series', 'target', 'unit',
    ])
    assert.ok(Object.values(rest).every((f) => f.optional === true))
  })
})

describe('delta', () => {
  test('from previous: an absolute change and a percentage, the percentage shown', () => {
    const vm = model({ value: 1204, previous: 1075, compareLabel: 'vs last week' })
    assert.equal(vm.value, '1,204')
    assert.equal(vm.delta, '+12%')
    assert.equal(vm.arrow, '▲')
    assert.equal(vm.tone, 'pos')
    assert.equal(vm.compare, 'vs last week')
    assert.equal(vm.ariaLabel, 'Signups, 1,204, up 12% vs last week')
  })

  test('no previous and no delta: nothing, and the name is label and value', () => {
    const vm = model({ value: 1204 })
    assert.equal(vm.delta, '')
    assert.equal(vm.arrow, '')
    assert.equal(vm.tone, 'mut')
    assert.equal(vm.ariaLabel, 'Signups, 1,204')
  })

  test('a zero previous shows the absolute delta, never an infinity', () => {
    const vm = model({ value: 40, previous: 0 })
    assert.equal(vm.delta, '+40')
    assert.doesNotMatch(vm.delta, /∞|Infinity|%/)
    assert.equal(model({ value: 40, previous: '0' }).delta, '+40')
  })

  test('a fall carries the true minus and a down arrow, and its name says down', () => {
    const vm = model({ value: 900, previous: 1000 })
    assert.equal(vm.delta, '−10%')
    assert.equal(vm.delta.codePointAt(0), 0x2212)
    assert.equal(vm.arrow, '▼')
    assert.equal(vm.tone, 'neg')
    assert.equal(vm.ariaLabel, 'Signups, 900, down 10%')
  })

  test('small moves keep a decimal', () => {
    assert.equal(model({ value: 1013, previous: 1000 }).delta, '+1.3%')
  })

  test('a percentage over a negative previous uses its magnitude', () => {
    // −100 → −50 is a rise
    assert.equal(model({ value: -50, previous: -100 }).delta, '+50%')
    assert.equal(model({ value: -50, previous: -100 }).arrow, '▲')
  })

  test('delta wins over previous; deltaPct wins over both for the text', () => {
    assert.equal(model({ value: 100, previous: 50, delta: 5 }).delta, '+10%', 'delta 5 over previous 50')
    assert.equal(model({ value: 100, delta: 5 }).delta, '+5', 'no previous, so no percentage')
    assert.equal(model({ value: 100, previous: 50, delta: 5, deltaPct: 0.25 }).delta, '+25%')
    assert.equal(model({ value: 100, deltaPct: -0.2 }).delta, '−20%')
  })

  test('a zero delta has neither sign nor arrow, and is muted', () => {
    const vm = model({ value: 10, previous: 10 }, 'S')
    assert.equal(vm.delta, '0%')
    assert.equal(vm.arrow, '')
    assert.equal(vm.tone, 'mut')
    assert.equal(vm.ariaLabel, 'Signups, 10, no change')
  })

  test('a change that rounds to nothing is shown without a sign or arrow', () => {
    const vm = model({ value: 100000.2, previous: 100000, decimals: 0 })
    assert.equal(vm.arrow, '')
    assert.equal(vm.tone, 'mut')
    assert.doesNotMatch(vm.delta, /^[+−]/)
  })

  test('unreadable previous leaves no delta', () => {
    assert.equal(model({ value: 5, previous: 'n/a' }).delta, '')
    assert.equal(model({ value: 5, previous: null }).delta, '')
  })
})

describe('goodWhen', () => {
  const rise = { value: 12, previous: 10 }
  const fall = { value: 8, previous: 10 }
  test("'up' is the default", () => {
    assert.equal(model(rise).tone, 'pos')
    assert.equal(model(fall).tone, 'neg')
    assert.equal(model({ ...rise, goodWhen: 'sideways' }).tone, 'pos')
  })
  test("'down' swaps them, and the arrows stay with the direction", () => {
    const up = model({ ...rise, goodWhen: 'down' })
    const down = model({ ...fall, goodWhen: 'down' })
    assert.equal(up.tone, 'neg')
    assert.equal(up.arrow, '▲')
    assert.equal(down.tone, 'pos')
    assert.equal(down.arrow, '▼')
  })
  test("'neither' is always mut", () => {
    assert.equal(model({ ...rise, goodWhen: 'neither' }).tone, 'mut')
    assert.equal(model({ ...fall, goodWhen: 'neither' }).tone, 'mut')
  })
})

describe('formats', () => {
  test('money uses the resolved currency', () => {
    assert.equal(model({ value: 48210, format: 'money', decimals: 0 }).value, '$48,210')
    const inr = metricModel({ value: 48210, format: 'money', decimals: 0 }, 'S', { ...ctx, fmt: createFormatter({ locale: 'en-IN', currency: 'INR' }) })
    assert.equal(inr.value, '₹48,210')
  })
  test('money deltas carry the sign and the currency', () => {
    assert.equal(model({ value: 48210, delta: -3320, format: 'money', decimals: 0 }).delta, '−$3,320')
  })
  test('percent takes a fraction', () => {
    assert.equal(model({ value: 0.12, format: 'percent', decimals: 0 }).value, '12%')
    assert.equal(model({ value: 0.0042, format: 'percent' }).value, '0.42%')
  })
  test('percentPoints takes 0 to 100 for value, previous, delta and target', () => {
    const vm = model({ value: 12, previous: 10, format: 'percent', percentPoints: true, decimals: 0, target: 24 }, 'M')
    assert.equal(vm.value, '12%')
    assert.equal(vm.delta, '+20%')
    assert.equal(vm.targetPct, '50%')
    assert.equal(model({ value: 12, delta: 2, format: 'percent', percentPoints: true, decimals: 0 }).delta, '+2%', 'an absolute change of 2 points')
    assert.equal(model({ value: 99.95, format: 'percent', percentPoints: true }).value, '99.95%')
    // Without the format, the flag changes nothing.
    assert.equal(model({ value: 12, percentPoints: true }).value, '12')
  })
  test('deltaPct stays a fraction under percentPoints', () => {
    assert.equal(model({ value: 12, deltaPct: 0.1, format: 'percent', percentPoints: true }).delta, '+10%')
  })
  test('unit formats through fmt.unit', () => {
    assert.equal(model({ value: 182, unit: 'millisecond' }).value, '182 ms')
    assert.equal(model({ value: 3, unit: 'seats' }).value, '3 seats')
    assert.equal(model({ value: 182, previous: 196, unit: 'millisecond', deltaPct: undefined }).delta, '−7.1%')
    assert.equal(model({ value: 182, delta: 14, unit: 'millisecond' }).delta, '+14 ms')
  })
  test('duration takes milliseconds', () => {
    assert.equal(model({ value: 125000, format: 'duration' }).value, '2:05')
    assert.equal(model({ value: 90000, delta: -30000, format: 'duration' }).delta, '−0:30')
  })
  test('compact gives 1.2M at every size', () => {
    for (const v of ['S', 'Wide', 'M']) assert.equal(model({ value: 1234567, compact: true }, v).value, '1.2M')
    assert.equal(model({ value: 1234567, compact: true, format: 'money' }).value, '$1.2M')
    assert.equal(model({ value: 1234567, compact: true, unit: 'millisecond' }).value, '1.2M ms')
  })
  test('numeric strings and decimal objects are read', () => {
    assert.equal(model({ value: '1204', previous: '1075' }).delta, '+12%')
    assert.equal(model({ value: { toNumber: () => 7 } }).value, '7')
    assert.equal(model({ value: 'n/a' }).value, '—')
    assert.equal(model({ value: 'n/a' }).ariaLabel, 'Signups')
  })
  test('negative values use the true minus', () => {
    assert.equal(model({ value: -42 }).value, '−42')
    assert.equal(model({ value: -42, format: 'money', decimals: 0 }).value, '−$42')
  })
  test('a non-object never throws', () => {
    for (const bad of [undefined, null, 5, 'x', []]) assert.doesNotThrow(() => model(bad, 'M'))
  })
})

describe('the headline at S', () => {
  test('a long figure goes compact through fmt.fit; Wide and M keep it whole', () => {
    const big = { value: 123456789.5, format: 'money' }
    assert.equal(model(big, 'S').value, '$123.5M')
    assert.equal(model(big, 'Wide').value, '$123,456,789.50')
    assert.equal(model(big, 'M').value, '$123,456,789.50')
    assert.equal(model(big, 'S').value, fmt.fit(123456789.5, 10, { style: 'money', sign: 'negative' }))
  })
  test('the style matches the format', () => {
    assert.equal(model({ value: 1234567890, format: 'number' }, 'S').value, '1.2B')
    assert.equal(model({ value: 123.456789, format: 'percent' }, 'S').value, '12,345.68%')
    assert.equal(model({ value: 1234567.891, format: 'percent' }, 'S').value, fmt.fit(1234567.891, 10, { style: 'percent', sign: 'negative' }))
  })
  test('a short figure is untouched, and the name keeps the full form', () => {
    assert.equal(model({ value: 1204 }, 'S').value, '1,204')
    const vm = model({ value: 123456789.5, format: 'money' }, 'S')
    assert.equal(vm.ariaLabel, 'Signups, $123,456,789.50')
  })
  test('a unit figure that is too long goes compact', () => {
    assert.equal(model({ value: 123456789, unit: 'millisecond' }, 'S').value, '123.5M ms')
  })
})

describe('sparkline', () => {
  const plain = [3, 5, 4, 8, 6]
  test('none at S, none without a series', () => {
    assert.equal(model({ value: 1, series: plain }, 'S').line, '')
    assert.equal(model({ value: 1 }, 'Wide').line, '')
    assert.equal(model({ value: 1, series: [] }, 'M').line, '')
  })
  test('plain numbers are spaced evenly', () => {
    const vm = model({ value: 6, series: plain }, 'Wide')
    assert.match(vm.line, /^M4 /)
    const xs = [...vm.line.matchAll(/[ML]([\d.]+) /g)].map((m) => Number(m[1]))
    assert.equal(xs.length, 5)
    const step = xs[1] - xs[0]
    for (let i = 1; i < xs.length; i++) assert.ok(Math.abs(xs[i] - xs[i - 1] - step) < 0.2)
    assert.equal(xs[4], SPARK_BOX.width - 4)
  })
  test('the area closes along the bottom', () => {
    const vm = model({ value: 6, series: plain }, 'M')
    const floor = SPARK_BOX.height - 4
    assert.ok(vm.area.startsWith(vm.line))
    assert.match(vm.area, new RegExp(`L${SPARK_BOX.width - 4} ${floor} L4 ${floor} Z$`))
  })
  test('the highest value is at the top and the lowest at the bottom', () => {
    const vm = model({ value: 6, series: [1, 9, 5] }, 'Wide')
    const ys = [...vm.line.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]))
    assert.deepEqual(ys, [SPARK_BOX.height - 4, 4, 40])
  })
  test('{ t, v } points are placed by time, in any order, with seconds read as seconds', () => {
    const pts = [
      { t: 1700000200, v: 3 },
      { t: 1700000000, v: 1 },
      { t: 1700000100, v: 2 },
    ]
    const vm = model({ value: 3, series: pts }, 'Wide')
    assert.equal(vm.dropped, 0)
    const ys = [...vm.line.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]))
    assert.ok(ys[0] > ys[1] && ys[1] > ys[2], 'rising left to right')
    // A seconds and a millisecond reading of the same moments give the same line.
    const ms = pts.map((p) => ({ t: p.t * 1000, v: p.v }))
    assert.equal(model({ value: 3, series: ms }, 'Wide').line, vm.line)
    // ISO strings too
    const iso = [{ t: '2026-10-01', v: 1 }, { t: '2026-10-02', v: 2 }]
    assert.ok(model({ value: 2, series: iso }, 'Wide').line.startsWith('M'))
  })
  test('points that cannot be read are dropped and counted', () => {
    const vm = model({ value: 3, series: [1, 'x', 3, null, { t: 'never', v: 1 }] }, 'Wide')
    assert.equal(vm.dropped, 3)
    assert.ok(vm.line)
    assert.equal(model({ value: 3, series: [1, 2] }, 'S').dropped, 0, 'S draws nothing, so drops nothing')
  })
  test('one reading is not a trend', () => {
    assert.equal(model({ value: 3, series: [5] }, 'Wide').line, '')
  })
  test('a flat series is a level line, not NaN', () => {
    const vm = model({ value: 3, series: [4, 4, 4] }, 'Wide')
    assert.doesNotMatch(vm.line, /NaN/)
  })
  test('the label states where the trend went', () => {
    assert.equal(model({ value: 6, series: plain }, 'Wide').sparkLabel, 'Signups trend, from 3 to 6')
  })
  test('percentPoints scales the series with the value', () => {
    const vm = model({ value: 5, format: 'percent', percentPoints: true, decimals: 0, series: [5, 10] }, 'Wide')
    assert.equal(vm.sparkLabel, 'Signups trend, from 5% to 10%')
  })
})

describe('target and caption', () => {
  test('M shows the unclamped percentage and the bar fill', () => {
    const vm = model({ value: 1204, target: 1500, caption: 'New accounts' }, 'M')
    assert.equal(vm.targetPct, '80%')
    assert.equal(vm.targetWidth, 0.803)
    assert.equal(vm.caption, 'New accounts')
  })
  test('a figure over target reads over 100% and the bar stops at full', () => {
    const vm = model({ value: 150, target: 100 }, 'M')
    assert.equal(vm.targetPct, '150%')
    assert.equal(vm.targetWidth, 1)
  })
  test('a negative value gives an empty bar', () => {
    const vm = model({ value: -5, target: 100 }, 'M')
    assert.equal(vm.targetWidth, 0)
    assert.equal(vm.targetPct, '−5%')
  })
  test('no target, or one of 0 or less, shows no bar', () => {
    for (const target of [undefined, 0, -10, 'x', null]) {
      const vm = model({ value: 5, target }, 'M')
      assert.equal(vm.targetPct, '')
      assert.equal(vm.targetWidth, 0)
    }
  })
  test('S and Wide carry neither target nor caption', () => {
    for (const v of ['S', 'Wide']) {
      const vm = model({ value: 5, target: 10, caption: 'c' }, v)
      assert.equal(vm.targetPct, '')
      assert.equal(vm.caption, '')
    }
  })
})

describe('header', () => {
  test('live and asOf', () => {
    const vm = model({ value: 1, live: true, asOf: Date.UTC(2026, 9, 12, 14, 5) })
    assert.equal(vm.live, true)
    assert.equal(vm.time, '14:05')
    assert.equal(model({ value: 1 }).time, '')
    assert.equal(model({ value: 1, live: 'yes' }).live, false)
  })
  test('the strings live in one frozen object', () => {
    assert.ok(Object.isFrozen(STRINGS))
    assert.equal(STRINGS.empty, 'No data yet')
  })
})

// ── update(): what the DOM sees ──────────────────────────────────────────

class FakeNode {
  constructor() {
    this.writes = 0
    this._text = ''
    this.attrs = new Map()
  }
  get textContent() {
    return this._text
  }
  set textContent(v) {
    this.writes++
    this._text = v
  }
  set innerHTML(v) {
    throw new Error('update() must not write markup')
  }
  getAttribute(k) {
    return this.attrs.has(k) ? this.attrs.get(k) : null
  }
  setAttribute(k, v) {
    this.writes++
    this.attrs.set(k, String(v))
  }
  toggleAttribute(k, force) {
    const had = this.attrs.has(k)
    if (Boolean(force) !== had) this.writes++
    if (force) this.attrs.set(k, '')
    else this.attrs.delete(k)
    return Boolean(force)
  }
}

// update() only needs $(), so it is driven here without constructing an element.
const fakeWidget = () => {
  const nodes = new Map()
  const w = Object.create(TsMetric.prototype)
  w.$ = (sel) => {
    if (!nodes.has(sel)) nodes.set(sel, new FakeNode())
    return nodes.get(sel)
  }
  w.node = (k) => w.$(`[data-k="${k}"]`)
  w.total = () => [...nodes.values()].reduce((n, node) => n + node.writes, 0)
  return w
}

describe('update()', () => {
  const data = {
    value: 1204, previous: 1075, compareLabel: 'vs last week', series: [3, 5, 4, 8, 6], target: 1500, caption: 'New accounts',
    live: true, asOf: Date.UTC(2026, 9, 12, 14, 5),
  }

  test('M writes text and attributes into the nodes', () => {
    const w = fakeWidget()
    w.update(model(data, 'M'), 'M')
    assert.equal(w.node('label').textContent, 'Signups')
    assert.equal(w.node('value').textContent, '1,204')
    assert.equal(w.node('delta').textContent, '+12%')
    assert.equal(w.node('arrow').textContent, '▲')
    assert.equal(w.node('change').getAttribute('class'), 'n pos')
    assert.equal(w.node('compare').textContent, 'vs last week')
    assert.equal(w.node('time').textContent, '14:05')
    assert.equal(w.node('dot').hasOwnProperty('x'), false)
    assert.equal(w.node('dot').getAttribute('hidden'), null, 'live shows the dot')
    assert.equal(w.node('deltabox').getAttribute('hidden'), null)
    assert.match(w.node('line').getAttribute('d'), /^M4 /)
    assert.equal(w.node('spark').getAttribute('class'), 'pos')
    assert.equal(w.node('spark').getAttribute('aria-label'), 'Signups trend, from 3 to 6')
    assert.equal(w.node('tpct').textContent, '80%')
    assert.equal(w.node('fill').getAttribute('width'), '80.3')
    assert.equal(w.node('target').getAttribute('hidden'), null)
    assert.equal(w.node('caption').textContent, 'New accounts')
  })

  test('S hides what it has none of, and touches nothing it does not draw', () => {
    const w = fakeWidget()
    w.update(model({ value: 5 }, 'S'), 'S')
    assert.equal(w.node('deltabox').getAttribute('hidden'), '')
    assert.equal(w.node('dot').getAttribute('hidden'), '')
    assert.equal(w.node('line').writes, 0)
    assert.equal(w.node('fill').writes, 0)
  })

  test('a repeat render writes nothing, and a tick writes only what changed', () => {
    const w = fakeWidget()
    const vm = model(data, 'M')
    w.update(vm, 'M')
    const first = w.total()
    assert.ok(first > 0)
    w.update(model(data, 'M'), 'M')
    assert.equal(w.total(), first, 'identical data: no writes at all')

    w.update(model({ ...data, value: 1210 }, 'M'), 'M')
    // value, delta, target text, bar width; the sparkline and caption are as they were
    const after = model({ ...data, value: 1210 }, 'M')
    assert.equal(w.node('value').textContent, '1,210')
    assert.equal(w.node('line').writes, 1)
    assert.ok(w.total() - first <= 5, `only the changed nodes were written (${w.total() - first})`)
    assert.equal(after.delta, w.node('delta').textContent)
  })

  test('nothing but textContent and attributes is ever written', () => {
    // FakeNode throws on innerHTML; a full cycle through every size must not trip it.
    for (const v of ['S', 'Wide', 'M']) {
      const w = fakeWidget()
      w.update(model(data, v), v)
      w.update(model({ ...data, value: 900, goodWhen: 'down', series: [] }, v), v)
      w.update(model({ value: 'n/a' }, v), v)
    }
  })

  test('tone and arrow follow the data in place', () => {
    const w = fakeWidget()
    w.update(model({ value: 8, previous: 10 }, 'Wide'), 'Wide')
    assert.equal(w.node('change').getAttribute('class'), 'n neg')
    assert.equal(w.node('arrow').textContent, '▼')
    w.update(model({ value: 8, previous: 8 }, 'Wide'), 'Wide')
    assert.equal(w.node('change').getAttribute('class'), 'n mut')
    assert.equal(w.node('arrow').textContent, '')
  })
})
