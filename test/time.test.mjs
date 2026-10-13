import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { toTime, toDay } from '../src/core/index.js'

const OCT_12 = Date.UTC(2026, 9, 12)

describe('toTime', () => {
  test('seconds and milliseconds are the same instant', () => {
    assert.equal(toTime(1760331000), 1760331000000)
    assert.equal(toTime(1760331000000), 1760331000000)
    assert.equal(toTime(1760331000), toTime(1760331000000))
  })

  test('the boundary is |n| = 1e11, ms at and above it', () => {
    assert.equal(toTime(99_999_999_999), 99_999_999_999_000)
    assert.equal(toTime(1e11), 1e11)
    assert.equal(toTime(0), 0)
  })

  test('negative epochs follow the same rule', () => {
    assert.equal(toTime(-86400), -86400000)
    assert.equal(toTime(-1e11), -1e11)
    assert.equal(toTime(-99_999_999_999), -99_999_999_999_000)
  })

  test('numbers that are not finite, or beyond a Date, are NaN', () => {
    for (const v of [NaN, Infinity, -Infinity, 1e17]) assert.ok(Number.isNaN(toTime(v)), String(v))
  })

  test('Date objects give getTime(), and an invalid Date is NaN', () => {
    assert.equal(toTime(new Date(OCT_12)), OCT_12)
    assert.ok(Number.isNaN(toTime(new Date('nope'))))
  })

  test('ISO strings with Z, offsets and no time', () => {
    assert.equal(toTime('2026-10-12T00:00:00Z'), OCT_12)
    assert.equal(toTime('2026-10-12T05:30:00+05:30'), OCT_12)
    assert.equal(toTime('2026-10-12T05:30:00+0530'), OCT_12)
    assert.equal(toTime('2026-10-12T05:30+05:30'), OCT_12)
    assert.equal(toTime('2026-10-11T18:30:00-05:30'), Date.UTC(2026, 9, 12, 0, 0))
    assert.equal(toTime('2026-10-12'), OCT_12)
    assert.equal(toTime(' 2026-10-12T00:00:00Z '), OCT_12)
  })

  test('Laravel microsecond strings', () => {
    assert.equal(toTime('2026-10-12T00:00:00.000000Z'), OCT_12)
    assert.equal(toTime('2026-10-12T10:15:30.123456Z'), Date.UTC(2026, 9, 12, 10, 15, 30, 123))
    assert.equal(toTime('2026-10-12T10:15:30.5Z'), Date.UTC(2026, 9, 12, 10, 15, 30, 500))
    assert.equal(toTime('2026-10-12 10:15:30Z'), Date.UTC(2026, 9, 12, 10, 15, 30))
  })

  test('numeric strings follow the number rule', () => {
    assert.equal(toTime('1760331000'), 1760331000000)
    assert.equal(toTime('1760331000000'), 1760331000000)
    assert.equal(toTime(' 1.76033100e9 '), 1760331000000)
  })

  test('anything else is NaN', () => {
    for (const v of ['', 'x', 'March 5', '0x10', '2026-13-45', null, undefined, {}, [], true]) assert.ok(Number.isNaN(toTime(v)), String(v))
  })
})

describe('toDay', () => {
  test("'YYYY-MM-DD' is returned unchanged", () => {
    assert.equal(toDay('2026-10-12'), '2026-10-12')
    assert.equal(toDay('2026-10-12', 'Asia/Kolkata'), '2026-10-12')
  })

  test('an exact UTC-midnight ISO string is its date part, in any zone', () => {
    for (const s of ['2026-10-12T00:00:00Z', '2026-10-12T00:00:00.000000Z', '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00+00:00']) {
      assert.equal(toDay(s), '2026-10-12', s)
      assert.equal(toDay(s, 'Asia/Kolkata'), '2026-10-12', s)
      assert.equal(toDay(s, 'America/New_York'), '2026-10-12', s)
    }
  })

  test('any other instant is the local date in the zone', () => {
    assert.equal(toDay('2026-10-11T18:30:00.000000Z', 'Asia/Kolkata'), '2026-10-12')
    assert.equal(toDay('2026-10-11T18:30:00.000000Z'), '2026-10-11')
    assert.equal(toDay(Date.UTC(2026, 9, 11, 18, 30), 'Asia/Kolkata'), '2026-10-12')
    assert.equal(toDay(Date.UTC(2026, 9, 11, 18, 30) / 1000, 'Asia/Kolkata'), '2026-10-12')
    assert.equal(toDay(new Date(Date.UTC(2026, 9, 11, 18, 30)), 'Asia/Kolkata'), '2026-10-12')
  })

  test('anything unreadable is null', () => {
    for (const v of ['', 'x', null, undefined, {}, NaN, new Date('nope')]) assert.equal(toDay(v), null, String(v))
  })
})
