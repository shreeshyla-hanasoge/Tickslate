import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { todayPnlModel, CHART_BOX } from '../src/elements/today-pnl.js'
import { createFormatter, createMessages } from '../src/core/index.js'
import { resetWarnings } from '../src/elements/dev.js'
import { readsOf } from './ops.mjs'
import { downsample, scale, linePath, linePaths, bandPath, seriesDomain, areaPaths, bandScale, bandGeometry, barPaths, nearestPoint, plotFraction } from '../src/elements/chart.js'

describe('scale', () => {
  test('maps linearly, including to a reversed range', () => {
    const f = scale(0, 10, 0, 100)
    assert.equal(f(0), 0)
    assert.equal(f(5), 50)
    assert.equal(scale(0, 10, 100, 0)(2.5), 75)
  })

  test('a flat domain maps to the middle of the range', () => {
    assert.equal(scale(5, 5, 10, 30)(5), 20)
    assert.equal(scale(5, 5, 10, 30)(99), 20)
  })
})

describe('linePaths', () => {
  const box = { width: 100, height: 50, pad: 0 }

  test('draws the line, flipping y so larger values are higher', () => {
    const { line, zeroY } = linePaths([{ x: 0, y: 0 }, { x: 1, y: 10 }, { x: 2, y: 5 }], box)
    assert.equal(line, 'M0 50 L50 0 L100 25')
    assert.equal(zeroY, 50)
  })

  test('the area closes down to the zero line', () => {
    const { area } = linePaths([{ x: 0, y: 0 }, { x: 1, y: 10 }], box)
    assert.equal(area, 'M0 50 L100 0 L100 50 L0 50 Z')
  })

  test('zero is included in the domain by default, so a loss sits below the zero line', () => {
    const { zeroY, line } = linePaths([{ x: 0, y: -10 }, { x: 1, y: 10 }], box)
    assert.equal(zeroY, 25)
    assert.equal(line, 'M0 50 L100 0')
  })

  test('includeZero: false fits the data and clamps zeroY into the box', () => {
    const { zeroY, line } = linePaths([{ x: 0, y: 5 }, { x: 1, y: 10 }], { ...box, includeZero: false })
    assert.equal(line, 'M0 50 L100 0')
    assert.equal(zeroY, 50)
    const below = linePaths([{ x: 0, y: -10 }, { x: 1, y: -5 }], { ...box, includeZero: false })
    assert.equal(below.zeroY, 0)
  })

  test('honours pad and explicit domains', () => {
    const { line } = linePaths([{ x: 5, y: 1 }], { width: 120, height: 60, pad: 10, xDomain: [0, 10], yDomain: [0, 2] })
    // A single point is a level line, but the y still comes from the domain.
    assert.equal(line, 'M10 30 L110 30')
    const two = linePaths([{ x: 0, y: 0 }, { x: 10, y: 2 }], { width: 120, height: 60, pad: 10, xDomain: [0, 20], yDomain: [0, 2] })
    assert.equal(two.line, 'M10 50 L60 10')
  })

  test('rounds coordinates to one decimal', () => {
    const { line } = linePaths([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 3, y: 2 }], { width: 100, height: 100, pad: 0 })
    assert.equal(line, 'M0 100 L33.3 50 L100 0')
  })

  test('empty points give empty paths but usable scales', () => {
    const r = linePaths([], box)
    assert.equal(r.line, '')
    assert.equal(r.area, '')
    assert.equal(typeof r.x, 'function')
    assert.equal(typeof r.y, 'function')
    assert.ok(Number.isFinite(r.zeroY))
    assert.equal(linePaths(undefined, box).line, '')
  })

  test('one point is a short flat line across the width, and its area closes', () => {
    const { line, area } = linePaths([{ x: 3, y: 4 }], { width: 100, height: 50, pad: 4 })
    assert.equal(line, 'M4 4 L96 4')
    assert.equal(area, 'M4 4 L96 4 L96 46 L4 46 Z')
  })

  test('a flat series sits in the middle, not on an edge', () => {
    const { line } = linePaths([{ x: 0, y: 3 }, { x: 1, y: 3 }], { ...box, includeZero: false })
    assert.equal(line, 'M0 25 L100 25')
  })

  test('points that are not finite are ignored', () => {
    const { line } = linePaths([{ x: 0, y: 0 }, { x: 1, y: NaN }, { x: 2, y: 10 }], box)
    assert.equal(line, 'M0 50 L100 0')
  })

  test('the returned scales draw further lines on the same axes', () => {
    const { x, y } = linePaths([{ x: 0, y: 0 }, { x: 10, y: 10 }], box)
    assert.equal(linePath([{ x: 5, y: 5 }, { x: 10, y: 10 }], x, y), 'M50 25 L100 0')
    assert.equal(linePath([], x, y), '')
  })
})

