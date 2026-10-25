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

// Edge stats and funding (RFC 0003 §21.2). A second import, here, so the day-stats tests another story adds above merge cleanly.
import { edgeStats, histogram, funding } from '../src/core/index.js'

const trades = (...pnls) => pnls.map((pnl) => ({ pnl }))

describe('edgeStats', () => {
  test('a mixed record: win rate, profit factor, averages and expectancy', () => {
    const s = edgeStats(trades(300, -100, 200, -150, 50))
    assert.equal(s.trades, 5)
    assert.deepEqual([s.wins, s.losses], [3, 2])
    assert.equal(s.winRate, 0.6)
    assert.equal(s.profitFactor, 550 / 250)
    assert.equal(s.avgWin, 183.33333333)
    assert.equal(s.avgLoss, -125)
    assert.equal(s.expectancy, 60)
    assert.equal(s.avgHoldMs, null)
  })

  test('all wins: profit factor is Infinity, there is no average loss', () => {
    const s = edgeStats(trades(10, 20, 30))
    assert.deepEqual([s.winRate, s.profitFactor, s.avgWin, s.avgLoss, s.expectancy], [1, Infinity, 20, null, 20])
  })

  test('all losses: win rate 0, profit factor 0, there is no average win', () => {
    const s = edgeStats(trades(-10, -30))
    assert.deepEqual([s.winRate, s.profitFactor, s.avgWin, s.avgLoss, s.expectancy], [0, 0, null, -20, -20])
    assert.deepEqual([s.wins, s.losses], [0, 2])
  })

  test('no trades: every figure is null and the counts are zero', () => {
    for (const input of [[], undefined, null, 'x', [null, { pnl: 'n/a' }]]) {
      assert.deepEqual(edgeStats(input), { trades: 0, wins: 0, losses: 0, winRate: null, profitFactor: null, avgWin: null, avgLoss: null, expectancy: null, avgHoldMs: null })
    }
  })

  test('numeric strings are read, and a trade that can not be read is skipped, not counted as zero', () => {
    const s = edgeStats([{ pnl: '100.50' }, { pnl: '-50.25' }, { pnl: 'abc' }, { pnl: null }, { pnl: Infinity }, null, 7])
    assert.equal(s.trades, 2)
    assert.deepEqual([s.avgWin, s.avgLoss, s.expectancy], [100.5, -50.25, 25.125])
  })

  test('expectancy is over every readable trade, break-even ones included', () => {
    assert.equal(edgeStats(trades(0, 3)).expectancy, 1.5)
    assert.equal(edgeStats(trades(0, 0, 3)).expectancy, 1)
  })

  test('a break-even trade counts as a trade, and is neither a win nor a loss', () => {
    const s = edgeStats(trades(0, 0, 10))
    assert.deepEqual([s.trades, s.wins, s.losses], [3, 1, 0])
    assert.equal(s.profitFactor, Infinity)
    // Nothing won and nothing lost is no ratio at all.
    assert.equal(edgeStats(trades(0, 0)).profitFactor, null)
    assert.equal(edgeStats(trades(0, 0)).winRate, 0)
  })

  test('the average hold is over the trades that gave one', () => {
    const s = edgeStats([{ pnl: 1, holdMs: 60000 }, { pnl: -1, holdMs: 180000 }, { pnl: 1 }, { pnl: 1, holdMs: -5 }])
    assert.equal(s.avgHoldMs, 120000)
  })

  test('does not change its input', () => {
    const input = trades(5, -2)
    const copy = JSON.parse(JSON.stringify(input))
    edgeStats(input)
    assert.deepEqual(input, copy)
  })
})

describe('histogram', () => {
  test('buckets are half-open and the last is closed, so the largest edge is counted', () => {
    const rows = histogram([-10, -1, 0, 0, 5, 10, 10, 11, -11], [-10, 0, 10])
    assert.deepEqual(rows, [
      { from: -10, to: 0, count: 2 },
      { from: 0, to: 10, count: 5 },
    ])
  })

  test('a value on an inner edge belongs to the bucket that starts there', () => {
    assert.deepEqual(histogram([5], [0, 5, 10]).map((b) => b.count), [0, 1])
    assert.deepEqual(histogram([10], [0, 5, 10]).map((b) => b.count), [0, 1])
    assert.deepEqual(histogram([0], [0, 5, 10]).map((b) => b.count), [1, 0])
  })

  test('values outside the edges, and ones that are not numbers, are not counted; numeric strings are', () => {
    assert.deepEqual(histogram([-1, 11, 'n/a', null, NaN, '3'], [0, 10]).map((b) => b.count), [1])
  })

  test('edges are sorted and de-duplicated, and fewer than two make no buckets', () => {
    assert.deepEqual(histogram([1, 6], [10, 0, 5, 5, 'x']).map((b) => [b.from, b.to, b.count]), [[0, 5, 1], [5, 10, 1]])
    for (const edges of [[], [1], [2, 2], undefined, null]) assert.deepEqual(histogram([1], edges), [])
    assert.deepEqual(histogram(undefined, [0, 1]), [{ from: 0, to: 1, count: 0 }])
  })
})

