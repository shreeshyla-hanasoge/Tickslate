import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
    assert.throws(() => createCalendar({ sessions: [{ ...ok, close: '24:00' }] }), /HH:MM/)
    assert.throws(() => createCalendar({ sessions: [{ ...ok, open: '9:15' }] }), /HH:MM/)
    assert.throws(() => createCalendar({ sessions: [{ ...ok, days: [0] }] }), /weekdays/)
    assert.throws(() => createCalendar({ sessions: [ok, ok] }), /Two sessions/)
    assert.throws(() => createCalendar({ sessions: [ok], holidays: { nse: ['14/10/2026'] } }), /YYYY-MM-DD/)
    assert.throws(() => cal.state('lse', 0), RangeError)
  })
})

describe('layout profile', () => {
  // Example market hours: NSE widened to 09:00–15:35.
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

// Counts the Intl work `tick(i)` does over many calls instead of timing it: a
// clock flakes under load. The cost of a tick is its zone formatting, so a tick
// that builds a formatter (milliseconds each) or formats many times is the
// regression to catch. The first calls warm the caches, as a live clock's first
// tick does.
function intlWork(tick, ticks = 200) {
  const Native = Intl.DateTimeFormat
  const nativeParts = Native.prototype.formatToParts
  const work = { constructed: 0, formatted: 0 }
  function Counted(...args) {
    work.constructed++
    return Reflect.construct(Native, args)
  }
  Counted.prototype = Native.prototype
  Object.setPrototypeOf(Counted, Native)
  try {
    for (let i = 0; i < 5; i++) tick(i)
    Intl.DateTimeFormat = Counted
    Native.prototype.formatToParts = function (...args) {
      work.formatted++
      return nativeParts.apply(this, args)
    }
    for (let i = 5; i < 5 + ticks; i++) tick(i)
  } finally {
    Intl.DateTimeFormat = Native
    Native.prototype.formatToParts = nativeParts
  }
  return { ...work, perTick: work.formatted / ticks }
}

test('state and profile are quick enough to call every second', () => {
  const both = { market: { sessions: ['nse', 'mcx'], leadMinutes: 15, lagMinutes: 5 } }
  const noon = ist('2026-10-12', '12:00') // outside the counted ticks: zonedTime formats too
  const work = intlWork((i) => {
    cal.state('mcx', noon + i * MIN)
    activeProfile(cal, both, noon + i * MIN)
  })
  // Measured: no constructions and 5 formatToParts calls per tick.
  assert.equal(work.constructed, 0, 'a tick builds no Intl formatter once the caches are warm')
  assert.ok(work.formatted > 0, 'the counter sees the zone formatting')
  assert.ok(work.perTick <= 8, `${work.perTick} formatToParts calls per tick`)
})

// ── Overnight and 24/7 sessions (RFC 0003 §12) ───────────────────────────

const CHI = 'America/Chicago'
const NY = 'America/New_York'
const chi = (date, hhmm) => zonedTime(date, hhmm, CHI)
const ny = (date, hhmm) => zonedTime(date, hhmm, NY)
const HOUR = 60 * MIN

// A made-up futures exchange: opens Sunday to Thursday evening, closes the next afternoon.
const cme = { id: 'cme', label: 'CME', timeZone: CHI, days: [7, 1, 2, 3, 4], open: '17:00', close: '16:00' }
// A made-up FX week: daily 24-hour windows from Sunday 17:00 to Friday 17:00.
const fx = { id: 'fx', label: 'FX', timeZone: NY, days: [7, 1, 2, 3, 4], open: '17:00', close: '17:00' }
const crypto = { id: 'crypto', label: 'Crypto', timeZone: 'UTC', days: [1, 2, 3, 4, 5, 6, 7], open: '00:00', close: '00:00' }
const night = createCalendar({ sessions: [cme, fx, crypto] })

describe('overnight windows', () => {
  test('a close before the open is on the next local day, and a close equal to it makes a 24-hour session', () => {
    // 12 Oct 2026 is a Monday.
    assert.deepEqual(night.hours('cme', '2026-10-12'), { open: chi('2026-10-12', '17:00'), close: chi('2026-10-13', '16:00') })
    assert.equal(night.hours('cme', '2026-10-12').close - night.hours('cme', '2026-10-12').open, 23 * HOUR)
    assert.deepEqual(night.hours('crypto', '2026-10-12'), { open: Date.UTC(2026, 9, 12), close: Date.UTC(2026, 9, 13) })
  })

  test('days names the weekday a window opens on', () => {
    assert.equal(night.isTradingDay('cme', '2026-10-18'), true, 'Sunday')
    assert.equal(night.isTradingDay('cme', '2026-10-16'), false, "Friday: nothing opens, though Thursday's window runs into it")
    assert.equal(night.isTradingDay('cme', '2026-10-17'), false, 'Saturday')
  })

  test('CME-style: Monday 10:00 is open until Monday 16:00', () => {
    const st = night.state('cme', chi('2026-10-12', '10:00'))
    assert.equal(st.open, true)
    assert.equal(st.closesAt, chi('2026-10-12', '16:00'))
    assert.equal(st.startedAt, chi('2026-10-11', '17:00'), 'opened on Sunday evening')
    assert.ok(Math.abs(st.progress - 17 / 23) < 1e-9)
    assert.deepEqual(night.nextChange('cme', chi('2026-10-12', '10:00')), { at: chi('2026-10-12', '16:00'), to: 'closed' })
  })

  test('CME-style: Monday 16:30 is closed until Monday 17:00', () => {
    const st = night.state('cme', chi('2026-10-12', '16:30'))
    assert.deepEqual([st.open, st.opensAt, st.closesAt], [false, chi('2026-10-12', '17:00'), null])
    assert.deepEqual(night.nextChange('cme', chi('2026-10-12', '16:30')), { at: chi('2026-10-12', '17:00'), to: 'open' })
  })

  test('CME-style: the weekend gap ends on Sunday 17:00', () => {
    const fri = night.state('cme', chi('2026-10-16', '16:30'))
    assert.deepEqual([fri.open, fri.opensAt], [false, chi('2026-10-18', '17:00')])
    assert.equal(night.state('cme', chi('2026-10-17', '12:00')).open, false)
    // Thursday evening's window runs through Friday morning.
    assert.equal(night.state('cme', chi('2026-10-16', '10:00')).open, true)
  })

  test('the window opens and closes to the instant', () => {
    assert.equal(night.state('cme', chi('2026-10-12', '16:00')).open, false)
    assert.equal(night.state('cme', chi('2026-10-12', '16:00') - 1).open, true)
    assert.equal(night.state('cme', chi('2026-10-12', '17:00') - 1).open, false)
    assert.equal(night.state('cme', chi('2026-10-12', '17:00')).open, true)
  })

  test('a holiday keys by the opening date', () => {
    // Monday's evening window is removed; Sunday's, which runs into Monday, is not.
    const cal = createCalendar({ sessions: [cme], holidays: { cme: ['2026-10-12'] } })
    assert.equal(cal.state('cme', chi('2026-10-12', '10:00')).open, true)
    assert.equal(cal.state('cme', chi('2026-10-13', '10:00')).open, false)
    assert.equal(cal.state('cme', chi('2026-10-13', '10:00')).opensAt, chi('2026-10-13', '17:00'))
    assert.equal(cal.isTradingDay('cme', '2026-10-12'), false)
  })

  test('a special session may cross midnight too', () => {
    const cal = createCalendar({ sessions: [{ ...cme, specialSessions: { '2026-10-17': { open: '18:00', close: '02:00' } } }] })
    assert.equal(cal.state('cme', chi('2026-10-17', '23:00')).open, true)
    assert.equal(cal.state('cme', chi('2026-10-18', '01:00')).closesAt, chi('2026-10-18', '02:00'))
    assert.equal(cal.state('cme', chi('2026-10-18', '03:00')).open, false)
  })

  test('candles align to the open and the last one closes with the session', () => {
    assert.equal(night.candleClose('cme', chi('2026-10-12', '10:07'), 15), chi('2026-10-12', '10:15'))
    assert.equal(night.candleClose('cme', chi('2026-10-12', '15:50'), 30), chi('2026-10-12', '16:00'))
    assert.equal(night.candleClose('cme', chi('2026-10-12', '16:30'), 15), null)
  })

  test('windows lists an overnight window that began before the range', () => {
    const ws = night.windows('cme', chi('2026-10-12', '10:00'), chi('2026-10-12', '20:00'))
    assert.deepEqual(ws, [
      { open: chi('2026-10-11', '17:00'), close: chi('2026-10-12', '16:00') },
      { open: chi('2026-10-12', '17:00'), close: chi('2026-10-13', '16:00') },
    ])
  })
})

describe('windows that touch merge', () => {
  test('an FX week is one window: Wednesday noon closes on Friday 17:00 New York', () => {
    const now = ny('2026-10-14', '12:00')
    const st = night.state('fx', now)
    assert.equal(st.open, true)
    assert.equal(st.closesAt, ny('2026-10-16', '17:00'))
    assert.equal(st.startedAt, ny('2026-10-11', '17:00'))
    assert.ok(Math.abs(st.progress - (now - st.startedAt) / (st.closesAt - st.startedAt)) < 1e-12)
    assert.deepEqual(night.nextChange('fx', now), { at: ny('2026-10-16', '17:00'), to: 'closed' })
    assert.deepEqual(night.windows('fx', ny('2026-10-14', '00:00'), ny('2026-10-15', '00:00')), [{ open: ny('2026-10-11', '17:00'), close: ny('2026-10-16', '17:00') }])
  })

  test('the weekend is the only gap', () => {
    const st = night.state('fx', ny('2026-10-17', '12:00'))
    assert.deepEqual([st.open, st.opensAt], [false, ny('2026-10-18', '17:00')])
    assert.equal(night.state('fx', ny('2026-10-16', '17:00')).open, false)
    assert.equal(night.state('fx', ny('2026-10-16', '17:00') - 1).open, true)
  })

  test('a join in the middle of the week is not a change', () => {
    assert.equal(night.state('fx', ny('2026-10-13', '17:00')).open, true)
    assert.equal(night.state('fx', ny('2026-10-13', '17:00') - 1).closesAt, ny('2026-10-16', '17:00'))
  })

  test('a holiday splits the run at the opening date it removes', () => {
    const cal = createCalendar({ sessions: [fx], holidays: { fx: ['2026-10-14'] } })
    // Wednesday's window (Wed 17:00 to Thu 17:00) is gone, so Tuesday's, ending Wednesday 17:00, closes the run.
    assert.equal(cal.state('fx', ny('2026-10-14', '12:00')).closesAt, ny('2026-10-14', '17:00'))
    assert.equal(cal.state('fx', ny('2026-10-15', '12:00')).open, false)
    assert.equal(cal.state('fx', ny('2026-10-15', '12:00')).opensAt, ny('2026-10-15', '17:00'))
  })
})

describe('sessions that never close', () => {
  const probes = []
  for (let t = Date.UTC(2026, 9, 12); t < Date.UTC(2026, 9, 19); t += 15 * MIN) probes.push(t)

  test('crypto is open at every probe with nothing to count down to', () => {
    for (const now of probes) {
      const st = night.state('crypto', now)
      assert.deepEqual(st, { open: true, onBreak: false, opensAt: null, closesAt: null, startedAt: null, progress: null, ends: null }, new Date(now).toISOString())
    }
    assert.equal(night.nextChange('crypto', probes[0]), null)
  })

  test('the profile stays market, and never changes', () => {
    const schedule = { market: { sessions: ['crypto'], leadMinutes: 15, lagMinutes: 5 } }
    for (const now of probes) {
      assert.equal(activeProfile(night, schedule, now), 'market')
      assert.equal(nextProfileChange(night, schedule, now), null)
    }
  })

  test('an always-open session keeps the market open whatever the others do', () => {
    const schedule = { market: { sessions: ['crypto', 'cme'] } }
    assert.equal(activeProfile(night, schedule, chi('2026-10-17', '12:00')), 'market')
    assert.equal(nextProfileChange(night, schedule, chi('2026-10-17', '12:00')), null)
  })

  test('candles align to the day', () => {
    const now = Date.UTC(2026, 9, 12, 10, 7)
    assert.equal(night.candleClose('crypto', now, 15), Date.UTC(2026, 9, 12, 10, 15))
    assert.equal(night.candleClose('crypto', now, 240), Date.UTC(2026, 9, 12, 12, 0))
  })

  test('a holiday within the month ends the run, and the calendar can say when', () => {
    const cal = createCalendar({ sessions: [crypto], holidays: { crypto: ['2026-10-25'] } })
    const st = cal.state('crypto', Date.UTC(2026, 9, 14, 12))
    assert.equal(st.open, true)
    assert.equal(st.closesAt, Date.UTC(2026, 9, 25))
    assert.equal(st.progress, null, 'it has been open for longer than the calendar looks back')
    assert.deepEqual(cal.nextChange('crypto', Date.UTC(2026, 9, 14, 12)), { at: Date.UTC(2026, 9, 25), to: 'closed' })
    assert.equal(cal.state('crypto', Date.UTC(2026, 9, 25, 12)).opensAt, Date.UTC(2026, 9, 26))
  })

  test('the profile for a run that ends within the month changes where it ends', () => {
    const cal = createCalendar({ sessions: [crypto], holidays: { crypto: ['2026-10-25'] } })
    assert.equal(nextProfileChange(cal, { market: { sessions: ['crypto'] } }, Date.UTC(2026, 9, 14, 12)), Date.UTC(2026, 9, 25))
  })
})

describe('daylight saving weeks', () => {
  const sampleOpen = (cal, id, from, to) => {
    const out = []
    for (let t = from; t < to; t += 15 * MIN) out.push(cal.state(id, t).open)
    return out
  }

  test('Chicago: a window across the spring change is 22 hours, and across the fall change 24', () => {
    // Saturday evening to Sunday afternoon: the clocks change in between, at 02:00 on Sunday.
    const sat = createCalendar({ sessions: [{ ...cme, id: 'sat', days: [6] }] })
    const spring = sat.hours('sat', '2026-03-07')
    assert.equal(spring.open, Date.UTC(2026, 2, 7, 23))
    assert.equal(spring.close, Date.UTC(2026, 2, 8, 21))
    assert.equal(spring.close - spring.open, 22 * HOUR)
    const fall = sat.hours('sat', '2026-10-31')
    assert.equal(fall.open, Date.UTC(2026, 9, 31, 22))
    assert.equal(fall.close, Date.UTC(2026, 10, 1, 22))
    assert.equal(sat.state('sat', Date.UTC(2026, 2, 8, 20, 59)).open, true)
    assert.equal(sat.state('sat', Date.UTC(2026, 2, 8, 21)).open, false)
  })

  test('Chicago: the weekend gap ends at 17:00 local on both sides of a change', () => {
    assert.equal(night.state('cme', chi('2026-03-06', '16:30')).opensAt, Date.UTC(2026, 2, 8, 22), 'Sunday 17:00 CDT')
    assert.equal(night.state('cme', chi('2026-10-30', '16:30')).opensAt, Date.UTC(2026, 10, 1, 23), 'Sunday 17:00 CST, the clocks changed that morning')
    assert.equal(night.state('cme', chi('2026-11-06', '16:30')).opensAt, Date.UTC(2026, 10, 8, 23), 'Sunday 17:00 CST')
  })

  test('Chicago: the Monday after a change closes at 16:00 on the new clock', () => {
    assert.equal(night.state('cme', chi('2026-03-09', '10:00')).closesAt, Date.UTC(2026, 2, 9, 21))
    assert.equal(night.state('cme', chi('2026-11-02', '10:00')).closesAt, Date.UTC(2026, 10, 2, 22))
  })

  test('New York: the FX weeks after the spring and fall changes', () => {
    assert.equal(night.state('fx', ny('2026-03-11', '12:00')).startedAt, Date.UTC(2026, 2, 8, 21), 'Sunday 17:00 EDT')
    assert.equal(night.state('fx', ny('2026-03-11', '12:00')).closesAt, Date.UTC(2026, 2, 13, 21))
    assert.equal(night.state('fx', ny('2026-11-04', '12:00')).startedAt, Date.UTC(2026, 10, 1, 22), 'Sunday 17:00 EST')
    assert.equal(night.state('fx', ny('2026-11-04', '12:00')).closesAt, Date.UTC(2026, 10, 6, 22))
  })

  test('daily windows touch across the 23- and 25-hour days, so a round-the-clock session never closes', () => {
    const daily = createCalendar({ sessions: [{ ...crypto, id: 'daily-ny', timeZone: NY }, { ...crypto, id: 'daily-chi', timeZone: CHI }] })
    for (const id of ['daily-ny', 'daily-chi']) {
      for (const [from, to] of [[Date.UTC(2026, 2, 6), Date.UTC(2026, 2, 11)], [Date.UTC(2026, 9, 30), Date.UTC(2026, 10, 4)]]) {
        assert.ok(sampleOpen(daily, id, from, to).every(Boolean), `${id} from ${new Date(from).toISOString()}`)
      }
    }
  })

  test('New York: the FX week around the spring change, sampled every 15 minutes, closes only for the weekend', () => {
    const first = ny('2026-03-08', '00:00')
    // Closed until Sunday 17:00 EDT, then from Friday 17:00 EDT to the next Sunday 17:00 EDT.
    const closed = (t) => t < ny('2026-03-08', '17:00') || (t >= ny('2026-03-13', '17:00') && t < ny('2026-03-15', '17:00'))
    sampleOpen(night, 'fx', first, ny('2026-03-16', '00:00')).forEach((open, i) => {
      const t = first + i * 15 * MIN
      assert.equal(open, !closed(t), new Date(t).toISOString())
    })
  })
})

describe('validation of overnight specs', () => {
  const make = (patch) => createCalendar({ sessions: [{ ...cme, ...patch }] })

  test('accepts a close before, or equal to, the open', () => {
    assert.doesNotThrow(() => make({ open: '22:00', close: '06:00' }))
    assert.doesNotThrow(() => make({ open: '00:00', close: '00:00' }))
    assert.doesNotThrow(() => make({ close: { default: '03:00', ranges: [{ from: '2026-01-01', to: '2026-01-31', close: '17:00' }] } }))
  })

  test("still rejects '24:00' and malformed times", () => {
    assert.throws(() => make({ close: '24:00' }), TypeError)
    assert.throws(() => make({ open: '24:00' }), TypeError)
    assert.throws(() => make({ close: { default: '24:00', ranges: [] } }), TypeError)
    assert.throws(() => make({ specialSessions: { '2026-10-17': { open: '18:00', close: '24:00' } } }), /special session/)
    assert.throws(() => make({ close: '4pm' }), /HH:MM/)
    assert.throws(() => make({ open: undefined }), /HH:MM/)
    assert.throws(() => make({ close: undefined }), /close must be/)
  })

  test('a range may close earlier or later than the open, per date', () => {
    const cal = make({ close: { default: '16:00', ranges: [{ from: '2026-12-24', to: '2026-12-24', close: '12:00' }] } })
    assert.equal(cal.hours('cme', '2026-12-24').close, chi('2026-12-25', '12:00'))
    assert.equal(cal.hours('cme', '2026-12-23').close, chi('2026-12-24', '16:00'))
  })
})

test('state is quick enough to call every second for a session that never closes', () => {
  const day = Date.UTC(2026, 9, 12)
  // Measured: 1 formatToParts call per tick.
  const work = intlWork((i) => night.state('crypto', day + i * 60 * MIN))
  assert.equal(work.constructed, 0, 'a tick builds no Intl formatter once the caches are warm')
  assert.ok(work.formatted > 0, 'the counter sees the zone formatting')
  assert.ok(work.perTick <= 3, `${work.perTick} formatToParts calls per tick`)
})

describe('a calendar reads its specs once', () => {
  test("changing the host's spec or holidays afterwards has no effect, and the caller's objects are not frozen", () => {
    const spec = { id: 'x', label: 'X', timeZone: 'UTC', days: [1, 2, 3, 4, 5], open: '09:00', close: '17:00', specialSessions: {} }
    const holidays = { x: ['2026-10-13'] }
    const c = createCalendar({ sessions: [spec], holidays })
    const monday = Date.UTC(2026, 9, 12, 10)
    assert.equal(c.state('x', monday).open, true)
    assert.equal(c.state('x', monday).closesAt, Date.UTC(2026, 9, 12, 17))
    spec.close = '12:00'
    spec.days.push(6)
    spec.specialSessions['2026-10-17'] = { open: '10:00', close: '11:00' }
    holidays.x.push('2026-10-12')
    assert.equal(c.state('x', monday).closesAt, Date.UTC(2026, 9, 12, 17))
    assert.equal(c.isTradingDay('x', '2026-10-17'), false)
    assert.equal(c.isTradingDay('x', '2026-10-12'), true)
    assert.equal(c.isTradingDay('x', '2026-10-13'), false)
    assert.equal(Object.isFrozen(spec) || Object.isFrozen(spec.days) || Object.isFrozen(holidays), false)
  })

  test('the spec a calendar hands back is frozen all the way down', () => {
    const c = createCalendar({
      sessions: [
        {
          id: 'x',
          label: 'X',
          timeZone: 'UTC',
          days: [1],
          open: '09:00',
          close: { default: '17:00', ranges: [{ from: '2026-01-01', to: '2026-01-31', close: '12:00' }] },
          specialSessions: { '2026-10-17': { open: '10:00', close: '11:00' } },
        },
      ],
    })
    const s = c.session('x')
    for (const v of [s, s.days, s.close, s.close.ranges, s.close.ranges[0], s.specialSessions, s.specialSessions['2026-10-17']]) assert.equal(Object.isFrozen(v), true)
  })
})

describe('windows() cuts a run at the look-ahead on both sides', () => {
  test('a never-closing run starts and ends a month outside the range, not at infinity', () => {
    const c = createCalendar({ sessions: [{ id: 'x', label: 'X', timeZone: 'UTC', days: [1, 2, 3, 4, 5, 6, 7], open: '00:00', close: '00:00' }] })
    const from = Date.UTC(2026, 9, 12)
    const to = Date.UTC(2026, 9, 13)
    const [w, ...rest] = c.windows('x', from, to)
    assert.equal(rest.length, 0)
    assert.ok(Number.isFinite(w.open) && Number.isFinite(w.close))
    assert.ok(w.open < from - 30 * 86400000 && w.close > to + 30 * 86400000)
  })
})

// ── Breaks, presets and holiday coverage (RFC 0004 §5) ──────────────────────

const TOKYO = 'Asia/Tokyo'
const tk = (date, hhmm) => zonedTime(date, hhmm, TOKYO)
const lunch = presets.tse()
const tokyo = createCalendar({ sessions: [lunch] })
// 26 Oct 2026 is a Monday.
const MON = '2026-10-26'

describe('breaks: the Tokyo lunch break', () => {
  test('state is open before the break, closed inside it and open again after, at the edges too', () => {
    const probe = (hhmm) => tokyo.state('tse', tk(MON, hhmm))
    assert.equal(probe('09:00').open, true)
    const before = probe('11:29')
    assert.deepEqual([before.open, before.onBreak, before.ends, before.closesAt, before.startedAt], [true, false, 'break', tk(MON, '11:30'), tk(MON, '09:00')])
    for (const hhmm of ['11:30', '12:00', '12:29']) {
      assert.deepEqual(probe(hhmm), { open: false, onBreak: true, opensAt: tk(MON, '12:30'), closesAt: null, startedAt: null, progress: null, ends: null }, hhmm)
    }
    const after = probe('12:30')
    assert.deepEqual([after.open, after.onBreak, after.ends, after.closesAt, after.startedAt], [true, false, 'close', tk(MON, '15:30'), tk(MON, '12:30')])
    assert.equal(probe('15:30').open, false)
    assert.equal(probe('15:30').onBreak, false)
  })

  test('progress runs from the open to the break, then from the break to the close', () => {
    assert.equal(tokyo.state('tse', tk(MON, '10:15')).progress, 0.5)
    assert.equal(tokyo.state('tse', tk(MON, '12:30')).progress, 0)
    assert.equal(tokyo.state('tse', tk(MON, '14:00')).progress, 0.5)
  })

  test('nextChange gives the start of the break and then its end', () => {
    assert.deepEqual(tokyo.nextChange('tse', tk(MON, '10:00')), { at: tk(MON, '11:30'), to: 'closed' })
    assert.deepEqual(tokyo.nextChange('tse', tk(MON, '11:45')), { at: tk(MON, '12:30'), to: 'open' })
    assert.deepEqual(tokyo.nextChange('tse', tk(MON, '13:00')), { at: tk(MON, '15:30'), to: 'closed' })
  })

  test('windows are the segments, hours is the whole window with its breaks', () => {
    const day = [tk(MON, '00:00'), tk('2026-10-27', '00:00')]
    assert.deepEqual(tokyo.windows('tse', ...day), [
      { open: tk(MON, '09:00'), close: tk(MON, '11:30') },
      { open: tk(MON, '12:30'), close: tk(MON, '15:30') },
    ])
    assert.deepEqual(tokyo.hours('tse', MON), { open: tk(MON, '09:00'), close: tk(MON, '15:30'), breaks: [{ from: tk(MON, '11:30'), to: tk(MON, '12:30') }] })
    // A session without breaks answers as before.
    assert.deepEqual(cal.hours('nse', '2026-10-12'), { open: ist('2026-10-12', '09:15'), close: ist('2026-10-12', '15:30') })
  })

  test('a window that overlaps the range only in the afternoon lists only the afternoon segment', () => {
    assert.deepEqual(tokyo.windows('tse', tk(MON, '13:00'), tk(MON, '14:00')), [{ open: tk(MON, '12:30'), close: tk(MON, '15:30') }])
    assert.deepEqual(tokyo.windows('tse', tk(MON, '11:40'), tk(MON, '12:00')), [])
  })

  test('candleClose stops at the break and starts again from its end', () => {
    assert.equal(tokyo.candleClose('tse', tk(MON, '11:28'), 5), tk(MON, '11:30'))
    assert.equal(tokyo.candleClose('tse', tk(MON, '11:28'), 15), tk(MON, '11:30'))
    assert.equal(tokyo.candleClose('tse', tk(MON, '12:00'), 5), null)
    // Aligned to 12:30, not to 09:00.
    assert.equal(tokyo.candleClose('tse', tk(MON, '12:31'), 15), tk(MON, '12:45'))
    assert.equal(tokyo.candleClose('tse', tk(MON, '10:01'), 15), tk(MON, '10:15'))
  })

  test('a Friday after the close opens on Monday morning', () => {
    const fri = tokyo.state('tse', tk('2026-10-30', '16:00'))
    assert.deepEqual([fri.open, fri.onBreak, fri.opensAt], [false, false, tk('2026-11-02', '09:00')])
  })

  test('touching windows still merge, but the two segments around a break never do', () => {
    const c = createCalendar({
      sessions: [{ id: 'x', label: 'X', timeZone: 'UTC', days: [1, 2, 3, 4, 5, 6, 7], open: '00:00', close: '00:00', breaks: [{ from: '12:00', to: '12:30' }] }],
    })
    const day = Date.UTC(2026, 9, 14)
    // The morning of each day runs into the previous afternoon; only the break separates runs.
    const ws = c.windows('x', day, day + 86400000)
    assert.equal(ws.length, 2)
    assert.equal(ws[0].close, day + 12 * 3600000)
    assert.equal(ws[1].open, day + 12.5 * 3600000)
    const st = c.state('x', day + 3 * 3600000)
    assert.equal(st.ends, 'break')
    assert.equal(st.startedAt, day - 11.5 * 3600000, 'the run began at the previous afternoon\'s 12:30')
    assert.equal(c.state('x', day + 13 * 3600000).startedAt, day + 12.5 * 3600000)
  })
})

describe('breaks: an overnight window, holidays, special sessions and close ranges', () => {
  const CHICAGO = 'America/Chicago'
  const ch = (date, hhmm) => zonedTime(date, hhmm, CHICAGO)
  // A made-up futures session that opens 18:10 and closes 15:50, with a pause after midnight.
  const futures = { id: 'fut', label: 'Futures', timeZone: CHICAGO, days: [7, 1, 2, 3, 4], open: '18:10', close: '15:50', breaks: [{ from: '02:20', to: '02:40' }] }
  const c = createCalendar({ sessions: [futures], holidays: { fut: ['2026-10-20'] } })

  test('a break at 02:20 belongs to the morning after the open', () => {
    // 12 Oct 2026 is a Monday: the window opens Monday 18:10 and closes Tuesday 15:50.
    assert.deepEqual(c.hours('fut', '2026-10-12').breaks, [{ from: ch('2026-10-13', '02:20'), to: ch('2026-10-13', '02:40') }])
    assert.equal(c.state('fut', ch('2026-10-13', '02:19')).ends, 'break')
    const inside = c.state('fut', ch('2026-10-13', '02:30'))
    assert.deepEqual([inside.open, inside.onBreak, inside.opensAt], [false, true, ch('2026-10-13', '02:40')])
    const after = c.state('fut', ch('2026-10-13', '02:40'))
    assert.deepEqual([after.open, after.startedAt, after.closesAt], [true, ch('2026-10-13', '02:40'), ch('2026-10-13', '15:50')])
    assert.deepEqual(c.windows('fut', ch('2026-10-12', '16:00'), ch('2026-10-13', '16:00')), [
      { open: ch('2026-10-12', '18:10'), close: ch('2026-10-13', '02:20') },
      { open: ch('2026-10-13', '02:40'), close: ch('2026-10-13', '15:50') },
    ])
  })

  test('a break in the evening of the open day is the same day\'s', () => {
    const e = createCalendar({ sessions: [{ ...futures, id: 'e', breaks: [{ from: '19:00', to: '19:15' }] }] })
    assert.deepEqual(e.hours('e', '2026-10-12').breaks, [{ from: ch('2026-10-12', '19:00'), to: ch('2026-10-12', '19:15') }])
  })

  test('a holiday removes the window, breaks and all', () => {
    assert.equal(c.hours('fut', '2026-10-20'), null)
    assert.equal(c.state('fut', ch('2026-10-21', '02:30')).onBreak, false)
    assert.equal(c.state('fut', ch('2026-10-21', '02:30')).open, false)
  })

  test('a special session has only its own breaks', () => {
    const s = createCalendar({
      sessions: [
        {
          ...lunch,
          id: 's',
          specialSessions: {
            '2026-10-27': { open: '09:00', close: '11:30' },
            '2026-10-28': { open: '09:00', close: '13:00', breaks: [{ from: '10:00', to: '10:10' }] },
          },
        },
      ],
    })
    assert.equal(s.hours('s', '2026-10-26').breaks.length, 1)
    assert.equal(s.hours('s', '2026-10-27').breaks, undefined)
    assert.equal(s.state('s', tk('2026-10-27', '11:00')).ends, 'close')
    assert.deepEqual(s.hours('s', '2026-10-28').breaks, [{ from: tk('2026-10-28', '10:00'), to: tk('2026-10-28', '10:10') }])
    assert.equal(s.state('s', tk('2026-10-28', '12:00')).onBreak, false)
  })

  test('a close range that ends before the break clips it for those dates', () => {
    const r = createCalendar({
      sessions: [{ ...lunch, id: 'r', close: { default: '15:30', ranges: [{ from: '2026-10-27', to: '2026-10-27', close: '11:00' }] } }],
    })
    assert.equal(r.hours('r', '2026-10-27').breaks, undefined)
    assert.deepEqual(r.state('r', tk('2026-10-27', '10:59')).ends, 'close')
    assert.equal(r.state('r', tk('2026-10-27', '11:00')).open, false)
    assert.equal(r.hours('r', '2026-10-26').breaks.length, 1)
  })
})

describe('a break that straddles a shorter close from a close range', () => {
  // Made up: opens 09:00, closes 23:55, but 23:30 on 2026-11-02, and a break 23:00 to 23:45 that the longest close contains.
  const base = { id: 'g', label: 'G', timeZone: 'UTC', days: [1, 2, 3, 4, 5], open: '09:00' }
  const withBreak = (breaks, close) => createCalendar({ sessions: [{ ...base, close, breaks }] })
  const at = (date, hhmm) => zonedTime(date, hhmm, 'UTC')
  const ranged = { default: '23:55', ranges: [{ from: '2026-11-02', to: '2026-11-02', close: '23:30' }] }
  const c = withBreak([{ from: '23:00', to: '23:45' }], ranged)

  test('the window closes where the break starts: no throw, no break left over', () => {
    for (const hhmm of ['22:59', '23:00', '23:10', '23:29', '23:30', '23:50']) {
      assert.doesNotThrow(() => {
        c.state('g', at('2026-11-02', hhmm))
        c.nextChange('g', at('2026-11-02', hhmm))
        c.candleClose('g', at('2026-11-02', hhmm), 5)
      }, hhmm)
    }
    const before = c.state('g', at('2026-11-02', '22:59'))
    assert.deepEqual([before.open, before.closesAt, before.ends], [true, at('2026-11-02', '23:00'), 'close'])
    assert.equal(c.state('g', at('2026-11-02', '23:10')).open, false)
    assert.equal(c.state('g', at('2026-11-02', '23:10')).onBreak, false)
    assert.deepEqual(c.nextChange('g', at('2026-11-02', '23:10')), { at: at('2026-11-03', '09:00'), to: 'open' })
    assert.equal(c.candleClose('g', at('2026-11-02', '22:59'), 5), at('2026-11-02', '23:00'))
    assert.deepEqual(c.hours('g', '2026-11-02'), { open: at('2026-11-02', '09:00'), close: at('2026-11-02', '23:00') })
  })

  test('the other days keep their break and their longer close', () => {
    assert.deepEqual(c.hours('g', '2026-11-03').breaks, [{ from: at('2026-11-03', '23:00'), to: at('2026-11-03', '23:45') }])
    assert.equal(c.state('g', at('2026-11-03', '23:10')).onBreak, true)
    assert.equal(c.state('g', at('2026-11-03', '23:50')).closesAt, at('2026-11-03', '23:55'))
  })

  test('a break that starts after the close is ignored', () => {
    const d = withBreak([{ from: '23:40', to: '23:50' }], ranged)
    assert.equal(d.hours('g', '2026-11-02').breaks, undefined)
    assert.equal(d.state('g', at('2026-11-02', '23:29')).closesAt, at('2026-11-02', '23:30'))
    assert.equal(d.state('g', at('2026-11-02', '23:45')).onBreak, false)
  })

  test('a break that starts exactly at the close is ignored', () => {
    const d = withBreak([{ from: '23:30', to: '23:50' }], ranged)
    assert.equal(d.hours('g', '2026-11-02').breaks, undefined)
    assert.equal(d.state('g', at('2026-11-02', '23:29')).closesAt, at('2026-11-02', '23:30'))
    assert.equal(d.state('g', at('2026-11-02', '23:30')).onBreak, false)
  })

  test('a break that ends exactly at the close is the close', () => {
    const d = withBreak([{ from: '23:00', to: '23:30' }], ranged)
    assert.deepEqual(d.hours('g', '2026-11-02'), { open: at('2026-11-02', '09:00'), close: at('2026-11-02', '23:00') })
    assert.equal(d.state('g', at('2026-11-02', '23:10')).onBreak, false)
  })

  test('a break that begins in a spring-forward gap is dropped, one that begins before it is stretched', () => {
    // New York, 2027-03-14: 02:00 to 03:00 does not exist and a time in it moves to the same minutes an hour later.
    // So 02:30 to 03:30 is 03:30 to 03:30 (nothing), and 01:30 to 02:30 is 01:30 to 03:30 (an hour).
    const ny = (breaks) => createCalendar({ sessions: [{ id: 'n', label: 'N', timeZone: 'America/New_York', days: [7], open: '00:00', close: '06:00', breaks }] })
    const z = (hhmm) => zonedTime('2027-03-14', hhmm, 'America/New_York')
    assert.equal(ny([{ from: '02:30', to: '03:30' }]).hours('n', '2027-03-14').breaks, undefined)
    assert.deepEqual(ny([{ from: '01:30', to: '02:30' }]).hours('n', '2027-03-14').breaks, [{ from: z('01:30'), to: z('03:30') }])
    assert.doesNotThrow(() => ny([{ from: '02:30', to: '03:30' }]).state('n', z('03:10')))
  })
})

describe('breaks and daylight saving', () => {
  test('London keeps its lunch break at the same clock time before and after the clocks go back', () => {
    const lon = createCalendar({ sessions: [{ id: 'l', label: 'L', timeZone: 'Europe/London', days: WEEK, open: '08:00', close: '16:30', breaks: [{ from: '12:00', to: '13:00' }] }] })
    for (const date of ['2026-10-23', '2026-10-26']) {
      const z = (hhmm) => zonedTime(date, hhmm, 'Europe/London')
      assert.deepEqual(lon.hours('l', date).breaks, [{ from: z('12:00'), to: z('13:00') }], date)
      assert.equal(lon.state('l', z('12:30')).onBreak, true, date)
    }
    // Clocks went back on Sunday 25 Oct: Friday is UTC+1, Monday UTC+0.
    assert.equal(lon.hours('l', '2026-10-23').breaks[0].from, Date.UTC(2026, 9, 23, 11))
    assert.equal(lon.hours('l', '2026-10-26').breaks[0].from, Date.UTC(2026, 9, 26, 12))
  })

  test('New York: a break that ends up outside its window on a spring-forward day is clamped away', () => {
    const c = createCalendar({ sessions: [{ id: 'n', label: 'N', timeZone: 'America/New_York', days: [7], open: '01:00', close: '03:15', breaks: [{ from: '02:30', to: '03:00' }] }] })
    // Sunday 1 Mar 2026 has no gap. On Sunday 8 Mar 02:00 to 03:00 does not exist, the break lands at 03:30 and the window closes at 03:15.
    assert.equal(c.hours('n', '2026-03-01').breaks.length, 1)
    assert.equal(c.hours('n', '2026-03-08').breaks, undefined)
    const day = c.hours('n', '2026-03-08')
    assert.equal(c.state('n', day.close - MIN).ends, 'close')
  })

  test('New York: a break inside the gap keeps its length', () => {
    const c = createCalendar({ sessions: [{ id: 'n', label: 'N', timeZone: 'America/New_York', days: [7], open: '01:00', close: '05:00', breaks: [{ from: '02:00', to: '02:30' }] }] })
    const [b] = c.hours('n', '2026-03-08').breaks
    assert.equal(b.to - b.from, 30 * MIN)
    assert.equal(c.state('n', b.from + MIN).onBreak, true)
  })

  test('Tokyo has no daylight saving: the break is the same in every month', () => {
    for (const date of ['2026-03-09', '2026-07-06', '2026-10-26']) assert.equal(tokyo.hours('tse', date).breaks[0].to - tokyo.hours('tse', date).breaks[0].from, 3600000, date)
  })
})

const WEEK = [1, 2, 3, 4, 5]

describe('checkSpec rejects a malformed break', () => {
  const make = (breaks, extra) => () => createCalendar({ sessions: [{ id: 'b', label: 'B', timeZone: 'UTC', days: WEEK, open: '09:00', close: '17:00', breaks, ...extra }] })
  const ok = { from: '12:00', to: '13:00' }

  test('a valid break is accepted', () => {
    assert.doesNotThrow(make([ok]))
    assert.doesNotThrow(make([]))
    assert.doesNotThrow(make([ok, { from: '14:00', to: '14:15' }, { from: '15:00', to: '15:15' }, { from: '16:00', to: '16:15' }]))
  })

  test('each bad shape throws TypeError', () => {
    for (const bad of [
      'lunch',
      [{ from: '12:00' }],
      [{ from: 1200, to: 1300 }],
      [{ from: '12:00', to: '25:00' }],
      [null],
      // from not before to
      [{ from: '13:00', to: '12:00' }],
      [{ from: '12:00', to: '12:00' }],
      // outside the window, or at its edge
      [{ from: '08:00', to: '08:30' }],
      [{ from: '16:30', to: '17:30' }],
      [{ from: '08:30', to: '10:00' }],
      [{ from: '09:00', to: '10:00' }],
      [{ from: '16:00', to: '17:00' }],
      // overlapping, touching or unsorted
      [{ from: '12:00', to: '13:00' }, { from: '12:30', to: '14:00' }],
      [{ from: '12:00', to: '13:00' }, { from: '13:00', to: '14:00' }],
      [{ from: '14:00', to: '15:00' }, { from: '12:00', to: '13:00' }],
      // more than four
      [10, 11, 12, 13, 14].map((h) => ({ from: `${h}:00`, to: `${h}:30` })),
    ]) {
      assert.throws(make(bad), TypeError, JSON.stringify(bad))
    }
  })

  test('an overnight window\'s next-morning break is valid, one outside it is not', () => {
    const night = (breaks) => () => createCalendar({ sessions: [{ id: 'o', label: 'O', timeZone: 'UTC', days: WEEK, open: '18:10', close: '15:50', breaks }] })
    assert.doesNotThrow(night([{ from: '02:20', to: '02:40' }]))
    assert.doesNotThrow(night([{ from: '19:00', to: '19:30' }, { from: '02:20', to: '02:40' }]))
    assert.throws(night([{ from: '16:00', to: '17:00' }]), TypeError, 'between the close and the next open')
    assert.throws(night([{ from: '02:20', to: '02:40' }, { from: '19:00', to: '19:30' }]), TypeError, 'unsorted')
    assert.throws(night([{ from: '15:00', to: '16:00' }]), TypeError, 'ends after the close')
  })

  test('special-session breaks are checked against that session\'s hours', () => {
    assert.throws(make(undefined, { specialSessions: { '2026-10-27': { open: '09:00', close: '11:00', breaks: [{ from: '12:00', to: '12:30' }] } } }), TypeError)
    assert.doesNotThrow(make(undefined, { specialSessions: { '2026-10-27': { open: '09:00', close: '11:00', breaks: [{ from: '10:00', to: '10:30' }] } } }))
  })

  test('with close ranges the longest close is the bound', () => {
    const ranged = (breaks) => () =>
      createCalendar({ sessions: [{ id: 'c', label: 'C', timeZone: 'UTC', days: WEEK, open: '09:00', close: { default: '17:00', ranges: [{ from: '2026-01-01', to: '2026-01-31', close: '12:00' }] }, breaks }] })
    assert.doesNotThrow(ranged([{ from: '13:00', to: '14:00' }]))
    assert.throws(ranged([{ from: '16:00', to: '18:00' }]), TypeError)
  })
})

describe('the layout profile through a break (Decision 52)', () => {
  const sched = { market: { sessions: ['tse'] } }
  const closedSched = { market: { sessions: ['tse'], duringBreaks: 'closed' } }

  test('by default the profile stays market at lunch and changes only at the close', () => {
    assert.equal(activeProfile(tokyo, sched, tk(MON, '12:00')), 'market')
    assert.equal(nextProfileChange(tokyo, sched, tk(MON, '10:00')), tk(MON, '15:30'))
    assert.equal(nextProfileChange(tokyo, sched, tk(MON, '12:00')), tk(MON, '15:30'))
  })

  test("with duringBreaks: 'closed' it switches at the start of the break and again at its end", () => {
    assert.equal(activeProfile(tokyo, closedSched, tk(MON, '12:00')), 'closed')
    assert.equal(activeProfile(tokyo, closedSched, tk(MON, '12:30')), 'market')
    assert.equal(nextProfileChange(tokyo, closedSched, tk(MON, '10:00')), tk(MON, '11:30'))
    assert.equal(nextProfileChange(tokyo, closedSched, tk(MON, '12:00')), tk(MON, '12:30'))
  })

  test('windows(…, { throughBreaks: true }) returns the unsplit window and ignores the breaks', () => {
    const day = [tk(MON, '00:00'), tk('2026-10-27', '00:00')]
    assert.deepEqual(tokyo.windows('tse', ...day, { throughBreaks: true }), [{ open: tk(MON, '09:00'), close: tk(MON, '15:30') }])
    assert.equal(tokyo.windows('tse', ...day, { throughBreaks: false }).length, 2)
  })

  test('only the two known values are accepted', () => {
    assert.throws(() => activeProfile(tokyo, { market: { sessions: ['tse'], duringBreaks: 'never' } }, tk(MON, '12:00')), TypeError)
  })
})

describe('the presets', () => {
  const NYC = 'America/New_York'
  const ny2 = (date, hhmm) => zonedTime(date, hhmm, NYC)
  const withNow = (...specs) => createCalendar({ sessions: specs, now: tk(MON, '00:00') })

  // [segment, id, open, close] on a Monday, then the probes: open, closed, weekend.
  test('NYSE and Nasdaq: ids, zone, days and every segment', () => {
    for (const [name, make] of [['nyse', presets.nyse], ['nasdaq', presets.nasdaq]]) {
      const rows = [
        [undefined, name, '09:30', '16:00'],
        ['regular', name, '09:30', '16:00'],
        ['pre', `${name}-pre`, '04:00', '09:30'],
        ['post', `${name}-post`, '16:00', '20:00'],
        ['extended', `${name}-ext`, '04:00', '20:00'],
      ]
      for (const [segment, id, open, close] of rows) {
        const spec = make(segment ? { segment } : undefined)
        assert.equal(spec.id, id)
        assert.equal(spec.timeZone, NYC)
        assert.deepEqual([...spec.days], WEEK)
        assert.deepEqual([spec.open, spec.close], [open, close])
        const c = withNow(spec)
        // Monday 26 Oct 2026: probe inside, one minute before, at the close, and Saturday.
        assert.equal(c.state(id, ny2(MON, open)).open, true, `${id} opens`)
        assert.equal(c.state(id, ny2(MON, open) - MIN).open, false, `${id} before open`)
        assert.equal(c.state(id, ny2(MON, close)).open, false, `${id} at close`)
        assert.equal(c.state(id, ny2('2026-10-24', '12:00')).open, false, `${id} on Saturday`)
        assert.equal(c.state(id, ny2('2026-10-24', '12:00')).opensAt, ny2('2026-10-26', open), `${id} next open`)
      }
      assert.throws(() => make({ segment: 'lunch' }), RangeError)
      assert.equal(make().breaks, undefined)
    }
  })

  test('the US presets follow New York time through the clocks changing', () => {
    const c = withNow(presets.nyse())
    // 2 Nov 2026 is the Monday after the clocks went back; 5 Oct is still summer time.
    assert.equal(c.hours('nyse', '2026-10-05').open, Date.UTC(2026, 9, 5, 13, 30))
    assert.equal(c.hours('nyse', '2026-11-02').open, Date.UTC(2026, 10, 2, 14, 30))
    assert.equal(c.hours('nyse', '2026-03-09').open, Date.UTC(2026, 2, 9, 13, 30))
    assert.equal(c.hours('nyse', '2026-03-06').open, Date.UTC(2026, 2, 6, 14, 30))
  })

  test('the extended window runs pre-market through post-market as one', () => {
    const c = withNow(presets.nasdaq({ segment: 'extended' }))
    assert.deepEqual(c.windows('nasdaq-ext', ny2(MON, '00:00'), ny2('2026-10-27', '00:00')), [{ open: ny2(MON, '04:00'), close: ny2(MON, '20:00') }])
  })

  test('LSE: id, zone, days and probes, through the end of British Summer Time', () => {
    const spec = presets.lse()
    assert.deepEqual([spec.id, spec.timeZone, [...spec.days], spec.open, spec.close], ['lse', 'Europe/London', WEEK, '08:00', '16:30'])
    const c = withNow(spec)
    const lon = (date, hhmm) => zonedTime(date, hhmm, 'Europe/London')
    assert.equal(c.state('lse', lon('2026-10-23', '08:00')).open, true)
    assert.equal(c.state('lse', lon('2026-10-23', '07:59')).open, false)
    assert.equal(c.state('lse', lon('2026-10-23', '16:30')).open, false)
    assert.equal(c.state('lse', lon('2026-10-24', '12:00')).open, false)
    // BST ended on Sunday 25 Oct: the open is 07:00 UTC on Friday and 08:00 UTC on Monday.
    assert.equal(c.hours('lse', '2026-10-23').open, Date.UTC(2026, 9, 23, 7))
    assert.equal(c.hours('lse', '2026-10-26').open, Date.UTC(2026, 9, 26, 8))
  })

  test('FX: Sunday evening to Friday evening in New York, one run', () => {
    const spec = presets.fx()
    assert.deepEqual([spec.id, spec.timeZone, [...spec.days], spec.open, spec.close], ['fx', NYC, [7, 1, 2, 3, 4], '17:00', '17:00'])
    const c = withNow(spec)
    // Sunday 25 Oct to Friday 30 Oct.
    assert.equal(c.state('fx', ny2('2026-10-25', '16:59')).open, false)
    assert.equal(c.state('fx', ny2('2026-10-25', '17:00')).open, true)
    assert.equal(c.state('fx', ny2('2026-10-28', '03:00')).startedAt, ny2('2026-10-25', '17:00'))
    assert.equal(c.state('fx', ny2('2026-10-28', '03:00')).closesAt, ny2('2026-10-30', '17:00'))
    assert.equal(c.state('fx', ny2('2026-10-30', '17:00')).open, false)
    assert.equal(c.state('fx', ny2('2026-10-31', '12:00')).open, false)
    assert.equal(c.state('fx', ny2('2026-10-31', '12:00')).opensAt, ny2('2026-11-01', '17:00'))
  })

  test('TSE: the lunch-break market', () => {
    const spec = presets.tse()
    assert.deepEqual([spec.id, spec.timeZone, [...spec.days], spec.open, spec.close, spec.breaks], ['tse', TOKYO, WEEK, '09:00', '15:30', [{ from: '11:30', to: '12:30' }]])
    const c = withNow(spec)
    assert.equal(c.state('tse', tk(MON, '08:59')).open, false)
    assert.equal(c.state('tse', tk(MON, '10:00')).open, true)
    assert.equal(c.state('tse', tk(MON, '12:00')).onBreak, true)
    assert.equal(c.state('tse', tk(MON, '13:00')).open, true)
    assert.equal(c.state('tse', tk('2026-10-24', '10:00')).open, false)
  })

  test('the existing NSE and MCX presets are as they were', () => {
    assert.equal(presets.nse().close, '15:30')
    assert.equal(presets.mcx({ years: [2026] }).close.default, '23:55')
  })

  test('no preset bundles holidays', () => {
    for (const spec of [presets.nyse(), presets.nasdaq(), presets.lse(), presets.fx(), presets.tse(), presets.nse(), presets.mcx()]) assert.equal(spec.holidays, undefined)
  })
})

describe('every preset cites its source (RFC 0004 §5.3)', () => {
  const root = new URL('..', import.meta.url)
  const source = readFileSync(new URL('src/core/calendar.js', root), 'utf8')
  const guide = readFileSync(new URL('docs/guide/sessions.md', root), 'utf8')
  const today = new Date().toISOString().slice(0, 10)
  const keys = Object.keys(presets)
  // The exchanges' own sites: a source must be one of them, so a placeholder or a blog cannot stand in for the page read.
  const OWN_DOMAINS = ['nyse.com', 'nasdaq.com', 'londonstockexchange.com', 'jpx.co.jp', 'cboe.com', 'nseindia.com', 'mcxindia.com']

  // The comment block directly above `key(` inside the presets object.
  const commentAbove = (key) => {
    const m = new RegExp(`((?:^ *//[^\\n]*\\n)+) *${key}\\(`, 'm').exec(source.slice(source.indexOf('export const presets')))
    return m ? m[1] : ''
  }

  test('the keys are the ones this test knows, so a new preset cannot slip past it', () => {
    assert.deepEqual(keys.sort(), ['fx', 'lse', 'mcx', 'nasdaq', 'nse', 'nyse', 'tse'])
  })

  test('calendar.js has a Source: https URL and a Checked: date, not in the future, above every preset', () => {
    for (const key of keys) {
      const comment = commentAbove(key)
      const url = /Source: (https:\/\/\S+)/.exec(comment)
      const date = /Checked: (\d{4}-\d{2}-\d{2})/.exec(comment)
      assert.ok(url, `${key} has no Source: https://… line`)
      assert.ok(date, `${key} has no Checked: YYYY-MM-DD line`)
      assert.ok(date[1] <= today, `${key} was checked in the future: ${date[1]}`)
      const age = (Date.parse(today) - Date.parse(date[1])) / 86400000
      assert.ok(age <= 400, `${key} was checked ${age} days ago: read the page again`)
      assert.ok(OWN_DOMAINS.some((h) => new URL(url[1]).hostname === h || new URL(url[1]).hostname.endsWith(`.${h}`)), `${key}: ${url[1]} is not one of the exchanges' own domains`)
    }
  })

  test('the guide repeats the source and the date for every preset in its table', () => {
    for (const key of keys) {
      const comment = commentAbove(key)
      const url = /Source: (https:\/\/\S+)/.exec(comment)[1]
      const date = /Checked: (\d{4}-\d{2}-\d{2})/.exec(comment)[1]
      const row = guide.split('\n').find((line) => line.startsWith('|') && line.includes(`\`${key}\``))
      assert.ok(row, `${key} has no row in the guide's table`)
      assert.ok(row.includes(url), `${key}: the guide's source differs from calendar.js`)
      assert.ok(row.includes(date), `${key}: the guide's date differs from calendar.js`)
      const guideDate = /(\d{4}-\d{2}-\d{2})/.exec(row)[1]
      assert.ok(guideDate <= today, `${key}: the guide's date is in the future`)
    }
  })
})

describe('holiday coverage (RFC 0004 §5.4)', () => {
  const NOW = Date.UTC(2026, 9, 26, 12)
  const D = 86400000
  const dateIn = (days) => new Date(NOW + days * D).toISOString().slice(0, 10)
  const spec = (id) => ({ id, label: id.toUpperCase(), timeZone: 'UTC', days: WEEK, open: '09:00', close: '17:00' })
  const make = (holidays, extra) => createCalendar({ sessions: [spec('nyse'), spec('lse')], holidays, now: NOW, ...extra })

  test('holidaysThrough is the latest date of the lists that apply', () => {
    const c = make({ '*': ['2026-12-25', '2026-11-01'], nyse: ['2027-01-01', '2026-12-31'] })
    assert.equal(c.holidaysThrough('nyse'), '2027-01-01')
    assert.equal(c.holidaysThrough('lse'), '2026-12-25')
    assert.equal(make({ lse: ['2026-12-01'] }).holidaysThrough('nyse'), null)
    assert.equal(make().holidaysThrough('nyse'), null)
    assert.equal(make({ nyse: [] }).holidaysThrough('nyse'), null)
    assert.throws(() => make().holidaysThrough('tse'), RangeError)
  })

  test('a list ending in 10, 29, 30 and 400 days', () => {
    for (const [days, issue] of [[10, true], [29, true], [30, false], [400, false]]) {
      const c = make({ nyse: [dateIn(days)] })
      assert.equal(c.issues.length, issue ? 1 : 0, `${days} days`)
      if (issue) {
        assert.deepEqual({ ...c.issues[0] }, { session: 'nyse', code: 'holiday-coverage', message: `The holiday list for "nyse" ends on ${dateIn(days)}, ${days} days from now.` })
      }
    }
  })

  test('a list that has already ended says so, and one day is singular', () => {
    assert.equal(make({ nyse: [dateIn(-3)] }).issues[0].message, `The holiday list for "nyse" ended on ${dateIn(-3)}, 3 days ago.`)
    assert.equal(make({ nyse: [dateIn(1)] }).issues[0].message, `The holiday list for "nyse" ends on ${dateIn(1)}, 1 day from now.`)
  })

  test('there is no issue without a list, and the shared list covers every session', () => {
    assert.deepEqual([...make().issues], [])
    assert.deepEqual([...make({ nyse: [] }).issues], [])
    assert.deepEqual(make({ '*': [dateIn(5)] }).issues.map((i) => i.session), ['nyse', 'lse'])
    assert.deepEqual(make({ nyse: [dateIn(5)] }).issues.map((i) => i.session), ['nyse'])
  })

  test('issues are frozen, and a session is judged on its own local date', () => {
    const c = make({ nyse: [dateIn(5)] })
    assert.equal(Object.isFrozen(c.issues), true)
    assert.equal(Object.isFrozen(c.issues[0]), true)
    // 23:30 UTC on the 26th is already the 27th in Tokyo: a list ending on the 25th of next month is 29 days away there and 30 from UTC's date.
    const late = Date.UTC(2026, 9, 26, 23, 30)
    const sessions = [{ ...spec('tse'), timeZone: TOKYO }, spec('utc')]
    const through = '2026-11-25'
    const both = createCalendar({ sessions, holidays: { tse: [through], utc: [through] }, now: late })
    assert.deepEqual(both.issues.map((i) => i.session), ['tse'])
  })

  test('now defaults to the real clock, read once', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: NOW })
    const c = createCalendar({ sessions: [spec('nyse')], holidays: { nyse: [dateIn(10)] } })
    assert.equal(c.issues.length, 1)
    t.mock.timers.setTime(NOW + 400 * D)
    assert.equal(c.issues.length, 1, 'the calendar keeps its original issues')
    assert.equal(c.issues[0].message.includes('10 days from now'), true)
    const later = createCalendar({ sessions: [spec('nyse')], holidays: { nyse: [dateIn(10)] } })
    assert.equal(later.issues[0].message.includes('ended on'), true)
  })

  test('now must be a number', () => {
    assert.throws(() => make({}, { now: 'soon' }), TypeError)
    assert.throws(() => make({}, { now: NaN }), TypeError)
  })
})