describe('bandPath', () => {
  test('runs along the upper line, back along the lower and closes', () => {
    const { x, y } = linePaths([{ x: 0, y: 0 }, { x: 2, y: 10 }], { width: 100, height: 50, pad: 0 })
    const peak = [{ x: 0, y: 10 }, { x: 1, y: 10 }, { x: 2, y: 10 }]
    const equity = [{ x: 0, y: 10 }, { x: 1, y: 4 }, { x: 2, y: 10 }]
    assert.equal(bandPath(equity, peak, x, y), 'M0 0 L50 0 L100 0 L100 0 L50 30 L0 0 Z')
  })

  test('is empty when either line is empty', () => {
    const f = (v) => v
    assert.equal(bandPath([], [{ x: 0, y: 0 }], f, f), '')
    assert.equal(bandPath([{ x: 0, y: 0 }], [], f, f), '')
  })
})

describe('large inputs', () => {
  // Made-up data: more points than an argument list can hold, so a
  // Math.min(...points) anywhere on the way would throw a RangeError.
  test('200,000 points draw, with the domain taken from every point', () => {
    const n = 200000
    // 7919 is coprime with 2001, so the values visit every whole number from
    // -1000 to 1000 and the extremes are known without scanning.
    const points = Array.from({ length: n }, (_, i) => ({ x: i, y: ((i * 7919) % 2001) - 1000 }))
    // Downsampling is off here: this test is about the full series reaching the line.
    const { line, area, zeroY } = linePaths(points, { width: 900, height: 220, pad: 4, maxPoints: Infinity })
    const drawn = line.slice(1).split(' L').map((p) => p.split(' ').map(Number))
    assert.equal(drawn.length, n)
    // The first point is the lowest value, at the left edge; the last is at the right.
    assert.deepEqual(drawn[0], [4, 216])
    assert.equal(drawn[n - 1][0], 896)
    // The highest value reaches the top of the box and nothing leaves it.
    const top = drawn.reduce((lo, [, py]) => Math.min(lo, py), Infinity)
    const bottom = drawn.reduce((hi, [, py]) => Math.max(hi, py), -Infinity)
    assert.deepEqual([top, bottom], [4, 216])
    assert.equal(zeroY, 110)
    assert.ok(area.startsWith(line) && area.endsWith(' L896 110 L4 110 Z'))
  })
})

describe('seriesDomain', () => {
  test('spans every series, with zero included by default', () => {
    const d = seriesDomain([[{ x: 2, y: 5 }, { x: 4, y: 9 }], [{ x: 1, y: 7 }, { x: 3, y: 6 }]])
    assert.deepEqual(d, { x: [1, 4], y: [0, 9] })
  })

  test('includeZero: false keeps the data range, and negatives still reach below zero', () => {
    assert.deepEqual(seriesDomain([[{ x: 0, y: 40 }, { x: 1, y: 60 }]], { includeZero: false }).y, [40, 60])
    assert.deepEqual(seriesDomain([[{ x: 0, y: -4 }, { x: 1, y: 6 }]], { includeZero: false }).y, [-4, 6])
  })

  test('skips unusable points, and has a unit domain when there is nothing', () => {
    assert.deepEqual(seriesDomain([[{ x: 0, y: NaN }, { x: 1, y: 3 }, null]]).x, [1, 1])
    assert.deepEqual(seriesDomain([]), { x: [0, 1], y: [0, 1] })
    assert.deepEqual(seriesDomain([[], []]), { x: [0, 1], y: [0, 1] })
    assert.deepEqual(seriesDomain(undefined), { x: [0, 1], y: [0, 1] })
  })

  test('a very long series does not overflow the stack', () => {
    const points = Array.from({ length: 300000 }, (_, i) => ({ x: i, y: i % 7 }))
    assert.deepEqual(seriesDomain([points], { includeZero: false }), { x: [0, 299999], y: [0, 6] })
  })
})

