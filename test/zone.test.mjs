import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createCalendar, zonedTime, localDate } from '../src/core/index.js'
import { zonedParts } from '../src/core/zone.js'

const NY = 'America/New_York'
const MIN = 60000
const HOUR = 60 * MIN
const utc = (...args) => Date.UTC(...args)

describe('zonedTime in a spring-forward gap', () => {
  test('New York: 02:30 on 8 Mar 2026 never happened, and lands 03:30 EDT', () => {
    assert.equal(zonedTime('2026-03-08', '02:30', NY), utc(2026, 2, 8, 7, 30))
    assert.equal(zonedTime('2026-03-08', '02:00', NY), utc(2026, 2, 8, 7, 0), 'the first minute of the gap lands on the first minute after it')
    assert.equal(zonedTime('2026-03-08', '02:59', NY), utc(2026, 2, 8, 7, 59))
  })

  test('the times either side of the gap are as they were', () => {
    assert.equal(zonedTime('2026-03-08', '01:59', NY), utc(2026, 2, 8, 6, 59), '01:59 EST')
    assert.equal(zonedTime('2026-03-08', '03:00', NY), utc(2026, 2, 8, 7, 0), '03:00 EDT')
  })

  test('west of Greenwich, east of it and in the southern hemisphere', () => {
    assert.equal(zonedTime('2026-03-08', '02:30', 'America/Chicago'), utc(2026, 2, 8, 8, 30), '03:30 CDT')
    assert.equal(zonedTime('2026-03-29', '01:30', 'Europe/London'), utc(2026, 2, 29, 1, 30), '02:30 BST')
    assert.equal(zonedTime('2026-10-04', '02:30', 'Australia/Sydney'), utc(2026, 9, 3, 16, 30), '03:30 AEDT')
  })

  test('Lord Howe has a 30-minute gap, and Chatham a 60-minute one on a 45-minute offset', () => {
    // 4 Oct 2026, 02:00 LHST (+10:30) jumps to 02:30 LHDT (+11:00).
    assert.equal(zonedTime('2026-10-04', '01:59', 'Australia/Lord_Howe'), utc(2026, 9, 3, 15, 29))
    assert.equal(zonedTime('2026-10-04', '02:15', 'Australia/Lord_Howe'), utc(2026, 9, 3, 15, 45), '02:45 LHDT')
    assert.equal(zonedTime('2026-10-04', '02:30', 'Australia/Lord_Howe'), utc(2026, 9, 3, 15, 30), 'the first minute after the gap')
    // 27 Sep 2026, 02:45 CHAST (+12:45) jumps to 03:45 CHADT (+13:45).
    assert.equal(zonedTime('2026-09-27', '02:44', 'Pacific/Chatham'), utc(2026, 8, 26, 13, 59))
    assert.equal(zonedTime('2026-09-27', '03:00', 'Pacific/Chatham'), utc(2026, 8, 26, 14, 15), '04:00 CHADT')
    assert.equal(zonedTime('2026-09-27', '03:45', 'Pacific/Chatham'), utc(2026, 8, 26, 14, 0))
  })

  test('zones without daylight saving are plain offsets', () => {
    assert.equal(zonedTime('2026-03-08', '02:30', 'Asia/Kolkata'), utc(2026, 2, 7, 21, 0))
    assert.equal(zonedTime('2026-03-08', '02:30', 'Asia/Kathmandu'), utc(2026, 2, 7, 20, 45))
    assert.equal(zonedTime('2026-03-08', '02:30', 'UTC'), utc(2026, 2, 8, 2, 30))
  })

  test('the earlier occurrence of a time that happened twice', () => {
    // 1 Nov 2026: 02:00 EDT goes back to 01:00 EST, so 01:30 is read twice.
    assert.equal(zonedTime('2026-11-01', '01:30', NY), utc(2026, 10, 1, 5, 30), '01:30 EDT, not EST')
    assert.equal(zonedTime('2026-11-01', '00:59', NY), utc(2026, 10, 1, 4, 59))
    assert.equal(zonedTime('2026-11-01', '02:00', NY), utc(2026, 10, 1, 7, 0), '02:00 EST')
    // 5 Apr 2026, 02:00 LHDT goes back to 01:30 LHST: 01:45 is read twice.
    assert.equal(zonedTime('2026-04-05', '01:45', 'Australia/Lord_Howe'), utc(2026, 3, 4, 14, 45), '01:45 LHDT')
  })

  test('every quarter hour of the days around each change reads back as asked, or as the first time after the gap', () => {
    const changes = [
      ['America/New_York', '2026-03-08'], ['America/New_York', '2026-11-01'], ['Europe/London', '2026-03-29'], ['Europe/London', '2026-10-25'],
      ['Australia/Lord_Howe', '2026-10-04'], ['Australia/Lord_Howe', '2026-04-05'], ['Pacific/Chatham', '2026-09-27'], ['Pacific/Chatham', '2026-04-05'],
    ]
    const pad = (n) => String(n).padStart(2, '0')
    for (const [zone, date] of changes) {
      let last = -Infinity
      for (let m = 0; m < 24 * 60; m += 15) {
        const hhmm = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
        const t = zonedTime(date, hhmm, zone)
        const p = zonedParts(t, zone)
        const read = p.hour * 60 + p.minute
        const where = `${zone} ${date} ${hhmm}`
        // A time that happened reads back as itself. One that did not reads later, never earlier.
        assert.ok(localDate(t, zone) === date && read >= m, where)
        // Times that happened keep their order (a gap time is shifted past the gap, so it is left out).
        if (read === m) {
          assert.ok(t > last, `${where} is not after the quarter hour that came before it`)
          last = t
        }
      }
    }
  })
})

describe('windows around a spring-forward gap', () => {
  const cal = (spec) => createCalendar({ sessions: [{ id: 's', label: 'S', timeZone: NY, days: [1, 2, 3, 4, 5, 6, 7], ...spec }] })

  test('a Saturday evening window that ends in the gap is 8.5 hours', () => {
    const c = cal({ open: '18:00', close: '02:30' })
    const w = c.hours('s', '2026-03-07')
    assert.equal(w.open, utc(2026, 2, 7, 23, 0))
    assert.equal(w.close, utc(2026, 2, 8, 7, 30))
    assert.equal(w.close - w.open, 8.5 * HOUR)
  })

  test('01:30 to 02:30 on the day is the one real hour, not an empty window', () => {
    const c = cal({ open: '01:30', close: '02:30' })
    assert.deepEqual(c.hours('s', '2026-03-08'), { open: utc(2026, 2, 8, 6, 30), close: utc(2026, 2, 8, 7, 30) })
    assert.equal(c.state('s', utc(2026, 2, 8, 7, 0)).open, true)
  })

  test('a window that is over as soon as it begins never traded, and is not listed', () => {
    // 02:30 is in the gap and lands on 03:30 EDT, the very instant 03:30 is.
    const c = cal({ days: [7], open: '02:30', close: '03:30' })
    assert.equal(c.hours('s', '2026-03-08'), null)
    assert.deepEqual(c.windows('s', utc(2026, 2, 8), utc(2026, 2, 9)), [])
    assert.equal(c.state('s', utc(2026, 2, 8, 7, 20)).open, false)
  })
})