describe('funding', () => {
  const alloc = (id, amount, extra) => ({ id, name: id.toUpperCase(), amount, ...extra })

  test('allocations draw the balance in array order, and are short by the rest', () => {
    const f = funding({ id: 'a', name: 'Broker A', balance: 18640.4, allocations: [alloc('x', 25000), alloc('y', 25000)] })
    assert.deepEqual(f.allocations.map((a) => [a.funded, a.short]), [[18640.4, 6359.6], [0, 25000]])
    assert.deepEqual([f.balance, f.allocated, f.free, f.shortfall], [18640.4, 50000, 0, 31359.6])
    assert.equal(f.fundedShare, 18640.4 / 50000)
  })

  test('a balance that covers everything leaves the rest free', () => {
    const f = funding({ id: 'a', name: 'A', balance: 100, allocations: [alloc('x', 30), alloc('y', 20)] })
    assert.deepEqual([f.free, f.shortfall, f.fundedShare], [50, 0, 1])
    assert.deepEqual(f.allocations.map((a) => a.short), [0, 0])
  })

  test('a given funded replaces the rule, held to 0..amount, and consumes the balance for the ones after it', () => {
    const f = funding({ id: 'a', name: 'A', balance: 100, allocations: [alloc('x', 60, { funded: 20 }), alloc('y', 60), alloc('z', 60)] })
    // x is funded 20 by the host, so 80 is left for y (60), then 20 for z.
    assert.deepEqual(f.allocations.map((a) => [a.funded, a.short]), [[20, 40], [60, 0], [20, 40]])
    assert.equal(f.free, 0)
    const over = funding({ id: 'a', name: 'A', balance: 100, allocations: [alloc('x', 60, { funded: 999 }), alloc('y', 60)] })
    assert.deepEqual(over.allocations.map((a) => a.funded), [60, 40])
    const neg = funding({ id: 'a', name: 'A', balance: 100, allocations: [alloc('x', 60, { funded: -5 }), alloc('y', 60)] })
    assert.deepEqual(neg.allocations.map((a) => a.funded), [0, 60])
  })

  test('a given funded larger than what is left spends the balance, never below zero', () => {
    const f = funding({ id: 'a', name: 'A', balance: 50, allocations: [alloc('x', 80), alloc('y', 80, { funded: 30 }), alloc('z', 10)] })
    assert.deepEqual(f.allocations.map((a) => a.funded), [50, 30, 0])
    assert.equal(f.free, 0)
  })

  test('over-allocation: the allocations add up to more than the balance', () => {
    const f = funding({ id: 'a', name: 'A', balance: '1000', allocations: [alloc('x', '600'), alloc('y', '600'), alloc('z', 600)] })
    assert.deepEqual(f.allocations.map((a) => a.funded), [600, 400, 0])
    assert.deepEqual([f.allocated, f.shortfall, f.free], [1800, 800, 0])
  })

  test('numeric strings are read; an amount that can not be read is zero, a balance that can not funds nothing', () => {
    const f = funding({ id: 'a', name: 'A', balance: '250.50', allocations: [alloc('x', '100.25'), alloc('y', 'n/a'), alloc('z', -5)] })
    assert.deepEqual(f.allocations.map((a) => [a.amount, a.funded]), [[100.25, 100.25], [0, 0], [0, 0]])
    assert.equal(f.free, 150.25)
    const none = funding({ id: 'a', name: 'A', balance: 'abc', allocations: [alloc('x', 10)] })
    assert.deepEqual([none.balance, none.allocations[0].funded, none.shortfall], [0, 0, 10])
    assert.equal(funding({ id: 'a', name: 'A', balance: -50, allocations: [alloc('x', 10)] }).allocations[0].funded, 0)
  })

  test('float drift over a million allocations is not a shortfall', () => {
    const f = funding({ id: 'a', name: 'A', balance: 100000, allocations: Array.from({ length: 1000000 }, (_, i) => alloc(String(i), 0.1)) })
    assert.deepEqual([f.free, f.shortfall], [0, 0])
    assert.equal(f.fundedShare > 0.999999, true)
    // A real shortfall of a cent is still one.
    assert.equal(funding({ id: 'a', name: 'A', balance: 99.99, allocations: [alloc('x', 100)] }).shortfall, 0.01)
  })

  test('nothing allocated: no share, and the whole balance is free', () => {
    for (const allocations of [[], undefined, [alloc('x', 0)]]) {
      const f = funding({ id: 'a', name: 'A', balance: 100, allocations })
      assert.deepEqual([f.fundedShare, f.free, f.shortfall, f.allocated], [null, 100, 0, 0])
    }
  })

  test('carries the detail, live flag and pnl through, and reads what is not given as absent', () => {
    const [a, b] = funding({ id: 'a', name: 'A', balance: 10, allocations: [alloc('x', 5, { detail: 'NIFTY 50 · 5m', live: true, pnl: '12.5' }), alloc('y', 5)] }).allocations
    assert.deepEqual(a, { id: 'x', name: 'X', detail: 'NIFTY 50 · 5m', amount: 5, funded: 5, short: 0, live: true, pnl: 12.5 })
    assert.deepEqual(b, { id: 'y', name: 'Y', amount: 5, funded: 5, short: 0, live: false, pnl: null })
  })

  test('a missing account, and rows that are not objects, give an empty result and do not throw', () => {
    assert.equal(funding(undefined).allocations.length, 0)
    assert.equal(funding({ id: 'a', name: 'A', balance: 5, allocations: [null, 3, alloc('x', 2)] }).allocations.length, 1)
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