describe('areaPaths', () => {
  const box = { width: 100, height: 50, pad: 5, xDomain: [0, 10], yDomain: [0, 100] }

  test('draws on the domain it is given, not its own extent', () => {
    const { line, area, zeroY } = areaPaths([{ x: 0, y: 0 }, { x: 10, y: 50 }], box)
    assert.equal(line, 'M5 45 L95 25')
    assert.equal(zeroY, 45)
    assert.equal(area, 'M5 45 L95 25 L95 45 L5 45 Z')
  })

  test('two series on one domain share the zero line', () => {
    const a = areaPaths([{ x: 0, y: 10 }, { x: 10, y: 20 }], box)
    const b = areaPaths([{ x: 0, y: 80 }, { x: 5, y: 90 }], box)
    assert.equal(a.zeroY, b.zeroY)
    assert.match(b.line, /^M5 /)
  })

  test('the zero line is clamped into the plot when zero is off the domain', () => {
    assert.equal(areaPaths([{ x: 0, y: 60 }, { x: 1, y: 70 }], { ...box, yDomain: [50, 100] }).zeroY, 45)
    assert.equal(areaPaths([{ x: 0, y: -60 }, { x: 1, y: -70 }], { ...box, yDomain: [-100, -50] }).zeroY, 5)
  })

  test('nothing to draw gives empty paths', () => {
    const r = areaPaths([], box)
    assert.equal(r.line, '')
    assert.equal(r.area, '')
  })
})

describe('bandScale', () => {
  test('equal bands from r0 to r1, with the padding split to either side of the bars', () => {
    const b = bandScale(['a', 'b', 'c', 'd'], 0, 100, { padding: 0.2 })
    assert.equal(b.band, 25)
    assert.equal(b.centre(0), 12.5)
    assert.equal(b.centre(3), 87.5)
    assert.equal(b.start(1), 27.5)
    assert.equal(b.index('c'), 2)
    assert.equal(b.index('zzz'), -1)
  })

  test('a single category takes the whole range, and no padding starts at the band edge', () => {
    const b = bandScale(['only'], 10, 110, { padding: 0 })
    assert.equal(b.band, 100)
    assert.equal(b.centre(0), 60)
    assert.equal(b.start(0), 10)
  })

  test('the first of a repeated label wins, and the padding is clamped to 0..1', () => {
    assert.equal(bandScale(['a', 'b', 'a'], 0, 30).index('a'), 0)
    assert.equal(bandScale(['a'], 0, 10, { padding: 5 }).start(0), 5)
    assert.equal(bandScale(['a'], 0, 10, { padding: -1 }).start(0), 0)
    assert.equal(bandScale(['a'], 0, 10, { padding: NaN }).start(0), 1)
  })

  test('no categories: no bands, nothing throws', () => {
    for (const b of [bandScale([], 0, 100), bandScale(undefined, 0, 100)]) {
      assert.equal(b.band, 0)
      assert.equal(b.centre(0), 0)
      assert.equal(b.index('a'), -1)
    }
  })

  test('bandGeometry takes a fractional count and reports the bar room in a band', () => {
    const g = bandGeometry(2.5, 0, 100, 0.2)
    assert.equal(g.band, 40)
    assert.equal(g.inner, 32)
  })
})

