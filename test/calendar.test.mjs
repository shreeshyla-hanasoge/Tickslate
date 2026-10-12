import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createCalendar, presets, activeProfile, nextProfileChange, usDaylightSaving, zonedTime, localDate } from '../src/core/index.js'

// IST instants, written the way the sessions are published.
const ist = (date, hhmm) => zonedTime(date, hhmm, 'Asia/Kolkata')
const MIN = 60000

const cal = createCalendar({
  sessions: [presets.nse(), presets.nse({ segment: 'derivatives' }), presets.mcx({ years: [2026, 2027] })],
  // A made-up holiday, so the tests don't depend on a real exchange list.
  holidays: { '*': ['2026-10-14'], nse: ['2026-10-15'] },
})

describe('time zones', () => {
  test('zonedTime and localDate round-trip IST', () => {
    assert.equal(ist('2026-10-12', '11:42'), Date.UTC(2026, 9, 12, 6, 12))
    assert.equal(localDate(Date.UTC(2026, 9, 12, 19, 0), 'Asia/Kolkata'), '2026-10-13')
  })

  test('zonedTime follows daylight saving in New York', () => {
    assert.equal(zonedTime('2026-03-06', '09:30', 'America/New_York'), Date.UTC(2026, 2, 6, 14, 30))
    assert.equal(zonedTime('2026-03-09', '09:30', 'America/New_York'), Date.UTC(2026, 2, 9, 13, 30))
  })

  test('US daylight saving dates come from Intl', () => {
    assert.deepEqual(usDaylightSaving(2026), { from: '2026-03-08', to: '2026-10-31' })
    assert.deepEqual(usDaylightSaving(2027), { from: '2027-03-14', to: '2027-11-06' })
  })
})

describe('NSE', () => {
  test('is open during the session, with progress', () => {
    const now = ist('2026-10-12', '11:42')
    const st = cal.state('nse', now)
    assert.equal(st.open, true)
    assert.equal(st.startedAt, ist('2026-10-12', '09:15'))
    assert.equal(st.closesAt, ist('2026-10-12', '15:30'))
    assert.ok(Math.abs(st.progress - 147 / 375) < 1e-9)
  })

  test('opens at 09:15 sharp and is closed at 15:30 sharp', () => {
    assert.equal(cal.state('nse', ist('2026-10-12', '09:14')).open, false)
    assert.equal(cal.state('nse', ist('2026-10-12', '09:15')).open, true)
    assert.equal(cal.state('nse', ist('2026-10-12', '15:30')).open, false)
  })

  test('F&O closes at 15:40 from 3 Aug 2026, and at 15:30 before', () => {
    assert.equal(cal.state('nse-fo', ist('2026-10-12', '15:35')).open, true)
    assert.equal(cal.hours('nse-fo', '2026-08-03').close, ist('2026-08-03', '15:40'))
    assert.equal(cal.hours('nse-fo', '2026-07-31').close, ist('2026-07-31', '15:30'))
  })

  test('after Friday close, the next open is Monday', () => {
    const st = cal.state('nse', ist('2026-10-16', '16:00'))
    assert.deepEqual([st.open, st.opensAt], [false, ist('2026-10-19', '09:15')])
    assert.equal(cal.isTradingDay('nse', '2026-10-17'), false)
  })

  test('skips holidays, both shared and per session', () => {
    assert.equal(cal.isTradingDay('nse', '2026-10-14'), false)
    assert.equal(cal.isTradingDay('nse', '2026-10-15'), false)
    assert.equal(cal.isTradingDay('nse-fo', '2026-10-15'), true)
    assert.equal(cal.state('nse', ist('2026-10-13', '18:00')).opensAt, ist('2026-10-16', '09:15'))
  })

  test('nextChange gives the next open or close', () => {
    assert.deepEqual(cal.nextChange('nse', ist('2026-10-12', '08:00')), { at: ist('2026-10-12', '09:15'), to: 'open' })
    assert.deepEqual(cal.nextChange('nse', ist('2026-10-12', '10:00')), { at: ist('2026-10-12', '15:30'), to: 'closed' })
  })
})

describe('MCX', () => {
  test('closes at 23:30 while the US is on daylight saving', () => {
    assert.equal(cal.hours('mcx', '2026-10-12').close, ist('2026-10-12', '23:30'))
    assert.equal(cal.hours('mcx', '2026-03-09').close, ist('2026-03-09', '23:30'))
  })

  test('closes at 23:55 otherwise', () => {
    assert.equal(cal.hours('mcx', '2026-11-02').close, ist('2026-11-02', '23:55'))
    assert.equal(cal.hours('mcx', '2026-03-06').close, ist('2026-03-06', '23:55'))
  })

  test('cotton and agri segments have their own hours', () => {
    assert.equal(presets.mcx({ segment: 'cotton' }).close, '21:00')
    assert.equal(presets.mcx({ segment: 'agri' }).close, '17:00')
    assert.throws(() => presets.mcx({ segment: 'gold' }), RangeError)
    assert.throws(() => presets.nse({ segment: 'currency' }), RangeError)
  })
})

