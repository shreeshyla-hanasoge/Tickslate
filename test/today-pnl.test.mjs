import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { TsTodayPnl, todayPnlModel, HEADLINE_CHARS, CHART_BOX } from '../src/elements/today-pnl.js'
import { createFormatter, createMessages } from '../src/core/index.js'

const fmt = createFormatter({ locale: 'en-IN', currency: 'INR', timeZone: 'Asia/Kolkata' })
const ctx = { fmt, t: createMessages(), now: 0, label: "Today's P&L" }

// 2026-03-02 (a Monday) in IST, built from UTC so the test doesn't depend on the machine's zone.
const ist = (h, m) => Date.UTC(2026, 2, 2, h, m) - (5 * 60 + 30) * 60000
const day = {
  net: 2185.65,
  realized: 1860,
  unrealized: 412.95,
  fees: 87.3,
  closedCount: 3,
  openCount: 1,
  asOf: ist(11, 42),
  live: true,
}
const intraday = [
  { t: ist(9, 15), v: 0 },
  { t: ist(9, 45), v: -715 },
  { t: ist(10, 30), v: 400 },
  { t: ist(11, 42), v: 2185.65 },
]
const withChart = { ...day, intraday, window: { from: ist(9, 15), to: ist(15, 30) } }
const model = (data, variant) => todayPnlModel(data, variant, ctx)