describe('barPaths', () => {
  const box = { width: 100, height: 50, pad: 0, categories: 2, padding: 0 }

  test('bars stand on the zero line: up for positive, down for negative', () => {
    const { paths, zeroY } = barPaths([[{ x: 0, y: 10 }, { x: 1, y: -10 }]], { ...box, yDomain: [-10, 10] })
    assert.equal(zeroY, 25)
    assert.equal(paths[0], 'M0 25V0H50V25Z M50 25V50H100V25Z')
  })

  test('the y domain always includes zero', () => {
    const { paths, zeroY } = barPaths([[{ x: 0, y: 5 }, { x: 1, y: 10 }]], { ...box, yDomain: [5, 10] })
    assert.equal(zeroY, 50)
    assert.equal(paths[0], 'M0 50V25H50V50Z M50 50V0H100V50Z')
    assert.equal(barPaths([[{ x: 0, y: -2 }]], { ...box, categories: 1 }).zeroY, 0, 'all-negative data hangs from the top')
  })

  test('several groups sit side by side inside a band, not stacked', () => {
    const { paths } = barPaths([[{ x: 0, y: 10 }], [{ x: 0, y: 10 }]], { ...box, categories: 1, yDomain: [0, 10] })
    assert.equal(paths[0], 'M0 50V0H50V50Z')
    assert.equal(paths[1], 'M50 50V0H100V50Z')
  })

  test('mixed kinds: a group with no points leaves its slot empty and the others keep theirs', () => {
    const { paths, centres } = barPaths([[], [{ x: 1, y: 4 }]], { ...box, yDomain: [0, 4] })
    assert.equal(paths[0], '')
    assert.equal(paths[1], 'M75 50V0H100V50Z')
    assert.deepEqual(centres, [25, 75])
  })

  test('a fractional x sits between bands, for bars on a time or number axis', () => {
    const { paths } = barPaths([[{ x: 0.5, y: 10 }]], { ...box, categories: 2, yDomain: [0, 10] })
    assert.equal(paths[0], 'M25 50V0H75V50Z')
  })

  test('a single category fills the plot minus its padding', () => {
    const { paths, centres } = barPaths([[{ x: 0, y: 1 }]], { width: 100, height: 20, pad: 0, categories: 1, padding: 0.2, yDomain: [0, 1] })
    assert.equal(paths[0], 'M10 20V0H90V20Z')
    assert.deepEqual(centres, [50])
  })

  test('a zero value draws nothing, and unreadable points are skipped', () => {
    const { paths } = barPaths([[{ x: 0, y: 0 }, { x: 1, y: NaN }, null, { x: 1, y: 3 }]], { ...box, yDomain: [0, 3] })
    assert.equal(paths[0], 'M50 50V0H100V50Z')
  })

  test('empty data gives empty paths and does not throw', () => {
    for (const groups of [[], [[]], undefined, null, [undefined]]) {
      const r = barPaths(groups, { width: 100, height: 50 })
      assert.ok(Array.isArray(r.paths))
      assert.ok(r.paths.every((d) => d === ''))
      assert.deepEqual(r.centres, [])
      assert.ok(Number.isFinite(r.zeroY))
    }
  })

  test('without a yDomain it is taken from the data, with zero in it', () => {
    const { paths, zeroY } = barPaths([[{ x: 0, y: 4 }, { x: 1, y: -4 }]], { ...box })
    assert.equal(zeroY, 25)
    assert.equal(paths[0], 'M0 25V0H50V25Z M50 25V50H100V25Z')
  })

  test('a long series is fine', () => {
    const pts = Array.from({ length: 200000 }, (_, i) => ({ x: i, y: i % 7 }))
    assert.doesNotThrow(() => barPaths([pts], { width: 400, height: 100, categories: 200000 }))
  })
})

describe('barPaths minimums and boxes', () => {
  const box = { width: 400, height: 100, pad: 0 }

  test('a bar is never narrower than the minimum, even with thousands of bands', () => {
    const { paths, rects } = barPaths([[{ x: 0, y: 1 }, { x: 4999, y: 1 }]], { ...box, categories: 5000, yDomain: [0, 1] })
    for (const r of rects[0]) assert.ok(r.w >= 1)
    assert.match(paths[0], /^M/)
  })

  test('a tiny value keeps a floor of one unit, and a true zero draws nothing', () => {
    const { paths, rects } = barPaths([[{ x: 0, y: 0.0001 }, { x: 1, y: 1e6 }, { x: 2, y: 0 }, { x: 3, y: -0.0001 }]], { ...box, categories: 4, yDomain: [-1, 1e6] })
    assert.equal((paths[0].match(/M/g) || []).length, 3)
    assert.ok(rects[0][0].h >= 1 && rects[0][3].h >= 1)
    assert.equal(rects[0][2].h, 0)
  })

  test('rects follow the input order and sit where the path is', () => {
    const { rects, zeroY } = barPaths([[{ x: 0, y: 5 }, { x: 1, y: -5 }]], { width: 100, height: 50, pad: 0, categories: 2, padding: 0, yDomain: [-5, 5] })
    assert.deepEqual(rects[0], [{ x: 0, y: 0, w: 50, h: 25 }, { x: 50, y: zeroY, w: 50, h: 25 }])
  })

  test('a runaway band count lists a bounded number of centres and does not throw', () => {
    const r = barPaths([[{ x: 0, y: 1 }]], { ...box, categories: 1e9, yDomain: [0, 1] })
    assert.ok(r.centres.length <= 1024)
  })
})

