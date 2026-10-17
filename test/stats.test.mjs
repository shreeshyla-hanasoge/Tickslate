import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { equitySeries, equityStats, dayStats } from '../src/core/index.js'

const d = (date, pnl, trades) => (trades === undefined ? { date, pnl } : { date, pnl, trades })

describe('equitySeries', () => {
  test('accumulates from zero with a running peak and the drop from it', () => {
    const rows = equitySeries([d('2026-01-01', 100), d('2026-01-02', -40), d('2026-01-03', -80), d('2026-01-04', 150)])
    assert.deepEqual(rows, [
      { date: '2026-01-01', equity: 100, peak: 100, drawdown: 0 },
      { date: '2026-01-02', equity: 60, peak: 100, drawdown: -40 },
      { date: '2026-01-03', equity: -20, peak: 100, drawdown: -120 },
      { date: '2026-01-04', equity: 130, peak: 130, drawdown: 0 },
    ])
  })

  test('sorts by date without changing the input', () => {
    const input = [d('2026-01-03', 3), d('2026-01-01', 1), d('2026-01-02', 2)]
    const copy = JSON.parse(JSON.stringify(input))
    const rows = equitySeries(input)
    assert.deepEqual(rows.map((r) => r.date), ['2026-01-01', '2026-01-02', '2026-01-03'])
    assert.deepEqual(rows.map((r) => r.equity), [1, 3, 6])
    assert.deepEqual(input, copy)
  })

  test('skips entries with a bad date or a pnl that is not a finite number', () => {
    const rows = equitySeries([
      d('2026-01-01', 10),
      d('01/02/2026', 50),
      d('2026-01-03', 'abc'),
      d('2026-01-04', null),
      d('2026-01-05', NaN),
      d('2026-01-06', Infinity),
      d('2026-01-07', true),
      d('2026-1-8', 5),
      null,
      { pnl: 5 },
      d('2026-01-09', '2.5'),
    ])
    assert.deepEqual(rows.map((r) => [r.date, r.equity]), [['2026-01-01', 10], ['2026-01-09', 12.5]])
  })

  test('a series that only loses keeps its peak at the starting 0', () => {
    const rows = equitySeries([d('2026-01-01', -10), d('2026-01-02', -5)])
    assert.deepEqual(rows.map((r) => r.peak), [0, 0])
    assert.deepEqual(rows.map((r) => r.drawdown), [-10, -15])
  })

  test('empty and non-array input give an empty series', () => {
    assert.deepEqual(equitySeries([]), [])
    assert.deepEqual(equitySeries(undefined), [])
  })
})

describe('equityStats', () => {
  test('net, peak, max drawdown, days and trades', () => {
    const stats = equityStats([
      d('2026-01-04', 150, 3),
      d('2026-01-01', 100, 2),
      d('2026-01-02', -40, 1),
      d('2026-01-03', -80),
    ])
    assert.deepEqual(stats, { net: 130, peak: 130, maxDrawdown: 120, tradingDays: 4, trades: 6 })
  })

  test('max drawdown is the largest fall, not the last', () => {
    const stats = equityStats([d('2026-01-01', 100), d('2026-01-02', -60), d('2026-01-03', 80), d('2026-01-04', -10)])
    assert.equal(stats.maxDrawdown, 60)
    assert.equal(stats.net, 110)
  })

  test('all-negative series: peak stays 0 and the drawdown is the whole fall', () => {
    const stats = equityStats([d('2026-01-01', -10), d('2026-01-02', -5)])
    assert.deepEqual(stats, { net: -15, peak: 0, maxDrawdown: 15, tradingDays: 2, trades: 0 })
  })

  test('a series that never falls has no drawdown', () => {
    assert.equal(equityStats([d('2026-01-01', 5), d('2026-01-02', 5)]).maxDrawdown, 0)
  })

  test('skipped entries count for nothing, and only finite trades are summed', () => {
    const stats = equityStats([d('2026-01-01', 10, 4), d('bad', 99, 9), d('2026-01-02', 'x', 9), d('2026-01-03', 1, NaN), d('2026-01-04', 1, '3')])
    assert.deepEqual(stats, { net: 12, peak: 12, maxDrawdown: 0, tradingDays: 3, trades: 4 })
  })

  test('empty input is all zeros', () => {
    assert.deepEqual(equityStats([]), { net: 0, peak: 0, maxDrawdown: 0, tradingDays: 0, trades: 0 })
  })
})