describe('without a DOM', () => {
  test('the class module loads and declares its catalog key', () => {
    assert.equal(typeof TsTodayPnl, 'function')
    assert.equal(TsTodayPnl.catalogKey, 'todayPnl')
    for (const v of ['S', 'Wide', 'M']) assert.ok(TsTodayPnl.template(v).includes('data-k="net"'))
  })

  test('static viewModel is the pure model', () => {
    assert.deepEqual(TsTodayPnl.viewModel(day, 'S', ctx), model(day, 'S'))
  })

  test('templates carry no data and no colours', () => {
    for (const v of ['S', 'Wide', 'M']) assert.doesNotMatch(TsTodayPnl.template(v), /#[0-9a-f]{3,8}\b|₹|rgb\(/i)
    assert.doesNotMatch(TsTodayPnl.styles, /#[0-9a-f]{3,8}\b|\b(rgb|hsl)a?\(/i)
  })
})

describe('S', () => {
  const vm = model(day, 'S')
  test('heading, time, headline and footer', () => {
    assert.equal(vm.label, 'Today')
    assert.equal(vm.live, true)
    assert.equal(vm.time, '11:42')
    assert.equal(vm.net, '+₹2,185.65')
    assert.equal(vm.footer, '3 closed · 1 open · fees ₹87.30')
  })
  test('the tile is named by label and headline', () => {
    assert.equal(vm.ariaLabel, "Today's P&L, +₹2,185.65")
  })
  test('footer parts that are missing are left out', () => {
    assert.equal(model({ ...day, closedCount: undefined }, 'S').footer, '1 open · fees ₹87.30')
    assert.equal(model({ ...day, openCount: undefined, fees: 'x' }, 'S').footer, '3 closed')
    assert.equal(model({ ...day, closedCount: undefined, openCount: undefined }, 'S').footer, 'fees ₹87.30')
    assert.equal(model({ net: 1, realized: 1, unrealized: 0, fees: null }, 'S').footer, '')
  })
  test('no live flag and no asOf means no dot and no time', () => {
    const quiet = model({ ...day, live: undefined, asOf: undefined }, 'S')
    assert.equal(quiet.live, false)
    assert.equal(quiet.time, '')
  })
  test('a long value switches to compact so it fits', () => {
    const big = model({ ...day, net: 18_45_000.5 }, 'S')
    assert.ok(big.net.length <= HEADLINE_CHARS.S, big.net)
    assert.match(big.net, /^\+₹18\.5L$/)
    // The accessible name keeps the full figure.
    assert.match(big.ariaLabel, /\+₹18,45,000\.50$/)
  })
})

describe('Wide', () => {
  const vm = model(day, 'Wide')
  test('heading uses the label; the note says net of fees with the time', () => {
    assert.equal(vm.label, "Today's P&L")
    assert.equal(vm.note, 'net of fees · 11:42')
    assert.equal(vm.net, '+₹2,185.65')
  })
  test('rows are signed and fees are a deduction', () => {
    assert.equal(vm.realized, '+₹1,860.00')
    assert.equal(vm.unrealized, '+₹412.95')
    assert.equal(vm.fees, '−₹87.30')
  })
  test('fees are a deduction however the host signs them', () => {
    assert.equal(model({ ...day, fees: -87.3 }, 'Wide').fees, '−₹87.30')
    assert.equal(model({ ...day, fees: '87.30' }, 'Wide').fees, '−₹87.30')
    assert.equal(model({ ...day, fees: 0 }, 'Wide').fees, '₹0.00')
  })
  test('the note drops the time when there is no asOf', () => {
    assert.equal(model({ ...day, asOf: undefined }, 'Wide').note, 'net of fees')
  })
  test('a host label becomes the heading', () => {
    assert.equal(todayPnlModel(day, 'Wide', { ...ctx, label: 'Desk P&L' }).label, 'Desk P&L')
    assert.equal(todayPnlModel(day, 'Wide', { ...ctx, label: 'Desk P&L' }).ariaLabel, 'Desk P&L, +₹2,185.65')
  })
  test('fit allows 11 characters, then goes compact', () => {
    assert.deepEqual({ ...HEADLINE_CHARS }, { S: 10, Wide: 11, M: 14 })
    assert.equal(model({ ...day, net: -12345.67 }, 'Wide').net, '−₹12,345.67')
    assert.equal(model({ ...day, net: 12345.67 }, 'Wide').net, '+₹12,345.67')
    assert.equal(model({ ...day, net: 123456.78 }, 'Wide').net, '+₹1.2L')
    assert.equal(model({ ...day, net: 12345678.9 }, 'Wide').net, '+₹1.2Cr')
  })
})

describe('sign and colour', () => {
  test('gain is pos, loss is neg, exactly zero has no colour', () => {
    assert.equal(model(day, 'S').netTone, 'pos')
    assert.equal(model({ ...day, net: -250 }, 'S').netTone, 'neg')
    assert.equal(model({ ...day, net: 0 }, 'S').netTone, '')
    assert.equal(model({ ...day, net: '0' }, 'S').netTone, '')
  })
  test('a loss carries the true minus, a gain a plus, zero neither', () => {
    assert.equal(model({ ...day, net: -250 }, 'S').net, '−₹250.00')
    assert.equal(model({ ...day, net: 250 }, 'S').net, '+₹250.00')
    assert.equal(model({ ...day, net: 0 }, 'S').net, '₹0.00')
  })
  test('realised and unrealised are coloured independently', () => {
    const vm = model({ ...day, realized: 100, unrealized: -50 }, 'Wide')
    assert.equal(vm.realizedTone, 'pos')
    assert.equal(vm.unrealizedTone, 'neg')
  })
  test('net is shown as given, not recomputed', () => {
    assert.equal(model({ ...day, net: 5 }, 'Wide').net, '+₹5.00')
  })
})

describe('M', () => {
  const vm = model(withChart, 'M')
  test('heading, counts and the low/high summary', () => {
    assert.equal(vm.label, "Today's P&L")
    assert.equal(vm.counts, '3 closed · 1 open')
    assert.equal(vm.net, '+₹2,185.65')
    assert.equal(vm.summary, 'low −₹715 at 09:45 · high now')
    assert.equal(vm.realized, '+₹1,860.00')
    assert.equal(vm.fees, '−₹87.30')
  })
  test('says where the high was when it is not now', () => {
    const pts = [...intraday.slice(0, 3), { t: ist(11, 42), v: 200 }]
    assert.equal(model({ ...withChart, intraday: pts }, 'M').summary, 'low −₹715 at 09:45 · high +₹400 at 10:30')
  })
  test('a day that ends at its low says so', () => {
    const pts = [{ t: ist(9, 15), v: 0 }, { t: ist(10, 0), v: 300 }, { t: ist(11, 0), v: -100 }]
    assert.equal(model({ ...withChart, intraday: pts }, 'M').summary, 'low −₹100 now · high +₹300 at 10:00')
  })
  test('the chart has paths and a label that states the result', () => {
    const c = vm.chart
    assert.equal(c.empty, false)
    assert.match(c.line, /^M[\d.]+ [\d.]+( L[\d.]+ [\d.]+){3}$/)
    assert.match(c.area, / Z$/)
    assert.equal(c.ariaLabel, 'Intraday P&L: low −₹715, now +₹2,185.65')
    assert.ok(c.zeroY > 0 && c.zeroY < CHART_BOX.height)
  })
  test('the window is the x domain, so an in-progress day stops short of the right edge', () => {
    const c = vm.chart
    assert.deepEqual(c.ticks, ['09:15', '12:30', '15:30'])
    assert.ok(c.lastX > 0 && c.lastX < CHART_BOX.width - 20, String(c.lastX))
    assert.match(c.line, /^M4 /)
    // Without a window the curve fills the box instead.
    const full = model({ ...withChart, window: undefined }, 'M').chart
    assert.equal(full.lastX, CHART_BOX.width - 4)
    assert.deepEqual(full.ticks, ['09:15', '10:30', '11:42'])
  })
  test('the middle label is a round time at its true place, clear of the end labels', () => {
    const at = (from, to) => model({ ...withChart, window: { from, to } }, 'M').chart
    // 09:15–15:40: the middle is 12:27:30, so 12:30.
    const long = at(ist(9, 15), ist(15, 40))
    assert.deepEqual(long.ticks, ['09:15', '12:30', '15:40'])
    const frac = (ist(12, 30) - ist(9, 15)) / (ist(15, 40) - ist(9, 15))
    assert.ok(Math.abs(long.midAt - ((4 + frac * 367) / 375) * 100) < 0.1, String(long.midAt))
    // A short window with no half hour inside falls back to quarter hours...
    assert.deepEqual(at(ist(9, 16), ist(9, 44)).ticks, ['09:16', '09:30', '09:44'])
    assert.deepEqual(at(ist(9, 31), ist(9, 59)).ticks, ['09:31', '09:45', '09:59'])
    // ...and to the raw middle when no round time is inside at all.
    assert.deepEqual(at(ist(9, 16), ist(9, 28)).ticks, ['09:16', '09:22', '09:28'])
    // Off-centre round times are clamped away from the end labels; a flat window centres.
    assert.equal(at(ist(9, 29), ist(15, 29)).midAt >= 14, true)
    const edge = at(ist(9, 29), ist(9, 59)).midAt
    assert.ok(edge >= 14 && edge <= 86, String(edge))
    assert.equal(at(ist(10, 0), ist(10, 0)).midAt, 50)
    assert.ok(model({ ...day, intraday: [] }, 'M').chart.midAt === 50)
  })
  test('marks sit on the curve at their time and carry their label', () => {
    const c = model({ ...withChart, marks: [{ t: ist(9, 45), kind: 'entry', label: 'Long NIFTY' }, { t: ist(11, 42), kind: 'exit' }] }, 'M').chart
    assert.equal(c.marks.length, 2)
    assert.equal(c.marks[0].kind, 'entry')
    assert.equal(c.marks[0].title, 'Long NIFTY · 09:45')
    assert.equal(c.marks[1].title, 'Exit · 11:42')
    // 09:45 is 30 of 375 minutes into the window; the low is the bottom of the plot.
    assert.ok(Math.abs(c.marks[0].left - ((4 + (30 / 375) * 367) / 375) * 100) < 0.1, String(c.marks[0].left))
    assert.ok(c.marks[0].top > 90 && c.marks[0].top <= 100, String(c.marks[0].top))
    assert.ok(c.marks[1].top < 10)
  })
  test('a mark between readings is interpolated; outside the readings or the window is skipped', () => {
    const mid = model({ ...withChart, marks: [{ t: ist(10, 7), kind: 'entry' }] }, 'M').chart.marks[0]
    const low = model({ ...withChart, marks: [{ t: ist(9, 45), kind: 'entry' }] }, 'M').chart.marks[0]
    const high = model({ ...withChart, marks: [{ t: ist(10, 30), kind: 'entry' }] }, 'M').chart.marks[0]
    assert.ok(mid.top < low.top && mid.top > high.top)
    const none = model({ ...withChart, marks: [{ t: ist(8, 0), kind: 'entry' }, { t: ist(14, 0), kind: 'exit' }, { t: 'x', kind: 'exit' }, null] }, 'M').chart.marks
    assert.deepEqual(none, [])
  })
  test('empty marks and no marks are fine', () => {
    assert.deepEqual(model({ ...withChart, marks: [] }, 'M').chart.marks, [])
    assert.deepEqual(model(withChart, 'M').chart.marks, [])
  })
  test('without intraday the chart is empty with a message, and the rest still shows', () => {
    for (const intra of [undefined, [], [intraday[0]], 'nope']) {
      const m = model({ ...day, intraday: intra, window: withChart.window }, 'M')
      assert.equal(m.chart.empty, true)
      assert.equal(m.chart.message, 'No intraday data yet')
      assert.equal(m.chart.line, '')
      assert.equal(m.summary === '' || intra.length === 1, true)
      assert.equal(m.net, '+₹2,185.65')
      assert.equal(m.counts, '3 closed · 1 open')
      assert.deepEqual(m.chart.ticks, ['09:15', '12:30', '15:30'])
    }
    assert.deepEqual(model(day, 'M').chart.ticks, ['', '', ''])
  })
  test('readings out of order are sorted and bad ones dropped', () => {
    const shuffled = [intraday[3], { t: 'x', v: 1 }, intraday[0], { t: ist(10, 0), v: NaN }, intraday[2], intraday[1]]
    assert.deepEqual(model({ ...withChart, intraday: shuffled }, 'M').chart, vm.chart)
  })
  test('numeric strings are accepted everywhere', () => {
    const strs = {
      ...withChart,
      net: '2185.65',
      realized: '1860.00',
      unrealized: '412.95',
      fees: '87.30',
      intraday: intraday.map((p) => ({ t: p.t, v: String(p.v) })),
    }
    assert.deepEqual(model(strs, 'M'), vm)
  })
})

describe('garbage in', () => {
  const junk = [{}, { net: 'abc' }, { net: null, realized: undefined, fees: {} }, { net: NaN, intraday: [{}, null, 3], marks: 'x', window: 5 }, null, undefined, { net: Infinity, closedCount: -3, openCount: 'many' }]
  for (const v of ['S', 'Wide', 'M']) {
    test(`${v} never throws and shows dashes`, () => {
      for (const data of junk) {
        const vm = model(data, v)
        assert.equal(typeof vm.net, 'string')
        assert.equal(vm.ariaLabel, "Today's P&L")
      }
      assert.equal(model({}, v).net, '—')
      assert.equal(model({}, v).netTone, '')
    })
  }
})

describe('data shapes (RFC 0002 §4)', () => {
  const secs = (v) => v / 1000
  const asSeconds = {
    ...withChart,
    asOf: secs(withChart.asOf),
    intraday: withChart.intraday.map((p) => ({ ...p, t: secs(p.t) })),
    window: { from: secs(withChart.window.from), to: secs(withChart.window.to) },
  }

  test('second timestamps give the same asOf and axis as ms', () => {
    const a = model(withChart, 'M')
    const b = model(asSeconds, 'M')
    assert.equal(b.time, a.time)
    assert.deepEqual(b.chart.ticks, a.chart.ticks)
    assert.equal(b.chart.line, a.chart.line)
    assert.equal(b.chart.midAt, a.chart.midAt)
    assert.equal(model(asSeconds, 'Wide').note, model(withChart, 'Wide').note)
  })

  test('draws from ISO-string readings, marks and window', () => {
    const iso = (t) => new Date(t).toISOString().replace('Z', '000Z')
    const data = {
      ...withChart,
      asOf: iso(withChart.asOf),
      intraday: withChart.intraday.map((p) => ({ ...p, t: iso(p.t) })),
      window: { from: iso(withChart.window.from), to: iso(withChart.window.to) },
      marks: [{ t: iso(ist(9, 45)), kind: 'entry' }],
    }
    const a = model({ ...withChart, marks: [{ t: ist(9, 45), kind: 'entry' }] }, 'M')
    const b = model(data, 'M')
    assert.equal(b.chart.empty, false)
    assert.equal(b.chart.line, a.chart.line)
    assert.deepEqual(b.chart.ticks, a.chart.ticks)
    assert.deepEqual(b.chart.marks, a.chart.marks)
    assert.equal(b.time, a.time)
  })

  test('returns for 200,000 readings without a RangeError', () => {
    const start = ist(9, 15)
    const intraday = Array.from({ length: 200_000 }, (_, i) => ({ t: new Date(start + i * 100).toISOString(), v: Math.sin(i / 1000) * 500 }))
    const vm = model({ ...day, intraday }, 'M')
    assert.equal(vm.chart.empty, false)
    assert.equal(vm.dropped, 0)
  })

  test('dropped counts the readings and marks it could not use', () => {
    const rows = [...intraday, { t: 'x', v: 1 }, { t: ist(10, 0), v: 'y' }, null]
    const vm = model({ ...withChart, intraday: rows, marks: [{ t: 'bad' }, { t: ist(10, 0) }] }, 'M')
    assert.equal(vm.dropped, 4)
    assert.equal(model(withChart, 'M').dropped, 0)
    assert.equal(model(day, 'S').dropped, 0)
    assert.equal(model(null, 'M').dropped, 0)
    assert.equal(model({ intraday: [{}, {}] }, 'M').dropped, 2)
  })
})