describe('downsampling (RFC 0003 §23)', () => {
  // Made-up readings: a slow wave with a one-reading spike and a one-reading dip that a pixel could hide.
  const wave = (n) => Array.from({ length: n }, (_, i) => ({ x: i, y: Math.round(Math.sin(i / 500) * 300) }))
  const series = wave(50000)
  series[12345] = { x: 12345, y: 999 }
  series[40001] = { x: 40001, y: -777 }
  const points = (line) => line.slice(1).split(' L').map((p) => p.split(' ').map(Number))

  test('keeps at most 2 × the viewBox width by default', () => {
    const { line } = linePaths(series, { width: 375, height: 100, pad: 4 })
    const drawn = points(line)
    assert.ok(drawn.length <= 750, `${drawn.length} points`)
    assert.ok(drawn.length > 700, 'and uses the budget, not a fraction of it')
  })

  test('maxPoints sets the limit, and Infinity turns downsampling off', () => {
    assert.ok(points(linePaths(series, { width: 375, height: 100, maxPoints: 100 }).line).length <= 100)
    assert.equal(points(linePaths(series, { width: 375, height: 100, maxPoints: Infinity }).line).length, 50000)
    assert.equal(linePaths(series, { width: 375, height: 100, maxPoints: 100 }).line.length < linePaths(series, { width: 375, height: 100, maxPoints: Infinity }).line.length, true)
  })

  test('a series within the limit is drawn point for point', () => {
    const few = wave(600)
    const a = linePaths(few, { width: 375, height: 100 })
    const b = linePaths(few, { width: 375, height: 100, maxPoints: Infinity })
    assert.equal(a.line, b.line)
    assert.equal(a.area, b.area)
  })

  test('the low, the high and the last value are exact, and the scales are the full series’', () => {
    const full = linePaths(series, { width: 375, height: 100, maxPoints: Infinity })
    const thin = linePaths(series, { width: 375, height: 100 })
    const drawn = points(thin.line)
    const ys = drawn.map(([, y]) => y)
    // Higher values are higher on screen, so the spike is the smallest y and the dip the largest.
    assert.equal(Math.min(...ys), Math.min(...points(full.line).map(([, y]) => y)))
    assert.equal(Math.max(...ys), Math.max(...points(full.line).map(([, y]) => y)))
    assert.equal(drawn[0][0], 4)
    assert.deepEqual(drawn[drawn.length - 1], points(full.line).pop())
    assert.equal(thin.zeroY, full.zeroY)
    assert.equal(thin.y(999), full.y(999))
    assert.ok(thin.area.startsWith(thin.line))
  })

  test('downsample keeps the first and last points and each run’s extremes in order', () => {
    const pts = [5, 1, 9, 2, 8, 3, 7, 4, 6, 0].map((y, x) => ({ x, y }))
    // Four points: the first, the last and the one run's low and high.
    const out = downsample(pts, 4)
    assert.deepEqual(out.map((p) => p.x), [0, 1, 2, 9])
    assert.equal(out.length, 4)
    // The run's low (y 1, x 1) comes before its high (y 9, x 2) because x 1 came first.
    assert.deepEqual(out.slice(1, 3).map((p) => p.y), [1, 9])
  })

  test('downsample hands back the input when nothing needs cutting, and never exceeds the limit', () => {
    const few = wave(10)
    assert.equal(downsample(few, 10), few)
    assert.equal(downsample(few, Infinity), few)
    for (const max of [2, 3, 4, 5, 7, 20, 99]) {
      const out = downsample(series, max)
      assert.ok(out.length <= Math.max(2, max), `${out.length} for ${max}`)
      assert.equal(out[0], series[0])
      assert.equal(out[out.length - 1], series[series.length - 1])
    }
  })

  test('flat and equal readings do not break the buckets', () => {
    const flat = Array.from({ length: 5000 }, (_, i) => ({ x: i, y: 7 }))
    const out = downsample(flat, 100)
    assert.ok(out.length <= 100 && out.length >= 3)
  })

  // Readings whose fields count every read, so a test can say how much work a long series costs without a clock: time
  // under load says nothing about the algorithm (a bound of 100 ms failed once at 133 ms on a busy runner).
  const counted = (n, make) => {
    const reads = { n: 0 }
    const list = Array.from({ length: n }, (_, i) => {
      const v = make(i)
      const o = {}
      for (const key of Object.keys(v)) Object.defineProperty(o, key, { enumerable: true, get: () => (reads.n++, v[key]) })
      return o
    })
    return { list, reads }
  }

  test('a long series is read a bounded number of times per reading, and draws at most 2 × the width', () => {
    const wave = (i) => ({ x: i, y: Math.sin(i / 9000) * 900 + ((i * 7919) % 101) })
    // The cost is linear: ten times the readings is about ten times the reads, so nothing in the thinning is quadratic.
    const reads = []
    for (const n of [5000, 50000]) {
      const { list, reads: r } = counted(n, wave)
      const drawn = linePaths(list, { width: 375, height: 100, pad: 4 })
      assert.ok(points(drawn.line).length <= 750, `${points(drawn.line).length} points`)
      assert.ok(r.n <= 20 * n, `${r.n} reads for ${n} readings`)
      reads.push(r.n / n)
    }
    assert.ok(reads[1] <= reads[0] * 1.5, `reads per reading grew from ${reads[0]} to ${reads[1]}`)
    // Asked for every point, it draws every point.
    const { list } = counted(3000, wave)
    assert.equal(points(linePaths(list, { width: 375, height: 100, pad: 4, maxPoints: Infinity }).line).length, 3000)
  })

  test("Today's P&L reads a long series a bounded number of times per reading, drawing at most 2 × the box width", () => {
    const fmt = createFormatter({ locale: 'en-IN', currency: 'INR', timeZone: 'Asia/Kolkata' })
    const ctx = { fmt, t: createMessages(), now: 0, label: "Today's P&L" }
    const from = Date.UTC(2026, 2, 2, 3, 45)
    const perReading = []
    let vm
    let intraday
    for (const n of [5000, 50000]) {
      const made = counted(n, (i) => ({ t: from + i * 40, v: Math.round(Math.sin(i / 9000) * 900 + ((i * 7919) % 101)) }))
      intraday = made.list
      const data = { net: 1200, intraday, window: { from, to: from + n * 40 }, live: true }
      vm = todayPnlModel(data, 'M', ctx)
      assert.ok(made.reads.n <= 40 * n, `${made.reads.n} reads for ${n} readings`)
      perReading.push(made.reads.n / n)
    }
    assert.ok(perReading[1] <= perReading[0] * 1.5, `reads per reading grew from ${perReading[0]} to ${perReading[1]}`)
    const drawn = points(vm.chart.line)
    assert.ok(drawn.length <= 2 * CHART_BOX.width && drawn.length > CHART_BOX.width, `${drawn.length} points`)
    assert.equal(vm.dropped, 0)
    // The label states the day's true low and the last reading, whatever was cut from the drawing.
    let low = Infinity
    for (const r of intraday) low = Math.min(low, r.v)
    assert.ok(vm.chart.ariaLabel.includes(fmt.money(low, { decimals: 0 })))
  })
})

