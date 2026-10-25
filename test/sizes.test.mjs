import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BREAKPOINTS, columnsFor, deviceFor, validThresholds } from '../src/core/sizes.js'

test('without thresholds the defaults apply', () => {
  assert.equal(columnsFor(1200), 4)
  assert.equal(columnsFor(1199), 3)
  assert.equal(columnsFor(700), 3)
  assert.equal(columnsFor(699), 2)
  assert.equal(deviceFor(699), 'phone')
  assert.equal(deviceFor(700), 'desktop')
  assert.deepEqual({ ...BREAKPOINTS }, { desktop: 1200, tablet: 700 })
})

test('a host desktop threshold moves the 4-column switch and keeps the tablet default', () => {
  assert.equal(columnsFor(1599, { desktop: 1600 }), 3)
  assert.equal(columnsFor(1600, { desktop: 1600 }), 4)
  assert.equal(columnsFor(700, { desktop: 1600 }), 3)
  assert.equal(columnsFor(699, { desktop: 1600 }), 2)
})

test('a host tablet threshold moves the phone switch, and deviceFor follows it', () => {
  assert.equal(columnsFor(800, { tablet: 900 }), 2)
  assert.equal(deviceFor(899, { tablet: 900 }), 'phone')
  assert.equal(deviceFor(900, { tablet: 900 }), 'desktop')
  assert.equal(columnsFor(900, { tablet: 900 }), 3)
  assert.equal(columnsFor(1200, { tablet: 900 }), 4)
})

test('both thresholds can be set at once', () => {
  const t = { tablet: 500, desktop: 900 }
  assert.deepEqual([499, 500, 899, 900].map((w) => columnsFor(w, t)), [2, 3, 3, 4])
})

test('an empty, null or undefined thresholds object behaves as the defaults', () => {
  for (const t of [undefined, null, {}, { tablet: undefined, desktop: undefined }]) {
    assert.equal(columnsFor(1000, t), 3)
    assert.equal(columnsFor(1200, t), 4)
  }
})

test('invalid thresholds fall back to the defaults as a pair', () => {
  const bad = [
    { tablet: 0 },
    { tablet: -5, desktop: 1600 },
    { desktop: NaN },
    { desktop: Infinity },
    { desktop: '1600' },
    { tablet: 1300 }, // not below the default desktop
    { tablet: 900, desktop: 900 },
    { tablet: 1000, desktop: 800 },
    'wide',
    42,
  ]
  for (const t of bad) {
    assert.equal(validThresholds(t), false, JSON.stringify(t))
    assert.equal(columnsFor(1300, t), 4, JSON.stringify(t))
    assert.equal(columnsFor(1000, t), 3, JSON.stringify(t))
    assert.equal(columnsFor(600, t), 2, JSON.stringify(t))
  }
})

test('valid thresholds are reported as valid', () => {
  for (const t of [undefined, null, {}, { desktop: 1600 }, { tablet: 600 }, { tablet: 500, desktop: 900 }]) {
    assert.equal(validThresholds(t), true, JSON.stringify(t))
  }
})

test('an unmeasured width still lands on the phone grid with thresholds', () => {
  assert.equal(columnsFor(NaN, { desktop: 1600 }), 2)
  assert.equal(columnsFor(undefined, { desktop: 1600 }), 2)
  assert.equal(columnsFor(Infinity, { desktop: 1600 }), 4)
})
