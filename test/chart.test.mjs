import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { scale, linePath, linePaths, bandPath } from '../src/elements/chart.js'

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