describe('candle closes', () => {
  test('align to the session open', () => {
    const now = ist('2026-10-12', '11:42') + 20000
    assert.equal(cal.candleClose('nse', now, 5), ist('2026-10-12', '11:45'))
    assert.equal(cal.candleClose('nse', now, 15), ist('2026-10-12', '11:45'))
    assert.equal(cal.candleClose('nse', ist('2026-10-12', '09:20'), 5), ist('2026-10-12', '09:25'))
  })

  test('the last candle closes with the session', () => {
    assert.equal(cal.candleClose('nse', ist('2026-10-12', '15:20'), 15), ist('2026-10-12', '15:30'))
  })

  test('there is none while closed', () => {
    assert.equal(cal.candleClose('nse', ist('2026-10-12', '16:00'), 5), null)
    assert.throws(() => cal.candleClose('nse', 0, 0), RangeError)
  })
})

describe('special sessions and windows', () => {
  const special = createCalendar({
    sessions: [{ ...presets.nse(), specialSessions: { '2026-11-08': { open: '18:00', close: '19:00' } } }],
    holidays: { nse: ['2026-11-09'] },
  })

  test('a special session trades on a weekend', () => {
    assert.equal(special.isTradingDay('nse', '2026-11-08'), true)
    assert.equal(special.state('nse', ist('2026-11-08', '18:30')).open, true)
  })

  test('windows lists every session overlapping a range', () => {
    const ws = special.windows('nse', ist('2026-11-06', '00:00'), ist('2026-11-11', '00:00'))
    assert.deepEqual(ws.map((w) => localDate(w.open, 'Asia/Kolkata')), ['2026-11-06', '2026-11-08', '2026-11-10'])
  })
})

describe('validation', () => {
  test('rejects bad session specs', () => {
    const ok = presets.nse()
    assert.throws(() => createCalendar({ sessions: [{ ...ok, timeZone: 'Mars/Olympus' }] }), /time zone/)
    assert.throws(() => createCalendar({ sessions: [{ ...ok, close: '09:00' }] }), /cross midnight/)
    assert.throws(() => createCalendar({ sessions: [{ ...ok, open: '9:15' }] }), /HH:MM/)
    assert.throws(() => createCalendar({ sessions: [{ ...ok, days: [0] }] }), /weekdays/)
    assert.throws(() => createCalendar({ sessions: [ok, ok] }), /Two sessions/)
    assert.throws(() => createCalendar({ sessions: [ok], holidays: { nse: ['14/10/2026'] } }), /YYYY-MM-DD/)
    assert.throws(() => cal.state('lse', 0), RangeError)
  })
})

describe('layout profile', () => {
  // The Traed spec's market hours: NSE widened to 09:00–15:35.
  const nseOnly = { market: { sessions: ['nse'], leadMinutes: 15, lagMinutes: 5 } }

  test('market from 15 minutes before the open to 5 after the close', () => {
    assert.equal(activeProfile(cal, nseOnly, ist('2026-10-12', '08:59')), 'closed')
    assert.equal(activeProfile(cal, nseOnly, ist('2026-10-12', '09:00')), 'market')
    assert.equal(activeProfile(cal, nseOnly, ist('2026-10-12', '15:34') + 59000), 'market')
    assert.equal(activeProfile(cal, nseOnly, ist('2026-10-12', '15:35')), 'closed')
  })

  test('nextProfileChange finds the next switch', () => {
    assert.equal(nextProfileChange(cal, nseOnly, ist('2026-10-12', '08:00')), ist('2026-10-12', '09:00'))
    assert.equal(nextProfileChange(cal, nseOnly, ist('2026-10-12', '12:00')), ist('2026-10-12', '15:35'))
    assert.equal(nextProfileChange(cal, nseOnly, ist('2026-10-16', '20:00')), ist('2026-10-19', '09:00'))
  })

  test('including MCX keeps market hours until it closes', () => {
    const both = { market: { sessions: ['nse', 'mcx'], leadMinutes: 15, lagMinutes: 5 } }
    assert.equal(activeProfile(cal, both, ist('2026-10-12', '20:00')), 'market')
    assert.equal(nextProfileChange(cal, both, ist('2026-10-12', '12:00')), ist('2026-10-12', '23:35'))
    assert.equal(activeProfile(cal, both, ist('2026-10-12', '08:50')), 'market', 'MCX opens at 09:00, so its lead starts at 08:45')
  })

  test('a schedule without sessions is an error', () => {
    assert.throws(() => activeProfile(cal, {}, 0), TypeError)
  })
})

test('state and profile are quick enough to call every second', () => {
  const both = { market: { sessions: ['nse', 'mcx'], leadMinutes: 15, lagMinutes: 5 } }
  const start = performance.now()
  for (let i = 0; i < 200; i++) {
    cal.state('mcx', ist('2026-10-12', '12:00') + i * MIN)
    activeProfile(cal, both, ist('2026-10-12', '12:00') + i * MIN)
  }
  const each = (performance.now() - start) / 200
  assert.ok(each < 5, `${each.toFixed(2)} ms per tick`)
})