describe('maxPoints edge cases (RFC 0003 §23)', () => {
  const pts = Array.from({ length: 2000 }, (_, i) => ({ x: i, y: i === 700 ? 500 : i === 1300 ? -400 : Math.round(Math.sin(i / 90) * 100) }))
  const drawn = (opts) => linePaths(pts, { width: 300, height: 100, pad: 4, ...opts }).line.slice(1).split(' L').map((p) => p.split(' ').map(Number))
  const every = drawn({ maxPoints: Infinity })

  test('null means the default, as an unset option from a JSON host', () => {
    assert.equal(linePaths(pts, { width: 300, height: 100, maxPoints: null }).line, linePaths(pts, { width: 300, height: 100 }).line)
    assert.ok(drawn({ maxPoints: null }).length > 4)
  })

  test('a cap below four, and a zero width, floor at four points that keep the low and the high', () => {
    const warn = console.warn
    console.warn = () => {}
    try {
      const ys = every.map(([, y]) => y)
      for (const maxPoints of [0, 1, 2, 3, -5, -Infinity]) {
        const d = drawn({ maxPoints })
        assert.equal(d.length, 4, `maxPoints ${maxPoints}`)
        assert.deepEqual(d[0], every[0])
        assert.deepEqual(d[3], every[every.length - 1])
        assert.equal(Math.min(...d.map(([, y]) => y)), Math.min(...ys))
        assert.equal(Math.max(...d.map(([, y]) => y)), Math.max(...ys))
      }
      assert.equal(linePaths(pts, { width: 0, height: 100 }).line.split(' L').length, 4)
    } finally {
      console.warn = warn
    }
  })

  test('a cap below four warns once in development; null, NaN, the default and Infinity do not', () => {
    const warn = console.warn
    const seen = []
    console.warn = (m) => seen.push(m)
    try {
      resetWarnings()
      drawn({ maxPoints: null })
      drawn({ maxPoints: NaN })
      drawn({ maxPoints: Infinity })
      drawn({})
      linePaths(pts, { width: 0, height: 100 })
      assert.deepEqual(seen, [])
      drawn({ maxPoints: 2 })
      drawn({ maxPoints: 0 })
      assert.equal(seen.length, 1)
      assert.match(seen[0], /maxPoints is 2.*at least 4/)
    } finally {
      console.warn = warn
      resetWarnings()
    }
  })
})

