import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { scale, linePath, linePaths, bandPath, seriesDomain, areaPaths, bandScale, bandGeometry, barPaths } from '../src/elements/chart.js'

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
    const { line, area, zeroY } = linePaths(points, { width: 900, height: 220, pad: 4 })
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
