import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createFormatter, createMessages } from '../src/core/index.js'
import {
  TsEquityCurve,
  HEADLINE_CHARS,
  RANGES,
  equityCurveModel,
  filterRange,
  normalizeRange,
  rangeStart,
} from '../src/elements/equity-curve.js'

// This file is loaded with no DOM: the import above must not throw.

const fmt = createFormatter({ locale: 'en-IN', currency: 'INR', timeZone: 'Asia/Kolkata' })
const month = (iso) => new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' }).format(Date.parse(iso))
const d = (date, pnl, trades) => (trades === undefined ? { date, pnl } : { date, pnl, trades })
const dates = (rows) => rows.map((r) => r.date)
const t = createMessages()
const ctx = (range) => ({ fmt, t, label: 'Equity curve', range })

// Equity 1000, 500, 2500, -1500, -1800: peak 2500, deepest fall 4300, net -1800.
const OCT = [
  d('2026-10-01', 1000, 3),
  d('2026-10-02', -500, 2),
  d('2026-10-05', 2000, 4),
  d('2026-10-06', -4000, 5),
  d('2026-10-07', -300, 1),
]

describe('without a DOM', () => {
  test('the class loads and describes itself', () => {
    assert.equal(typeof TsEquityCurve, 'function')
    assert.equal(TsEquityCurve.catalogKey, 'equityCurve')
    assert.deepEqual(TsEquityCurve.observedAttributes.slice(-1), ['range'])
    assert.ok(TsEquityCurve.observedAttributes.includes('size'))
    assert.match(TsEquityCurve.styles, /--ts-loss/)
    assert.doesNotMatch(TsEquityCurve.styles, /#[0-9a-f]{3,8}\b|\b(rgb|hsl)a?\(/i)
  })

  test('templates are static markup per variant, with buttons only on XL', () => {
    for (const v of ['Wide', 'M', 'XL']) {
      const html = TsEquityCurve.template(v)
      assert.equal(html, TsEquityCurve.template(v))
      assert.match(html, /role="img"/)
      assert.doesNotMatch(html, /#[0-9a-f]{3,8}\b/i)
    }
    const xl = TsEquityCurve.template('XL')
    assert.match(xl, /role="group"[^>]*data-k="rangeGroup"/)
    for (const r of RANGES) assert.match(xl, new RegExp(`data-range="${r}"`))
    assert.doesNotMatch(TsEquityCurve.template('Wide'), /data-range/)
    assert.doesNotMatch(TsEquityCurve.template('M'), /data-range/)
  })
})

describe('normalizeRange', () => {
  test('knows the five ranges, any case, and sends the rest to All', () => {
    assert.deepEqual(RANGES, ['1W', '1M', '3M', 'YTD', 'All'])
    for (const r of RANGES) assert.equal(normalizeRange(r), r)
    assert.equal(normalizeRange('ytd'), 'YTD')
    assert.equal(normalizeRange('all'), 'All')
    for (const bad of ['6M', '', null, undefined, 7, {}]) assert.equal(normalizeRange(bad), 'All')
  })
})

describe('rangeStart', () => {
  test('1W is the 7 calendar days ending on the latest date', () => {
    assert.equal(rangeStart('2026-10-14', '1W'), '2026-10-08')
    assert.equal(rangeStart('2026-03-03', '1W'), '2026-02-25')
  })

  test('1M and 3M keep the day of the month, clamped to a shorter month', () => {
    assert.equal(rangeStart('2026-10-14', '1M'), '2026-09-14')
    assert.equal(rangeStart('2026-03-31', '1M'), '2026-02-28')
    assert.equal(rangeStart('2024-03-31', '1M'), '2024-02-29')
    assert.equal(rangeStart('2026-05-31', '3M'), '2026-02-28')
    assert.equal(rangeStart('2026-02-15', '3M'), '2025-11-15')
    assert.equal(rangeStart('2026-01-31', '1M'), '2025-12-31')
  })

  test('YTD starts on 1 January of the latest date\'s year', () => {
    assert.equal(rangeStart('2026-10-14', 'YTD'), '2026-01-01')
    assert.equal(rangeStart('2025-12-31', 'YTD'), '2025-01-01')
  })

  test('All has no start', () => {
    assert.equal(rangeStart('2026-10-14', 'All'), '')
    assert.equal(rangeStart('2026-10-14', 'nonsense'), '')
  })
})

describe('filterRange', () => {
  const series = [
    d('2025-12-30', 1),
    d('2025-12-31', 2),
    d('2026-01-02', 3),
    d('2026-01-05', 4),
  ]

  test('All keeps every usable day, in input order', () => {
    const shuffled = [series[2], series[0], series[3], series[1]]
    assert.deepEqual(dates(filterRange(shuffled, 'All')), ['2026-01-02', '2025-12-30', '2026-01-05', '2025-12-31'])
    assert.deepEqual(dates(filterRange(series)), dates(series))
  })

  test('is relative to the latest date in the data, not the clock', () => {
    const old = [d('2019-06-03', 1), d('2019-06-20', 2), d('2019-07-02', 3), d('2019-07-09', 4)]
    assert.deepEqual(dates(filterRange(old, '1W')), ['2019-07-09'])
    assert.deepEqual(dates(filterRange(old, '1M')), ['2019-06-20', '2019-07-02', '2019-07-09'])
    assert.deepEqual(dates(filterRange(old, '3M')), dates(old))
  })

  test('1W keeps 7 calendar days including the latest', () => {
    const days = [d('2026-10-07', 1), d('2026-10-08', 1), d('2026-10-09', 1), d('2026-10-14', 1)]
    assert.deepEqual(dates(filterRange(days, '1W')), ['2026-10-08', '2026-10-09', '2026-10-14'])
  })

  test('1M at a month end reaches back to the clamped day, inclusive', () => {
    const days = [d('2026-02-27', 1), d('2026-02-28', 2), d('2026-03-02', 3), d('2026-03-31', 4)]
    assert.deepEqual(dates(filterRange(days, '1M')), ['2026-02-28', '2026-03-02', '2026-03-31'])
  })

  test('3M spans months', () => {
    const days = [d('2025-12-30', 1), d('2025-12-31', 1), d('2026-02-10', 1), d('2026-03-31', 1)]
    assert.deepEqual(dates(filterRange(days, '3M')), ['2025-12-31', '2026-02-10', '2026-03-31'])
  })

  test('YTD across a year boundary drops last year', () => {
    assert.deepEqual(dates(filterRange(series, 'YTD')), ['2026-01-02', '2026-01-05'])
    // The latest date is in 2025, so 2025 is "this year" for this data.
    assert.deepEqual(dates(filterRange(series.slice(0, 2), 'YTD')), ['2025-12-30', '2025-12-31'])
  })

  test('an unknown range is All', () => {
    assert.deepEqual(dates(filterRange(series, '6M')), dates(series))
    assert.deepEqual(dates(filterRange(series, null)), dates(series))
  })

  test('unusable rows are dropped and never count as the latest date', () => {
    const days = [d('2026-10-14', 1), d('2099-01-01', 'abc'), d('not a date', 5), null, d('2026-10-01', '2'), { pnl: 3 }]
    assert.deepEqual(dates(filterRange(days, '1W')), ['2026-10-14'])
    assert.deepEqual(dates(filterRange(days, 'All')), ['2026-10-14', '2026-10-01'])
  })

  test('nothing in, nothing out', () => {
    for (const r of RANGES) {
      assert.deepEqual(filterRange([], r), [])
      assert.deepEqual(filterRange(undefined, r), [])
      assert.deepEqual(filterRange('nope', r), [])
    }
  })
})

describe('equityCurveModel', () => {
  test('headline widths are the constants the brief gives', () => {
    assert.deepEqual(HEADLINE_CHARS, { Wide: 10, M: 12, XL: 12 })
  })

  test('Wide: net, peak and the day count in the label', () => {
    const vm = equityCurveModel({ days: OCT }, 'Wide', ctx())
    assert.equal(vm.label, 'Equity · 5 days')
    assert.equal(vm.headline, '−₹1,800.00')
    assert.equal(vm.netClass, 'neg')
    assert.equal(vm.peakNote, 'peak +₹2,500.00')
    assert.equal(vm.ariaLabel, 'Equity curve, −₹1,800.00 over 5 trading days')
    assert.equal(vm.empty, false)
    assert.deepEqual([vm.chart.width, vm.chart.height], [400, 100])
  })

  test('Wide keeps a host\'s own label and counts one day in the singular', () => {
    const vm = equityCurveModel({ days: [d('2026-10-01', 5)] }, 'Wide', { ...ctx(), label: 'Strategy P&L' })
    assert.equal(vm.label, 'Strategy P&L · 1 day')
    assert.equal(vm.sub, 'over 1 trading day')
  })

  test('M: baseline, axis, peak, drawdown as a loss, and fees', () => {
    const vm = equityCurveModel({ days: OCT, fees: '310.5' }, 'M', ctx())
    assert.equal(vm.label, 'Equity curve')
    assert.equal(vm.headline, '−₹1,800.00')
    assert.equal(vm.sub, 'over 5 trading days')
    assert.equal(vm.peak, '+₹2,500.00')
    assert.equal(vm.peakClass, 'pos')
    assert.equal(vm.maxDrawdown, '−₹4,300.00')
    assert.equal(vm.maxDrawdownClass, 'neg')
    assert.deepEqual(vm.third, { label: 'Fees', value: '₹310.50' })
    assert.deepEqual([vm.chart.width, vm.chart.height], [600, 160])
    // One month in the range: just that month.
    assert.deepEqual(vm.axis, [month('2026-10-01'), ''])
    assert.equal(vm.chart.band, '')
    assert.equal(vm.chart.peakLine, '')
  })

  test('M says net of fees only when fees were given', () => {
    assert.equal(equityCurveModel({ days: OCT, fees: '310.5' }, 'M', ctx()).netOfFees, true)
    assert.equal(equityCurveModel({ days: OCT }, 'M', ctx()).netOfFees, false)
  })

  test('M shows Trades when there are no fees, from the days when not given', () => {
    const vm = equityCurveModel({ days: OCT }, 'M', ctx())
    assert.deepEqual(vm.third, { label: 'Trades', value: '15' })
    const given = equityCurveModel({ days: OCT, trades: 99 }, 'M', ctx())
    assert.deepEqual(given.third, { label: 'Trades', value: '99' })
    const none = equityCurveModel({ days: [d('2026-10-01', 1)] }, 'M', ctx())
    assert.deepEqual(none.third, { label: 'Trades', value: '—' })
  })

  test('M axis names the first and last month of the range', () => {
    const days = [d('2026-09-29', 1), d('2026-09-30', 1), d('2026-10-01', 1), d('2026-10-02', 1)]
    const vm = equityCurveModel({ days }, 'M', ctx())
    assert.deepEqual(vm.axis, [month('2026-09-29'), month('2026-10-02')])
  })

  test('XL: net, peak, drawdown, trading days and trades', () => {
    const vm = equityCurveModel({ days: OCT, trades: 66 }, 'XL', ctx())
    assert.equal(vm.headline, '−₹1,800.00')
    assert.equal(vm.netClass, 'neg')
    assert.equal(vm.peak, '+₹2,500.00')
    assert.equal(vm.maxDrawdown, '−₹4,300.00')
    assert.equal(vm.daysLine, '5 · 66 trades')
    assert.deepEqual([vm.chart.width, vm.chart.height], [900, 220])
  })

  test('XL daysLine leaves trades out when nobody gave any, and says "trade" for one', () => {
    assert.equal(equityCurveModel({ days: [d('2026-10-01', 1)] }, 'XL', ctx()).daysLine, '1')
    assert.equal(equityCurveModel({ days: [d('2026-10-01', 1, 1)] }, 'XL', ctx()).daysLine, '1 · 1 trade')
  })

  test('XL axis has start, middle and end months, leaving out repeats', () => {
    const three = [d('2026-08-31', 1), d('2026-09-15', 1), d('2026-10-01', 1)]
    assert.deepEqual(equityCurveModel({ days: three }, 'XL', ctx()).axis, [month('2026-08-31'), month('2026-09-15'), month('2026-10-01')])
    const two = [d('2026-09-29', 1), d('2026-09-30', 1), d('2026-10-01', 1), d('2026-10-02', 1), d('2026-10-05', 1)]
    assert.deepEqual(equityCurveModel({ days: two }, 'XL', ctx()).axis, [month('2026-09-29'), '', month('2026-10-05')])
    assert.deepEqual(equityCurveModel({ days: OCT }, 'XL', ctx()).axis, [month('2026-10-01'), '', ''])
  })

  test('XL draws the running peak and the drawdown band', () => {
    const vm = equityCurveModel({ days: OCT }, 'XL', ctx())
    assert.match(vm.chart.peakLine, /^M[\d. ]+( L[\d. ]+){4}$/)
    assert.match(vm.chart.band, /Z$/)
    // One day: a level line only, nothing to shade.
    const one = equityCurveModel({ days: [d('2026-10-01', 5)] }, 'XL', ctx())
    assert.equal(one.chart.band, '')
    assert.ok(one.chart.line.startsWith('M'))
  })

  test('colour follows the sign, and a flat result has none', () => {
    const up = equityCurveModel({ days: [d('2026-10-01', 100)] }, 'M', ctx())
    assert.equal(up.netClass, 'pos')
    assert.equal(up.headline, '+₹100.00')
    const flat = equityCurveModel({ days: [d('2026-10-01', 100), d('2026-10-02', -100)] }, 'M', ctx())
    assert.equal(flat.netClass, '')
    assert.equal(flat.headline, '₹0.00')
    // Float dust is not a loss.
    const dust = equityCurveModel({ days: [d('2026-10-01', 0.1), d('2026-10-02', 0.2), d('2026-10-03', -0.3)] }, 'M', ctx())
    assert.equal(dust.netClass, '')
    // A series that only loses has a peak of 0 (stats.js), shown with no sign colour.
    const down = equityCurveModel({ days: [d('2026-10-01', -50)] }, 'M', ctx())
    assert.equal(down.peakClass, '')
    assert.equal(down.maxDrawdown, '−₹50.00')
  })

  test('the headline goes compact when it would not fit its variant', () => {
    const days = [d('2026-10-01', 12345.67)]
    // '+₹12,345.67' is 11 characters.
    assert.equal(equityCurveModel({ days }, 'Wide', ctx()).headline, fmt.money(12345.67, { compact: true }))
    assert.equal(equityCurveModel({ days }, 'M', ctx()).headline, '+₹12,345.67')
    assert.equal(equityCurveModel({ days }, 'XL', ctx()).headline, '+₹12,345.67')
    const big = [d('2026-10-01', 1234567.89)]
    for (const v of ['Wide', 'M', 'XL']) assert.equal(equityCurveModel({ days: big }, v, ctx()).headline, fmt.money(1234567.89, { compact: true }))
    // The tile's accessible name keeps the exact figure.
    assert.match(equityCurveModel({ days: big }, 'Wide', ctx()).ariaLabel, /\+₹12,34,567\.89/)
  })

  test('the chart states its result', () => {
    const vm = equityCurveModel({ days: OCT }, 'M', ctx())
    assert.equal(vm.chartLabel, 'Equity curve: peak +₹2,500.00, lowest −₹1,800.00, ends at −₹1,800.00')
  })

  test('paths are drawn for data, and the zero line sits inside the chart', () => {
    for (const v of ['Wide', 'M', 'XL']) {
      const vm = equityCurveModel({ days: OCT }, v, ctx())
      assert.equal(vm.empty, false)
      assert.ok(vm.chart.line.startsWith('M'))
      assert.ok(vm.chart.area.endsWith('Z'))
      assert.ok(vm.chart.zeroY > 0 && vm.chart.zeroY < vm.chart.height)
    }
  })

  test('numeric strings are accepted and garbage rows are skipped', () => {
    const days = [d('2026-10-01', '1000'), d('2026-10-02', 'oops'), d('bad', 5), null, d('2026-10-03', '-250.5')]
    const vm = equityCurveModel({ days }, 'M', ctx())
    assert.equal(vm.headline, '+₹749.50')
    assert.equal(vm.tradingDays, 2)
  })

  test('no days: an empty-state flag, a zero headline, no paths, no throw', () => {
    for (const v of ['Wide', 'M', 'XL']) {
      for (const data of [{ days: [] }, {}, { days: 'nope' }, { days: [null, { date: 'x' }] }, null, undefined, 42]) {
        const vm = equityCurveModel(data, v, ctx())
        assert.equal(vm.empty, true)
        assert.equal(vm.headline, '₹0.00')
        assert.equal(vm.netClass, '')
        assert.equal(vm.chart.line, '')
        assert.equal(vm.chart.area, '')
        assert.equal(vm.chart.band, '')
        assert.equal(vm.tradingDays, 0)
        assert.ok(vm.axis.every((a) => a === ''))
        assert.match(vm.chartLabel, /no trading days/)
        assert.match(vm.ariaLabel, /no trading days/)
      }
    }
    assert.equal(equityCurveModel({ days: [] }, 'Wide', ctx()).label, 'Equity · 0 days')
  })

  test('an unknown variant is treated as M rather than throwing', () => {
    const vm = equityCurveModel({ days: OCT }, 'S', ctx())
    assert.equal(vm.variant, 'M')
  })

  test('static viewModel is the pure model, and reads the range from the context', () => {
    const data = { days: OCT }
    assert.deepEqual(TsEquityCurve.viewModel(data, 'M', { fmt, t, now: 0, label: 'Equity curve', range: '1W' }), equityCurveModel(data, 'M', ctx('1W')))
    // No range anywhere: All.
    assert.equal(TsEquityCurve.viewModel(data, 'M', { fmt, t, now: 0, label: 'Equity curve' }).range, 'All')
  })

  test('viewContext hands the model the normalised range attribute', () => {
    const el = (attr) => Object.assign(Object.create(TsEquityCurve.prototype), { getAttribute: () => attr })
    assert.deepEqual(TsEquityCurve.prototype.viewContext.call(el('1m')), { range: '1M' })
    assert.deepEqual(TsEquityCurve.prototype.viewContext.call(el(null)), { range: 'All' })
  })
})

describe('range in the model', () => {
  const days = [
    d('2026-08-31', 100, 1),
    d('2026-09-15', -40, 1),
    d('2026-09-29', 60, 1),
    d('2026-10-01', 200, 1),
    d('2026-10-05', -90, 1),
    d('2026-10-07', 30, 1),
  ]

  test('the default and unknown ranges show everything', () => {
    assert.equal(equityCurveModel({ days }, 'XL', ctx()).tradingDays, 6)
    assert.equal(equityCurveModel({ days }, 'XL', ctx('6M')).range, 'All')
  })

  test('the buttons say which range is on, exactly one', () => {
    for (const r of RANGES) {
      const vm = equityCurveModel({ days }, 'XL', ctx(r))
      assert.deepEqual(vm.ranges.map((x) => x.value), RANGES)
      assert.deepEqual(vm.ranges.filter((x) => x.on).map((x) => x.value), [r])
    }
    assert.deepEqual(equityCurveModel({ days }, 'XL', ctx('nope')).ranges.filter((x) => x.on).map((x) => x.value), ['All'])
  })

  test('the equity starts from 0 at the range start', () => {
    const all = equityCurveModel({ days }, 'M', ctx('All'))
    assert.equal(all.headline, '+₹260.00')
    // 1W from 2026-10-07 is 2026-10-01..07: 200 - 90 + 30.
    const week = equityCurveModel({ days }, 'M', ctx('1W'))
    assert.equal(week.headline, '+₹140.00')
    assert.equal(week.tradingDays, 3)
    assert.equal(week.sub, 'over 3 trading days')
    assert.equal(week.peak, '+₹200.00')
    assert.equal(week.maxDrawdown, '−₹90.00')
  })

  test('1M, 3M and YTD filter the model', () => {
    // 1M from 2026-10-07 is 2026-09-07: 09-15, 09-29, 10-01, 10-05, 10-07.
    assert.equal(equityCurveModel({ days }, 'M', ctx('1M')).tradingDays, 5)
    assert.equal(equityCurveModel({ days }, 'M', ctx('3M')).tradingDays, 6)
    assert.equal(equityCurveModel({ days }, 'M', ctx('YTD')).tradingDays, 6)
  })

  test('the range applies at every size', () => {
    for (const v of ['Wide', 'M', 'XL']) assert.equal(equityCurveModel({ days }, v, ctx('1W')).tradingDays, 3)
  })

  test('the axis follows the range', () => {
    assert.deepEqual(equityCurveModel({ days }, 'M', ctx('All')).axis, [month('2026-08-31'), month('2026-10-07')])
    assert.deepEqual(equityCurveModel({ days }, 'M', ctx('1W')).axis, [month('2026-10-01'), ''])
  })

  test('fees and a host\'s trade total only describe the whole series', () => {
    const data = { days, fees: 25, trades: 40 }
    const all = equityCurveModel(data, 'M', ctx('All'))
    assert.deepEqual(all.third, { label: 'Fees', value: '₹25.00' })
    assert.equal(equityCurveModel(data, 'XL', ctx('All')).daysLine, '6 · 40 trades')
    const week = equityCurveModel(data, 'M', ctx('1W'))
    assert.deepEqual(week.third, { label: 'Trades', value: '3' })
    assert.equal(equityCurveModel(data, 'XL', ctx('1W')).daysLine, '3 · 3 trades')
  })

  test('a range that happens to keep every day still shows fees', () => {
    const data = { days: days.slice(3), fees: 25 }
    assert.deepEqual(equityCurveModel(data, 'M', ctx('1M')).third, { label: 'Fees', value: '₹25.00' })
  })
})

describe('live', () => {
  test('is on only for live: true', () => {
    assert.equal(equityCurveModel({ days: OCT, live: true }, 'M', ctx()).live, true)
    assert.equal(equityCurveModel({ days: OCT, live: 'yes' }, 'M', ctx()).live, false)
    assert.equal(equityCurveModel({ days: OCT }, 'M', ctx()).live, false)
  })
})

describe('large inputs', () => {
  // Made-up data, about 550 years of consecutive days: far longer than an
  // argument list can hold, so a Math.min(...days) would throw a RangeError.
  // Equity falls 250 a day for the first half, then rises 300 a day, so the
  // lowest point (-25,000,000) and the end (5,000,000, also the peak) are known.
  const n = 200000
  const start = Date.UTC(1500, 0, 1)
  const days = Array.from({ length: n }, (_, i) =>
    d(new Date(start + i * 86400000).toISOString().slice(0, 10), i < n / 2 ? -250 : 300),
  )

  test('200,000 days build every variant, with the lowest point from the whole series', () => {
    for (const v of ['Wide', 'M', 'XL']) {
      const vm = equityCurveModel({ days }, v, ctx('All'))
      assert.equal(vm.tradingDays, n)
      assert.equal(vm.chartLabel, `Equity curve: peak ${fmt.money(5e6)}, lowest ${fmt.money(-25e6)}, ends at ${fmt.money(5e6)}`)
      // The line is thinned to 2 × the box width (RFC 0003 §23); the peak line and band below still cover every day.
      const drawn = vm.chart.line.split(' L').length
      assert.ok(drawn <= 2 * vm.chart.width && drawn > 2, `${drawn} points`)
    }
  })

  test('the XL peak line and drawdown band cover every day', () => {
    const vm = equityCurveModel({ days }, 'XL', ctx('All'))
    assert.equal(vm.maxDrawdown, fmt.money(-25e6))
    assert.equal(vm.chart.peakLine.split(' L').length, n)
    // Along the peak, back along the equity: two points a day.
    assert.equal(vm.chart.band.split(' L').length, 2 * n)
  })
})

describe('data shapes (RFC 0002 §4)', () => {
  test('the curve passes its formatter time zone: an IST midnight row is the next day', () => {
    const vm = equityCurveModel({ days: [d('2026-10-11T18:30:00.000000Z', 10), d('2026-10-12', 5)] }, 'M', ctx('All'))
    // Same day twice in Kolkata: still two trading days, both kept.
    assert.equal(vm.tradingDays, 2)
    assert.equal(vm.dropped, 0)
  })

  test('filterRange reads the day in the zone', () => {
    const rows = [d('2026-10-11T18:30:00.000000Z', 1), d('2026-10-05', 1)]
    // In Kolkata the latest day is 12 Oct, so the week starts 6 Oct and 5 Oct falls out.
    assert.deepEqual(dates(filterRange(rows, '1W', 'Asia/Kolkata')), ['2026-10-12'])
    // In UTC the latest is 11 Oct, so the week starts 5 Oct and keeps both.
    assert.deepEqual(dates(filterRange(rows, '1W')), ['2026-10-11', '2026-10-05'])
  })

  test('keeps an ISO-midnight row beside a plain date, with string and number P&L', () => {
    const vm = equityCurveModel({ days: [d('2026-10-12T00:00:00.000000Z', 10), d('2026-10-13', '5')] }, 'M', ctx('All'))
    assert.equal(vm.tradingDays, 2)
    assert.equal(vm.net, '+₹15.00')
  })

  test('dropped counts rows with no readable date or P&L', () => {
    const vm = equityCurveModel({ days: [d('2026-10-12', 1), d('nope', 1), d('2026-10-13', 'x'), null, d(1760331000, 2)] }, 'M', ctx('All'))
    assert.equal(vm.dropped, 3)
    assert.equal(vm.tradingDays, 2)
    assert.equal(equityCurveModel({}, 'M', ctx('All')).dropped, 0)
  })

  test('dropped does not count rows a range merely leaves out', () => {
    assert.equal(equityCurveModel({ days: OCT }, 'M', ctx('1W')).dropped, 0)
  })
})

describe('the full headline as a title (RFC 0004 §1.5)', () => {
  const de = createFormatter({ locale: 'de-DE', currency: 'EUR', timeZone: 'Europe/Berlin' })
  const model = (days, variant = 'M', f = fmt) => equityCurveModel({ days }, variant, { ...ctx(), fmt: f })
  const huge = [d('2026-10-01', 12345678.9), d('2026-10-02', 100)]

  test('is empty for a figure that fits, at every size', () => {
    for (const v of ['Wide', 'M', 'XL']) assert.equal(model(OCT, v).headlineTitle, '', v)
  })

  test('is the full figure where fit() made the headline compact', () => {
    for (const v of ['Wide', 'M', 'XL']) {
      const vm = model(huge, v)
      assert.notEqual(vm.headline, vm.net, v)
      assert.equal(vm.headlineTitle, '+₹1,23,45,778.90', v)
      assert.ok(vm.ariaLabel.includes(vm.headlineTitle), 'the accessible name has the full figure')
    }
  })

  test('follows the locale', () => {
    assert.match(model(huge, 'M', de).headlineTitle, /^\+12\.345\.778,90\s€$/)
  })

  test('an empty range has no title', () => {
    assert.equal(model([], 'M').headlineTitle, '')
  })
})