describe('nearestPoint (RFC 0004 §1.1)', () => {
  const pts = [{ x: 0, y: 5 }, { x: 10, y: 6 }, { x: 40, y: 7 }, { x: 100, y: 8 }]

  test('the first and the last point sit at the two ends of the domain', () => {
    assert.deepEqual(nearestPoint(pts, 0), { index: 0, x: 0, y: 5 })
    assert.deepEqual(nearestPoint(pts, 1), { index: 3, x: 100, y: 8 })
  })

  test('a position between two points takes the nearer one', () => {
    assert.equal(nearestPoint(pts, 0.1).index, 1)
    assert.equal(nearestPoint(pts, 0.24).index, 1)
    assert.equal(nearestPoint(pts, 0.26).index, 2)
    assert.equal(nearestPoint(pts, 0.8).index, 3)
  })

  test('a tie goes to the earlier point', () => {
    assert.equal(nearestPoint([{ x: 0, y: 0 }, { x: 10, y: 0 }], 0.5).index, 0)
    assert.equal(nearestPoint(pts, 0.25).index, 1, '25 is as far from 10 as from 40')
  })

  test('a position outside 0..1 is clamped', () => {
    assert.equal(nearestPoint(pts, -3).index, 0)
    assert.equal(nearestPoint(pts, 7).index, 3)
    assert.equal(nearestPoint(pts, Infinity).index, 3)
    assert.equal(nearestPoint(pts, -Infinity).index, 0)
  })

  test('one point is every position, and no points or a position that is not a number is null', () => {
    for (const f of [0, 0.5, 1]) assert.deepEqual(nearestPoint([{ x: 7, y: 1 }], f), { index: 0, x: 7, y: 1 })
    assert.equal(nearestPoint([], 0.5), null)
    assert.equal(nearestPoint(null, 0.5), null)
    assert.equal(nearestPoint(pts, NaN), null)
    assert.equal(nearestPoint(pts, undefined), null)
    assert.equal(nearestPoint(pts, '0.5'), null)
  })

  test('input that is not sorted never loops, and still names one of the points', () => {
    const mess = [{ x: 50, y: 1 }, { x: 0, y: 2 }, { x: 90, y: 3 }, { x: 10, y: 4 }, { x: 30, y: 5 }]
    for (const f of [0, 0.2, 0.5, 0.9, 1]) {
      const hit = nearestPoint(mess, f)
      assert.ok(hit && mess[hit.index].x === hit.x)
    }
  })

  test('a window domain makes the right edge the end of the window, not the last reading', () => {
    const early = [{ x: 0, y: 1 }, { x: 10, y: 2 }, { x: 20, y: 3 }]
    assert.equal(nearestPoint(early, 1).index, 2)
    assert.equal(nearestPoint(early, 0.1, { domain: [0, 100] }).index, 1, 'x = 10')
    assert.equal(nearestPoint(early, 0.9, { domain: [0, 100] }).index, 2, 'past the last reading, the last one')
    assert.equal(nearestPoint(early, 0, { domain: [-50, 50] }).index, 0, 'before the first reading, the first one')
  })

  test('a flat or reversed domain still answers', () => {
    assert.equal(nearestPoint(pts, 0.5, { domain: [40, 40] }).index, 2)
    assert.ok(nearestPoint(pts, 0.5, { domain: [100, 0] }))
  })

  test('a category axis is read at the bands\' centres, so each pointer position names one category', () => {
    const bands = bandScale(['Jan', 'Feb', 'Mar', 'Apr'], 0, 400)
    const centres = [0, 1, 2, 3].map((i) => ({ x: bands.centre(i), y: 0 }))
    const domain = [0, 400]
    assert.equal(nearestPoint(centres, 0.12, { domain }).index, 0)
    assert.equal(nearestPoint(centres, 0.3, { domain }).index, 1)
    assert.equal(nearestPoint(centres, 0.62, { domain }).index, 2)
    assert.equal(nearestPoint(centres, 0.99, { domain }).index, 3)
  })

  test('a downsampled set answers with a point the line was drawn through, spikes included', () => {
    const raw = Array.from({ length: 5000 }, (_, i) => ({ x: i, y: i === 2500 ? 900 : Math.sin(i / 50) }))
    const drawn = downsample(raw, 100)
    assert.ok(drawn.length <= 100 && drawn.length < raw.length)
    for (const f of [0, 0.13, 0.5, 0.77, 1]) {
      const hit = nearestPoint(drawn, f)
      assert.ok(drawn.includes(drawn[hit.index]) && drawn[hit.index].x === hit.x)
    }
    const spike = nearestPoint(drawn, 2500 / 4999)
    assert.ok(Math.abs(spike.x - 2500) < 100)
    assert.equal(nearestPoint(drawn, 0).x, 0)
    assert.equal(nearestPoint(drawn, 1).x, 4999)
  })

  test('is a binary search: a lookup reads a handful of points, however long the series', () => {
    // Counts reads of the points instead of timing a loop: time under load says nothing about the algorithm.
    // A scan would read ten thousand times as many points at 100,000 as at 10; a bisection reads about twice as many.
    const lookups = (n) => {
      const big = Array.from({ length: n }, (_, i) => ({ x: i * 3, y: i }))
      return readsOf(big, (points) => {
        for (let i = 0; i < 100; i++) nearestPoint(points, i / 99)
      }) / 100
    }
    const small = lookups(10)
    const large = lookups(100000)
    assert.ok(large <= 100, `${large} reads per lookup in 100,000 points`)
    assert.ok(large <= small * 8, `${small} reads per lookup in 10 points, ${large} in 100,000`)
  })
})