describe('time zones and instants', () => {
  const kolkata = { timeZone: 'Asia/Kolkata' }

  test('IST midnight, sent as a UTC instant, is the next calendar day', () => {
    const rows = [{ date: '2026-10-11T18:30:00.000000Z', pnl: 7 }]
    assert.equal(equitySeries(rows, kolkata)[0].date, '2026-10-12')
    assert.equal(equitySeries(rows)[0].date, '2026-10-11')
    assert.equal(equityStats(rows, kolkata).tradingDays, 1)
  })

  test('keeps both rows of an ISO instant at UTC midnight and a plain date', () => {
    const rows = [{ date: '2026-10-12T00:00:00.000000Z', pnl: 10 }, { date: '2026-10-13', pnl: '5' }]
    for (const opts of [undefined, kolkata]) {
      assert.deepEqual(equitySeries(rows, opts).map((p) => [p.date, p.equity]), [['2026-10-12', 10], ['2026-10-13', 15]])
      assert.equal(equityStats(rows, opts).tradingDays, 2)
    }
  })

  test('reads seconds, ms and Dates', () => {
    const t = Date.UTC(2026, 9, 12, 6)
    const rows = [{ date: t, pnl: 1 }, { date: t / 1000 + 86400, pnl: 1 }, { date: new Date(t + 2 * 86400000), pnl: 1 }]
    assert.deepEqual(equitySeries(rows).map((p) => p.date), ['2026-10-12', '2026-10-13', '2026-10-14'])
  })
})

describe('null options', () => {
  test('are treated like no options', () => {
    const days = [d('2026-01-01', 100), d('2026-01-02', -40)]
    assert.deepEqual(equitySeries(days, null), equitySeries(days))
    assert.deepEqual(equityStats(days, null), equityStats(days))
  })
})

describe('dayStats', () => {
  test('sums rows with the same date before it counts days', () => {
    const stats = dayStats([d('2026-10-01', 300), d('2026-10-01', -100), d('2026-10-02', -50), d('2026-10-05', -200), d('2026-10-05', 200)])
    assert.deepEqual(stats, { net: 150, greenDays: 1, redDays: 1, greenRate: 0.5, best: 200, worst: -50 })
  })

  test('a day is green above zero and red below, and a flat day is neither', () => {
    const stats = dayStats([d('2026-10-01', 10), d('2026-10-02', 20), d('2026-10-03', -5), d('2026-10-04', 0)])
    assert.equal(stats.greenDays, 2)
    assert.equal(stats.redDays, 1)
    assert.equal(stats.greenRate, 2 / 3)
    assert.equal(stats.best, 20)
    assert.equal(stats.worst, -5)
  })

  test('empty and unreadable input give zeros and nulls', () => {
    const none = { net: 0, greenDays: 0, redDays: 0, greenRate: null, best: null, worst: null }
    assert.deepEqual(dayStats([]), none)
    assert.deepEqual(dayStats(undefined), none)
    assert.deepEqual(dayStats(null), none)
    assert.deepEqual(dayStats([d('nope', 5), d('2026-10-01', 'abc'), null]), none)
  })

  test('only flat days have a best and a worst but no rate', () => {
    assert.deepEqual(dayStats([d('2026-10-01', 0)]), { net: 0, greenDays: 0, redDays: 0, greenRate: null, best: 0, worst: 0 })
  })

  test('reads dates with toDay in the time zone, and a UTC-midnight string is its own date', () => {
    // 20:00Z is already the 13th in Kolkata, so the two rows are one day there and two in UTC.
    const rows = [d('2026-10-12T20:00:00Z', 100), d('2026-10-13', 50)]
    assert.equal(dayStats(rows, { timeZone: 'Asia/Kolkata' }).greenDays, 1)
    assert.equal(dayStats(rows).greenDays, 2)
    assert.deepEqual(dayStats([d('2026-10-13T00:00:00Z', -5), d('2026-10-13', 2)], { timeZone: 'America/New_York' }), {
      net: -3, greenDays: 0, redDays: 1, greenRate: 0, best: -3, worst: -3,
    })
  })

  test('takes a numeric string, and does not change its input', () => {
    const input = [d('2026-10-01', '2.5'), d('2026-10-01', 1)]
    const copy = JSON.parse(JSON.stringify(input))
    assert.equal(dayStats(input).net, 3.5)
    assert.deepEqual(input, copy)
  })
})
