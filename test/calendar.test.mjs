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
      assert.deepEqual(st, { open: true, opensAt: null, closesAt: null, startedAt: null, progress: null }, new Date(now).toISOString())
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
  const start = performance.now()
  for (let i = 0; i < 200; i++) night.state('crypto', Date.UTC(2026, 9, 12) + i * 60 * MIN)
  const each = (performance.now() - start) / 200
  assert.ok(each < 5, `${each.toFixed(2)} ms per call`)
})