describe('plotFraction (RFC 0004 §1.1)', () => {
  test('undoes the inset the drawing keeps inside its viewBox', () => {
    assert.equal(plotFraction(0.5, { width: 400, pad: 4 }), 0.5)
    assert.equal(plotFraction(0, { width: 400, pad: 4 }), -4 / 392)
    assert.ok(plotFraction(1, { width: 400, pad: 4 }) > 1)
    // The pointer at the first point's own place gives the domain's start, and at the last point's the end.
    assert.ok(Math.abs(plotFraction(4 / 400, { width: 400, pad: 4 })) < 1e-12)
    assert.ok(Math.abs(plotFraction(396 / 400, { width: 400, pad: 4 }) - 1) < 1e-12)
  })

  test('with no pad, or no room inside it, the box fraction is the answer', () => {
    assert.equal(plotFraction(0.3, { width: 100, pad: 0 }), 0.3)
    assert.equal(plotFraction(0.3, { width: 8, pad: 4 }), 0.3)
    assert.equal(plotFraction(0.3, { width: 0, pad: 4 }), 0.3)
    assert.ok(Number.isNaN(plotFraction(NaN, { width: 100, pad: 4 })))
  })

  test('hands nearestPoint the point under the pointer, end to end', () => {
    const drawn = linePaths([{ x: 0, y: 1 }, { x: 10, y: 5 }, { x: 20, y: 2 }], { width: 200, height: 50, pad: 10 }).drawn
    assert.equal(drawn.length, 3)
    const x = scale(0, 20, 10, 190)
    const points = drawn.map((p) => ({ x: x(p.x), y: 0 }))
    for (const [px, want] of [[10, 0], [100, 1], [190, 2], [54, 0], [146, 2]]) {
      const hit = nearestPoint(points, plotFraction(px / 200, { width: 200, pad: 10 }), { domain: [10, 190] })
      assert.equal(hit.index, want, `${px}px`)
    }
  })
})

describe('linePaths drawn', () => {
  test('lists the points the line runs through, and all of them when nothing is thinned', () => {
    const pts = [{ x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 3 }]
    assert.deepEqual(linePaths(pts, { width: 100, height: 50 }).drawn, pts)
    assert.deepEqual(linePaths([], { width: 100, height: 50 }).drawn, [])
    const many = Array.from({ length: 1000 }, (_, i) => ({ x: i, y: i % 7 }))
    const drawn = linePaths(many, { width: 50, height: 50, maxPoints: 40 }).drawn
    assert.ok(drawn.length <= 40)
    assert.equal(drawn[0], many[0])
    assert.equal(drawn[drawn.length - 1], many[999])
  })
})
