import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { equitySeries, equityStats } from '../src/core/index.js'

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
