import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { TsSessionClock, sessionClockModel, visibleTicks } from '../src/elements/session-clock.js'
import { spawnSync } from 'node:child_process'
import { createCalendar, createFormatter, createMessages, presets, zonedTime } from '../src/core/index.js'
import { resetWarnings } from '../src/elements/dev.js'

// This file is loaded with no DOM: the import above must not throw.

const IST = 'Asia/Kolkata'
const calendar = createCalendar({ sessions: [presets.nse({ segment: 'derivatives' }), presets.mcx({ years: [2026] })] })
const fmt = createFormatter({ locale: 'en-IN', currency: 'INR' })
const t = createMessages()
// 12 Oct 2026 is a Monday; 16 Oct is the Friday after it.
const at = (date, hhmm, seconds = 0) => zonedTime(date, hhmm, IST) + seconds * 1000
const model = (data, variant, now) => sessionClockModel(data, variant, { fmt, t, now, label: 'Session clock' })
const data = { calendar, sessions: ['nse-fo', 'mcx'], timeframes: [5, 15] }

describe('the element class', () => {
  test('loads without a DOM and is wired to its catalog entry', () => {
    assert.equal(typeof TsSessionClock, 'function')
    assert.equal(TsSessionClock.catalogKey, 'sessionClock')
    assert.equal(TsSessionClock.viewModel(data, 'S', { fmt, t, now: at('2026-10-12', '11:42'), label: '' }).variant, 'S')
  })

  test('templates are static markup per variant and name every node update() uses', () => {
    const s = TsSessionClock.template('S')
    for (const cls of ['dot live', 'title', 'sess', 'time', 'zone', 'fill', 'from', 'mid', 'to']) assert.ok(s.includes(cls), cls)
    const b = TsSessionClock.template('Banner')
    for (const cls of ['clock', 'legend', 'lg0', 'lg1', 'nx', 'lanes']) assert.ok(b.includes(cls), cls)
    assert.equal(TsSessionClock.template('S'), s, 'pure function of the variant')
  })

  test('styles use tokens only, no live region and no transition on the fill', () => {
    assert.doesNotMatch(TsSessionClock.styles, /#[0-9a-f]{3,8}\b/i)
    assert.doesNotMatch(TsSessionClock.styles, /\b(rgb|hsl)a?\(/i)
    assert.doesNotMatch(TsSessionClock.styles, /transition/)
    assert.doesNotMatch(TsSessionClock.template('S') + TsSessionClock.template('Banner'), /aria-live/)
    assert.match(TsSessionClock.styles, /@container \(max-width: 480px\) \{ \.legend \{ display: none; \} \}/)
  })
})

describe('S', () => {
  test('open: time, zone, countdown, progress and the day\'s hours', () => {
    const m = model(data, 'S', at('2026-10-12', '11:42', 20))
    assert.equal(m.variant, 'S')
    assert.equal(m.live, true)
    assert.equal(m.title, 'Market open')
    assert.equal(m.session, 'NSE F&O')
    assert.equal(m.time, '11:42')
    assert.equal(m.zone, 'IST')
    assert.equal(m.from, '09:15')
    assert.equal(m.to, '15:40')
    assert.equal(m.middle, '3h 57m to close')
    // 147m20s of 385m
    assert.equal(m.progress, Math.round((147 + 20 / 60) / 385 * 10000) / 100)
    assert.equal(m.ariaLabel, 'Session clock: NSE F&O open, closes 15:40')
  })

  test('only the first session is shown, in its own zone', () => {
    const m = model({ ...data, sessions: ['mcx', 'nse-fo'] }, 'S', at('2026-10-12', '11:42'))
    assert.equal(m.session, 'MCX')
    assert.equal(m.to, '23:30')
  })

  test('closed overnight: opens in a duration, and the outer times are the next open and close', () => {
    const m = model(data, 'S', at('2026-10-12', '20:00'))
    assert.equal(m.live, false)
    assert.equal(m.title, 'Market closed')
    assert.equal(m.progress, 0)
    assert.equal(m.middle, 'opens in 13h 15m')
    assert.equal(m.from, '09:15')
    assert.equal(m.to, '15:40')
    assert.equal(m.ariaLabel, 'Session clock: NSE F&O closed, opens 09:15')
  })

  test('closed before the open on the same day', () => {
    const m = model(data, 'S', at('2026-10-13', '08:30'))
    assert.equal(m.middle, 'opens in 45m')
  })

  test('closed over a weekend: opens Mon 09:15', () => {
    const m = model(data, 'S', at('2026-10-16', '16:00'))
    assert.equal(m.middle, 'opens Mon 09:15')
    assert.equal(m.from, '09:15')
    assert.equal(m.to, '15:40')
    assert.equal(m.ariaLabel, 'Session clock: NSE F&O closed, opens Mon 09:15')
  })

  test('more than 24h away is where the weekday starts; exactly 24h is still a duration', () => {
    // Tuesday is a holiday, so the next open is Wednesday 09:15.
    const cal = createCalendar({ sessions: [presets.nse()], holidays: { nse: ['2026-10-13'] } })
    const d = { calendar: cal, sessions: ['nse'] }
    const open = at('2026-10-14', '09:15')
    assert.equal(model(d, 'S', open - 86400000).middle, 'opens in 24h')
    assert.equal(model(d, 'S', open - 86400000 - 1000).middle, 'opens Wed 09:15')
  })

  test('nothing scheduled within the lookahead', () => {
    const cal = createCalendar({ sessions: [presets.nse()], holidays: { '*': dates('2026-10-13', 40) } })
    const m = model({ calendar: cal, sessions: ['nse'] }, 'S', at('2026-10-12', '20:00'))
    assert.equal(m.middle, 'no session scheduled')
    assert.equal(m.from, '')
    assert.equal(m.to, '')
    assert.equal(m.progress, 0)
    assert.equal(m.ariaLabel, 'Session clock: NSE closed, no session scheduled')
  })

  test('short forms for a phone-width tile keep the full sentence in the model', () => {
    const open = model(data, 'S', at('2026-10-12', '11:42', 20))
    assert.equal(open.titleShort, 'Open')
    assert.equal(open.middleShort, '3h 57m')
    const closed = model(data, 'S', at('2026-10-12', '20:00'))
    assert.deepEqual([closed.titleShort, closed.middleShort, closed.middle], ['Closed', '13h 15m', 'opens in 13h 15m'])
    assert.equal(model(data, 'S', at('2026-10-16', '16:00')).middleShort, 'Mon 09:15')
    assert.match(TsSessionClock.styles, /@container \(max-width: 220px\)/)
  })

  test('the short zone name follows the locale', () => {
    const us = createFormatter({ locale: 'en-US' })
    const m = sessionClockModel(data, 'S', { fmt: us, t, now: at('2026-10-12', '11:42'), label: '' })
    assert.equal(m.zone, 'GMT+5:30')
    assert.equal(m.time, '11:42')
  })

  test('an unknown session id keeps rendering with a muted message', () => {
    const m = model({ calendar, sessions: ['nse-x'] }, 'S', at('2026-10-12', '11:42'))
    assert.equal(m.live, false)
    assert.equal(m.middle, 'Unknown session nse-x')
    assert.equal(m.session, 'nse-x')
    assert.equal(m.title, 'Session clock')
    assert.equal(m.ariaLabel, 'Session clock: Unknown session nse-x')
    assert.equal(typeof m.time, 'string')
  })

  test('a missing calendar or an empty list does not throw', () => {
    assert.equal(model({ sessions: ['nse-fo'] }, 'S', at('2026-10-12', '11:42')).middle, 'No calendar')
    assert.equal(model({ calendar: {}, sessions: ['nse-fo'] }, 'S', at('2026-10-12', '11:42')).middle, 'No calendar')
    assert.equal(model({ calendar }, 'S', at('2026-10-12', '11:42')).middle, 'No sessions')
    assert.equal(model({ calendar, sessions: [] }, 'S', at('2026-10-12', '11:42')).middle, 'No sessions')
    assert.equal(model(null, 'S', at('2026-10-12', '11:42')).middle, 'No sessions')
  })
})

describe('Banner', () => {
  test('header: seconds and zone, live while any lane is open, legend, next close', () => {
    const m = model(data, 'Banner', at('2026-10-12', '11:42', 20))
    assert.equal(m.variant, 'Banner')
    assert.equal(m.live, true)
    assert.equal(m.title, 'Sessions')
    assert.equal(m.clock, '11:42:20 IST')
    assert.deepEqual(m.legend, [
      { mark: '│', text: '5m close, next hour' },
      { mark: '┃', text: '15m close' },
    ])
    // NSE F&O 5m candles close at 11:45, 2m40s away; MCX's too.
    assert.equal(m.nextClose, 'next close in 2:40')
  })

  test('lanes: hours, progress, time left and the next-close marker', () => {
    const m = model(data, 'Banner', at('2026-10-12', '11:42', 20))
    assert.deepEqual(m.lanes.map((l) => l.id), ['nse-fo', 'mcx'])
    const [nse, mcx] = m.lanes
    assert.equal(nse.name, 'NSE F&O')
    assert.equal(nse.hours, '09:15–15:40')
    assert.equal(nse.open, true)
    assert.equal(nse.right, '3h 57m left')
    assert.equal(nse.progress, Math.round((147 + 20 / 60) / 385 * 10000) / 100)
    // 150 minutes in (11:45) of 385
    assert.equal(nse.next, Math.round(150 / 385 * 10000) / 100)
    assert.equal(mcx.name, 'MCX')
    assert.equal(mcx.hours, '09:00–23:30')
    assert.equal(mcx.right, '11h 47m left')
    assert.equal(mcx.progress, Math.round((162 + 20 / 60) / 870 * 10000) / 100)
    assert.equal(mcx.error, null)
  })

  test('ticks: one per candle close strictly inside the session, as percentages', () => {
    const m = model(data, 'Banner', at('2026-10-12', '11:42'))
    const items = m.lanes[0].ticks.items
    const fives = items.filter((t) => t.k === 0)
    const fifteens = items.filter((t) => t.k === 1)
    // 385m: 5m closes at 5…380 (76 inside; the 385 is the session end), 15m at 15…375 (25)
    assert.equal(fives.length, 385 / 5 - 1)
    assert.equal(fifteens.length, Math.floor(385 / 15))
    assert.equal(fives[0].l, Math.round(5 / 385 * 1e5) / 1e3)
    assert.equal(fifteens[0].l, Math.round(15 / 385 * 1e5) / 1e3)
    assert.ok(items.every((t) => t.l > 0 && t.l < 100))
    // MCX is 870m: a 5m tick every 0.575%
    const mcx = m.lanes[1].ticks.items
    assert.equal(mcx.filter((t) => t.k === 0).length, 870 / 5 - 1)
    assert.equal(mcx.filter((t) => t.k === 1).length, 870 / 15 - 1)
  })

  test('the tick key is stable within a day and changes with the day or the timeframes', () => {
    const a = model(data, 'Banner', at('2026-10-12', '11:42', 20)).lanes[0].ticks
    const b = model(data, 'Banner', at('2026-10-12', '11:43', 20)).lanes[0].ticks
    assert.equal(a.key, b.key)
    assert.equal(a.items, b.items, 'the same array: not recomputed each second')
    const tomorrow = model(data, 'Banner', at('2026-10-13', '11:42')).lanes[0].ticks
    assert.notEqual(a.key, tomorrow.key)
    const other = model({ ...data, timeframes: [5] }, 'Banner', at('2026-10-12', '11:42')).lanes[0].ticks
    assert.notEqual(a.key, other.key)
  })

  test('at most two timeframes are drawn and junk is ignored', () => {
    const m = model({ ...data, timeframes: [0, 'x', 15, 60, 1] }, 'Banner', at('2026-10-12', '11:42'))
    assert.deepEqual(m.legend.map((l) => l.text), ['15m close, next hour', '1h close'])
    assert.deepEqual(m.lanes[0].ticks.steps, [round3(15 / 385 * 100), round3(60 / 385 * 100)])
  })

  test('visibleTicks: thin shows only the next hour on an open lane; thick shows the whole session when it has room', () => {
    const now = at('2026-10-12', '11:42', 20)
    const lane = model(data, 'Banner', now).lanes[0]
    const wide = visibleTicks(lane, now, 800)
    const thin = wide.items.filter((t) => t.k === 0)
    const thick = wide.items.filter((t) => t.k === 1)
    // 5m closes after 11:42:20 up to 12:42:20: 11:45 … 12:40
    assert.equal(thin.length, 12)
    assert.ok(thin.every((t) => t.at > now && t.at <= now + 3600000))
    assert.equal(thin[0].at, at('2026-10-12', '11:45'))
    assert.equal(thin[11].at, at('2026-10-12', '12:40'))
    assert.equal(thick.length, 25, 'all 15m closes across the session')
    assert.equal(thick[0].at, at('2026-10-12', '09:30'), 'including ones already past')
  })

  test('visibleTicks: thick ticks need 6px between them', () => {
    const now = at('2026-10-12', '11:42')
    const lane = model(data, 'Banner', now).lanes[0]
    // 15m of 385m is 3.9% of the rail: 6px needs 154px
    assert.equal(visibleTicks(lane, now, 160).items.filter((t) => t.k === 1).length, 25)
    assert.equal(visibleTicks(lane, now, 150).items.filter((t) => t.k === 1).length, 0)
    assert.equal(visibleTicks(lane, now, 0).items.filter((t) => t.k === 1).length, 0)
    assert.equal(visibleTicks(lane, now, 150).items.filter((t) => t.k === 0).length, 12, 'thin ticks do not depend on width')
    // 174 five-minute ticks on MCX are never drawn as the thick set on a phone-width rail
    const mcx = model({ ...data, timeframes: [15, 5] }, 'Banner', now).lanes[1]
    assert.equal(visibleTicks(mcx, now, 90).items.filter((t) => t.k === 1).length, 0)
  })

  test('visibleTicks: no thin ticks on a closed lane, and the key changes only when the drawn set does', () => {
    const night = at('2026-10-12', '20:00')
    const closed = model(data, 'Banner', night).lanes[0]
    assert.equal(visibleTicks(closed, night, 800).items.filter((t) => t.k === 0).length, 0)

    const t0 = at('2026-10-12', '11:42', 20)
    const lane = model(data, 'Banner', t0).lanes[0]
    const a = visibleTicks(lane, t0, 800).key
    assert.equal(visibleTicks(lane, t0 + 20000, 800).key, a, 'same candles within the same five minutes')
    assert.notEqual(visibleTicks(lane, at('2026-10-12', '11:46'), 800).key, a, 'the window slid')
    assert.notEqual(visibleTicks(lane, t0, 100).key, a, 'the thick set vanished')
  })

  test('without timeframes there is no legend, no ticks, no marker and no next close', () => {
    const m = model({ calendar, sessions: ['nse-fo'] }, 'Banner', at('2026-10-12', '11:42'))
    assert.deepEqual(m.legend, [])
    assert.equal(m.nextClose, '')
    assert.equal(m.lanes[0].next, null)
    assert.equal(m.lanes[0].ticks.items.length, 0)
  })

  test('a closed lane shows the next window, an empty fill and "opens …"', () => {
    const night = model(data, 'Banner', at('2026-10-12', '20:00', 20))
    const [nse, mcx] = night.lanes
    assert.equal(nse.open, false)
    assert.equal(nse.right, 'opens 09:15')
    assert.equal(nse.hours, '09:15–15:40')
    assert.equal(nse.progress, 0)
    assert.equal(nse.next, null)
    assert.equal(nse.ticks.items.length, 76 + 25, 'every candidate is in the model')
    assert.equal(mcx.open, true)
    assert.equal(night.live, true)
    // only the open lane counts: MCX 20:05 is 4m40s after 20:00:20
    assert.equal(night.nextClose, 'next close in 4:40')

    const weekend = model(data, 'Banner', at('2026-10-16', '16:00'))
    assert.equal(weekend.lanes[0].right, 'opens Mon')
    assert.equal(weekend.lanes[0].hours, '09:15–15:40')
  })

  test('everything closed: not live, no next close', () => {
    const m = model(data, 'Banner', at('2026-10-12', '23:45', 20))
    assert.equal(m.live, false)
    assert.equal(m.nextClose, '')
    assert.deepEqual(m.lanes.map((l) => l.right), ['opens 09:15', 'opens 09:00'])
  })

  test('the next close is a minute-hand away at the candle boundary, and the clock uses the first session\'s zone', () => {
    const m = model(data, 'Banner', at('2026-10-12', '11:44', 59))
    assert.equal(m.nextClose, 'next close in 0:01')
    const n = model(data, 'Banner', at('2026-10-12', '09:20'))
    assert.equal(n.nextClose, 'next close in 5:00')
  })

  test('an unknown lane is a muted message, the others still render', () => {
    const m = model({ ...data, sessions: ['nse-fo', 'nse-x', 'mcx'] }, 'Banner', at('2026-10-12', '11:42'))
    assert.equal(m.lanes.length, 3)
    assert.equal(m.lanes[1].error, 'Unknown session nse-x')
    assert.equal(m.lanes[1].name, 'nse-x')
    assert.equal(m.lanes[1].next, null)
    assert.equal(m.lanes[1].progress, 0)
    assert.equal(m.lanes[2].open, true)
    assert.match(m.ariaLabel, /Unknown session nse-x/)
  })

  test('an unknown first session still gives a clock, in the formatter\'s zone', () => {
    const m = model({ calendar, sessions: ['nse-x'], timeframes: [5] }, 'Banner', at('2026-10-12', '11:42', 5))
    assert.equal(m.live, false)
    assert.equal(m.lanes[0].error, 'Unknown session nse-x')
    assert.match(m.clock, /^\d\d:\d\d:\d\d/)
  })

  test('a missing calendar gives a message per lane and does not throw', () => {
    const m = model({ sessions: ['nse-fo', 'mcx'], timeframes: [5] }, 'Banner', at('2026-10-12', '11:42'))
    assert.deepEqual(m.lanes.map((l) => l.error), ['No calendar', 'No calendar'])
    assert.equal(m.live, false)
    const none = model({ calendar }, 'Banner', at('2026-10-12', '11:42'))
    assert.deepEqual(none.lanes, [])
    assert.equal(none.ariaLabel, 'Session clock: No sessions')
  })

  test('the aria label names every lane and carries no seconds', () => {
    const m = model(data, 'Banner', at('2026-10-12', '11:42', 20))
    assert.equal(m.ariaLabel, 'Session clock: NSE F&O open, closes 15:40; MCX open, closes 23:30')
    assert.equal(m.ariaLabel, model(data, 'Banner', at('2026-10-12', '11:42', 40)).ariaLabel, 'stable while the clock ticks')
  })

  test('the model is pure for a frozen instant', () => {
    const now = at('2026-10-12', '11:42', 20)
    assert.deepEqual(model(data, 'Banner', now), model(data, 'Banner', now))
  })
})

// ── update(): what the DOM sees ──────────────────────────────────────────

class FakeNode {
  constructor() {
    this.textContent = ''
    this.hidden = false
    this.style = {}
    this.writes = 0
    this.kids = new Map()
    this.clientWidth = 800
  }
  set innerHTML(v) {
    this.html = v
    this.writes++
    this.lanes = Array.from({ length: (v.match(/class="lane"/g) || []).length }, () => new FakeNode())
  }
  get innerHTML() {
    return this.html
  }
  querySelector(sel) {
    if (!this.kids.has(sel)) this.kids.set(sel, new FakeNode())
    return this.kids.get(sel)
  }
  querySelectorAll() {
    return this.lanes
  }
}

// update() only needs $(), so it is driven here without constructing an element.
const fakeWidget = () => {
  const nodes = new Map()
  const w = Object.create(TsSessionClock.prototype)
  w.$ = (sel) => {
    if (!nodes.has(sel)) nodes.set(sel, new FakeNode())
    return nodes.get(sel)
  }
  w.nodes = nodes
  return w
}

describe('update()', () => {
  test('S writes text, the dot and the fill width', () => {
    const w = fakeWidget()
    w.update(model(data, 'S', at('2026-10-12', '11:42', 20)), 'S')
    assert.equal(w.$('.time').textContent, '11:42')
    assert.equal(w.$('.zone').textContent, 'IST')
    assert.equal(w.$('.mf').textContent, '3h 57m to close')
    assert.equal(w.$('.ms').textContent, '3h 57m')
    assert.equal(w.$('.mid').title, '3h 57m to close', 'the full sentence stays as the title')
    assert.equal(w.$('.tf').textContent, 'Market open')
    assert.equal(w.$('.ts').textContent, 'Open')
    assert.equal(w.$('.dot').hidden, false)
    assert.match(w.$('.fill').style.width, /^38\.27%$/)
    w.update(model(data, 'S', at('2026-10-12', '20:00')), 'S')
    assert.equal(w.$('.dot').hidden, true, 'the live dot is only for open')
    assert.equal(w.$('.fill').style.width, '0%')
  })

  test('Banner builds lanes once, rebuilds ticks only when their key changes, and moves fill and marker each second', () => {
    const w = fakeWidget()
    w.update(model(data, 'Banner', at('2026-10-12', '11:42', 20)), 'Banner')
    const host = w.$('.lanes')
    assert.equal(host.writes, 1)
    assert.equal(host.lanes.length, 2)
    const [nse] = host.lanes
    const ticks = nse.querySelector('.tks')
    assert.equal(ticks.writes, 1)
    // 12 thin ticks in the next hour + 25 thick ones (the rail is 800px)
    assert.equal((ticks.html.match(/<i /g) || []).length, 12 + 25)
    assert.match(ticks.html, /<i class="tk b" style="inset-inline-start:3\.896%"><\/i>/)
    assert.equal(nse.querySelector('.lname').textContent, 'NSE F&O')
    assert.equal(nse.querySelector('.lhours').textContent, '09:15–15:40')
    assert.equal(nse.querySelector('.lr').textContent, '3h 57m left')
    const first = nse.querySelector('.lf').style.width

    w.update(model(data, 'Banner', at('2026-10-12', '11:42', 21)), 'Banner')
    assert.equal(host.writes, 1, 'lanes are not rebuilt')
    assert.equal(ticks.writes, 1, 'ticks are not rebuilt')
    assert.equal(nse.querySelector('.mk').hidden, false)
    assert.equal(w.$('.clock').textContent, '11:42:21 IST')
    assert.equal(w.$('.nxt').textContent, 'next close in 2:39')
    // The fill is rounded to 0.01%, so it takes a few minutes to show a change.
    // 11:50 is past the 11:45 close: the thin window slid, so the ticks rebuild once.
    w.update(model(data, 'Banner', at('2026-10-12', '11:50')), 'Banner')
    assert.notEqual(nse.querySelector('.lf').style.width, first, 'but the fill moves')
    assert.equal(ticks.writes, 2)
    w.update(model(data, 'Banner', at('2026-10-12', '11:50', 30)), 'Banner')
    assert.equal(ticks.writes, 2, 'not every second')
    // A narrow rail drops the thick ticks.
    nse.querySelector('.lt').clientWidth = 90
    w.update(model(data, 'Banner', at('2026-10-12', '11:50', 31)), 'Banner')
    assert.equal(ticks.writes, 3)
    assert.equal((ticks.html.match(/class="tk b"/g) || []).length, 0)
    nse.querySelector('.lt').clientWidth = 800

    // The next day the hours (so the key) change: ticks rebuild, lanes do not.
    const before = ticks.writes
    w.update(model(data, 'Banner', at('2026-10-13', '11:42')), 'Banner')
    assert.equal(ticks.writes, before + 1)
    assert.equal(host.writes, 1)

    // A different list of sessions rebuilds the lanes.
    w.update(model({ ...data, sessions: ['nse-fo'] }, 'Banner', at('2026-10-13', '11:42')), 'Banner')
    assert.equal(host.writes, 2)
    assert.equal(host.lanes.length, 1)
  })

  test('Banner hides the marker when closed, the legend without timeframes and shows an unknown lane\'s message', () => {
    const w = fakeWidget()
    w.update(model({ calendar, sessions: ['nse-x', 'nse-fo'] }, 'Banner', at('2026-10-12', '20:00')), 'Banner')
    const [bad, nse] = w.$('.lanes').lanes
    assert.equal(bad.querySelector('.msg').hidden, false)
    assert.equal(bad.querySelector('.msg').textContent, 'Unknown session nse-x')
    assert.equal(bad.querySelector('.rail').hidden, true)
    assert.equal(nse.querySelector('.msg').hidden, true)
    assert.equal(nse.querySelector('.mk').hidden, true)
    assert.equal(w.$('.legend').hidden, true)
    assert.equal(w.$('.nx').hidden, true)
    assert.equal(w.$('.dot').hidden, true)
  })
})

describe('large inputs', () => {
  // 1,000 made-up sessions, so nothing in the model may build an argument
  // list as long as the lanes. They open a minute apart from 08:00 to 11:59
  // (then the pattern repeats) and each trades for six hours.
  const n = 1000
  const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
  const opensAt = (i) => 8 * 60 + (i % 240)
  const sessions = Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    label: `Session ${i}`,
    timeZone: IST,
    days: [1, 2, 3, 4, 5],
    open: hhmm(opensAt(i)),
    close: hhmm(opensAt(i) + 360),
  }))
  const many = { calendar: createCalendar({ sessions }), sessions: sessions.map((s) => s.id), timeframes: [5, 15] }
  const now = at('2026-10-12', '11:42', 20)
  // Open by now: the sessions that opened at 11:42 or before.
  const openCount = sessions.filter((_, i) => opensAt(i) <= 11 * 60 + 42).length

  test('Banner: a lane per session, and the next close is the earliest across all of them', () => {
    const m = model(many, 'Banner', now)
    assert.equal(m.lanes.length, n)
    assert.equal(m.lanes.filter((l) => l.open).length, openCount)
    assert.ok(m.lanes.every((l) => l.error === null && (l.open ? l.next !== null : l.next === null)))
    assert.equal(m.live, true)
    // Every session opened on a whole minute, so the soonest 5m close is 11:43:00.
    assert.equal(m.nextClose, 'next close in 0:40')
    assert.equal(m.ariaLabel.split('; ').length, n)
  })

  test('S: shows the first of 1,000 sessions', () => {
    const m = model(many, 'S', now)
    assert.equal(m.session, 'Session 0')
    assert.equal(m.from, '08:00')
    assert.equal(m.to, '14:00')
  })
})

const round3 = (v) => Math.round(v * 1000) / 1000

function dates(from, days) {
  const out = []
  const start = Date.parse(`${from}T00:00:00Z`)
  for (let i = 0; i < days; i++) out.push(new Date(start + i * 86400000).toISOString().slice(0, 10))
  return out
}

describe('dropped', () => {
  const now = at('2026-10-12', '11:42')
  test('is 0 for clean data', () => {
    assert.equal(model(data, 'S', now).dropped, 0)
    assert.equal(model(data, 'Banner', now).dropped, 0)
  })

  test('counts session ids that are not strings, and bad timeframes on Banner', () => {
    const messy = { ...data, sessions: ['nse-fo', 5, null, 'mcx'], timeframes: [5, 'x', -1, 15] }
    assert.equal(model(messy, 'S', now).dropped, 2)
    assert.equal(model(messy, 'Banner', now).dropped, 4)
  })

  test('an unknown session id is shown as an error lane, not dropped', () => {
    assert.equal(model({ ...data, sessions: ['nse-fo', 'nowhere'] }, 'Banner', now).dropped, 0)
  })

  test('missing data is 0', () => {
    assert.equal(model(undefined, 'S', now).dropped, 0)
  })
})

describe('region name and banner errors', () => {
  test('the region is named with the host label', () => {
    const now = at('2026-10-12', '11:42')
    const m = sessionClockModel(data, 'S', { fmt, t, now, label: 'Markets' })
    assert.ok(m.ariaLabel.startsWith('Markets: '))
    assert.ok(sessionClockModel(data, 'Banner', { fmt, t, now, label: 'Markets' }).ariaLabel.startsWith('Markets: '))
    assert.equal(sessionClockModel({ sessions: ['x'] }, 'S', { fmt, t, now, label: 'Markets' }).ariaLabel, 'Markets: No calendar')
  })

  test('an unknown first session gives exactly one error lane', () => {
    const m = model({ calendar, sessions: ['nse-x'] }, 'Banner', at('2026-10-12', '11:42'))
    assert.equal(m.lanes.length, 1)
    assert.equal(m.ariaLabel, 'Session clock: Unknown session nse-x')
  })
})

// ── Overnight and 24/7 sessions (RFC 0003 §12) ───────────────────────────

describe('overnight and 24/7 sessions', () => {
  const CHI = 'America/Chicago'
  const NY = 'America/New_York'
  const night = createCalendar({
    sessions: [
      { id: 'cme', label: 'CME', timeZone: CHI, days: [7, 1, 2, 3, 4], open: '17:00', close: '16:00' },
      { id: 'fx', label: 'FX', timeZone: NY, days: [7, 1, 2, 3, 4], open: '17:00', close: '17:00' },
      { id: 'crypto', label: 'Crypto', timeZone: 'UTC', days: [1, 2, 3, 4, 5, 6, 7], open: '00:00', close: '00:00' },
    ],
  })
  const chi = (date, hhmm) => zonedTime(date, hhmm, CHI)
  const ny = (date, hhmm) => zonedTime(date, hhmm, NY)
  const ask = (id, variant, now, extra = {}) => model({ calendar: night, sessions: [id], ...extra }, variant, now)

  test('S: an overnight window opened yesterday shows both ends, with the day of the one that is not today', () => {
    const m = ask('cme', 'S', chi('2026-10-12', '10:00'))
    assert.equal(m.live, true)
    assert.equal(m.middle, '6h to close')
    assert.equal(m.from, 'Sun 17:00')
    assert.equal(m.to, '16:00')
    assert.equal(m.progress, Math.round((17 / 23) * 10000) / 100)
    assert.equal(m.ariaLabel, 'Session clock: CME open, closes 16:00')
  })

  test('S: in the evening the close is tomorrow, and the open is today', () => {
    const m = ask('cme', 'S', chi('2026-10-12', '18:00'))
    assert.deepEqual([m.from, m.to, m.middle], ['17:00', 'Tue 16:00', '22h to close'])
    assert.equal(m.ariaLabel, 'Session clock: CME open, closes Tue 16:00')
  })

  test('S: in the daily break it counts to the open, and names the next window', () => {
    const m = ask('cme', 'S', chi('2026-10-12', '16:30'))
    assert.equal(m.live, false)
    assert.deepEqual([m.middle, m.from, m.to], ['opens in 30m', '17:00', 'Tue 16:00'])
  })

  test('S: over the weekend the next window is named by day', () => {
    const m = ask('cme', 'S', chi('2026-10-16', '16:30'))
    assert.deepEqual([m.middle, m.from, m.to], ['opens Sun 17:00', 'Sun 17:00', 'Mon 16:00'])
  })

  test('S: an FX week reads as one window', () => {
    const m = ask('fx', 'S', ny('2026-10-14', '12:00'))
    assert.deepEqual([m.from, m.to, m.middleShort], ['Sun 17:00', 'Fri 17:00', '53h'])
    const closed = ask('fx', 'S', ny('2026-10-17', '12:00'))
    assert.deepEqual([closed.from, closed.to], ['Sun 17:00', 'Fri 17:00'])
  })

  test('S: a session that never closes says so, with a full track and no times', () => {
    const m = ask('crypto', 'S', Date.UTC(2026, 9, 12, 10, 7))
    assert.equal(m.live, true)
    assert.equal(m.title, 'Market open')
    assert.deepEqual([m.middle, m.middleShort], ['Open 24/7', 'Open 24/7'])
    assert.deepEqual([m.from, m.to, m.progress], ['', '', 100])
    assert.equal(m.ariaLabel, 'Session clock: Crypto open 24/7')
  })

  test('Banner: the lane names the overnight window across midnight', () => {
    const lane = ask('cme', 'Banner', chi('2026-10-12', '18:00')).lanes[0]
    assert.equal(lane.hours, '17:00–Tue 16:00')
    assert.equal(lane.right, '22h left')
    assert.equal(lane.progress, Math.round((1 / 23) * 10000) / 100)
    assert.equal(ask('cme', 'Banner', chi('2026-10-12', '10:00')).lanes[0].hours, 'Sun 17:00–16:00')
  })

  test('Banner: ticks and the next-close mark sit on the overnight window', () => {
    const m = ask('cme', 'Banner', chi('2026-10-12', '18:07'), { timeframes: [30] })
    const lane = m.lanes[0]
    // 23 hours of 30-minute candles, the last of which is the close itself.
    assert.equal(lane.ticks.items.length, 23 * 2 - 1)
    // 18:30 is 90 minutes into 1380.
    assert.equal(lane.next, Math.round((90 / 1380) * 10000) / 100)
  })

  test('Banner: a session that never closes is a full lane with no hours, and its candles still count in the header', () => {
    const m = ask('crypto', 'Banner', Date.UTC(2026, 9, 12, 10, 7), { timeframes: [15] })
    const lane = m.lanes[0]
    assert.equal(lane.open, true)
    assert.deepEqual([lane.hours, lane.right, lane.progress, lane.next], ['', 'Open 24/7', 100, null])
    assert.deepEqual(lane.ticks.items, [])
    assert.equal(m.live, true)
    assert.equal(m.nextClose, 'next close in 8:00')
    assert.equal(m.ariaLabel, 'Session clock: Crypto open 24/7')
  })

  test('no countdown or percentage is negative or not a number, for any session, around the clock and across daylight saving', () => {
    const ids = ['cme', 'fx', 'crypto']
    const weeks = [Date.UTC(2026, 2, 6), Date.UTC(2026, 9, 30), Date.UTC(2026, 9, 12)]
    for (const from of weeks) {
      for (let now = from; now < from + 5 * 86400000; now += 15 * 60000 + 7000) {
        for (const id of ids) {
          const s = ask(id, 'S', now)
          const b = ask(id, 'Banner', now, { timeframes: [5, 60] })
          const lane = b.lanes[0]
          const texts = [s.title, s.middle, s.middleShort, s.from, s.to, s.ariaLabel, b.clock, b.nextClose, lane.hours, lane.right, b.ariaLabel]
          const where = `${id} at ${new Date(now).toISOString()}`
          for (const text of texts) assert.doesNotMatch(text, /NaN|undefined|Infinity|null|(^|\s)-\d/, `${where}: ${text}`)
          for (const pct of [s.progress, lane.progress]) assert.ok(Number.isFinite(pct) && pct >= 0 && pct <= 100, `${where}: ${pct}`)
          if (lane.next !== null) assert.ok(lane.next >= 0 && lane.next <= 100, `${where}: next ${lane.next}`)
        }
      }
    }
  })
})

describe('an open session with a close but no known start', () => {
  // Open round the clock for over a month before the holiday, so the calendar can name the close but not the start.
  const holiday = createCalendar({
    sessions: [{ id: 'crypto', label: 'Crypto', timeZone: 'UTC', days: [1, 2, 3, 4, 5, 6, 7], open: '00:00', close: '00:00' }],
    holidays: { crypto: ['2026-10-15'] },
  })
  const now = Date.UTC(2026, 9, 5, 10)
  const ask = (variant) => model({ calendar: holiday, sessions: ['crypto'] }, variant, now)

  test('the calendar says what it knows', () => {
    const st = holiday.state('crypto', now)
    assert.deepEqual([st.open, st.startedAt, st.progress], [true, null, null])
    assert.equal(st.closesAt, Date.UTC(2026, 9, 15))
  })

  test('S: no rail and no from-label, but the countdown and the close stay', () => {
    const m = ask('S')
    assert.equal(m.live, true)
    assert.equal(m.track, false)
    assert.deepEqual([m.from, m.to, m.middle], ['', 'Thu 00:00', '230h to close'])
    assert.equal(m.ariaLabel, 'Session clock: Crypto open, closes Thu 00:00')
  })

  test('Banner: the lane shows only the close and draws no fill', () => {
    const lane = ask('Banner').lanes[0]
    assert.deepEqual([lane.track, lane.hours, lane.right, lane.next], [false, '–Thu 00:00', '230h left', null])
  })

  test('a run with a known start keeps its rail', () => {
    assert.equal(model(data, 'S', at('2026-10-12', '11:42')).track, true)
    assert.equal(model(data, 'Banner', at('2026-10-12', '11:42')).lanes[0].track, true)
  })
})

test('a wall clock has no flash: nothing in either template is a flash target', () => {
  assert.doesNotMatch(TsSessionClock.template('S') + TsSessionClock.template('Banner'), /data-flash/)
})

// ── Breaks and holiday coverage (RFC 0004 §5.2, §5.4) ───────────────────────

describe('a session with a lunch break', () => {
  const TOKYO = 'Asia/Tokyo'
  const tk = (date, hhmm, seconds = 0) => zonedTime(date, hhmm, TOKYO) + seconds * 1000
  const tokyo = createCalendar({ sessions: [presets.tse()], now: tk('2026-10-26', '00:00') })
  const tfmt = createFormatter({ locale: 'en-US', currency: 'JPY' })
  const tmodel = (d, variant, now) => sessionClockModel(d, variant, { fmt: tfmt, t, now, label: 'Session clock' })
  const tdata = { calendar: tokyo, sessions: ['tse'], timeframes: [15, 60] }
  const MON = '2026-10-26'

  test('S reads Break and when it resumes, with the whole clock named after it', () => {
    const m = tmodel(tdata, 'S', tk(MON, '12:00'))
    assert.equal(m.live, false)
    assert.deepEqual([m.title, m.titleShort], ['Break', 'Break'])
    assert.equal(m.middle, 'resumes 12:30')
    assert.equal(m.middleShort, 'resumes 12:30')
    assert.equal(m.ariaLabel, 'Session clock: TSE on break, opens 12:30')
    assert.deepEqual([m.from, m.to], ['09:00', '15:30'])
    // 3h of the 6h30m window have gone, the break included.
    assert.equal(m.progress, 46.15)
    assert.deepEqual(m.gaps, [{ l: 38.462, w: 15.385 }])
  })

  test('S counts to the break before it, and to the close after it', () => {
    const before = tmodel(tdata, 'S', tk(MON, '10:30'))
    assert.equal(before.title, 'Market open')
    assert.equal(before.middle, '1h to break')
    assert.equal(before.ariaLabel, 'Session clock: TSE open, closes 15:30')
    assert.equal(tmodel(tdata, 'S', tk(MON, '13:30')).middle, '2h to close')
    assert.equal(tmodel(tdata, 'S', tk(MON, '13:30')).progress, 69.23)
  })

  test('S before the open and after the close is closed, with the gap still known', () => {
    const early = tmodel(tdata, 'S', tk(MON, '08:00'))
    assert.equal(early.title, 'Market closed')
    assert.equal(early.progress, 0)
    assert.equal(early.middle, 'opens in 1h')
    const late = tmodel(tdata, 'S', tk(MON, '16:00'))
    assert.equal(late.title, 'Market closed')
    assert.equal(late.progress, 0)
  })

  test('Banner: the lane reads Break with its resume time under it, and draws the gap', () => {
    const m = tmodel(tdata, 'Banner', tk(MON, '12:00'))
    const [lane] = m.lanes
    assert.deepEqual([lane.right, lane.sub, lane.open], ['Break', 'resumes 12:30', false])
    assert.equal(lane.hours, '09:00–15:30')
    assert.deepEqual(lane.gaps, [{ l: 38.462, w: 15.385 }])
    assert.equal(m.live, false)
    assert.equal(lane.next, null)
    assert.equal(m.nextClose, '')
  })

  test('Banner: the countdown says to break, then left, and the lane has no resume line', () => {
    const [before] = tmodel(tdata, 'Banner', tk(MON, '10:30')).lanes
    assert.deepEqual([before.right, before.sub], ['1h to break', ''])
    const [after] = tmodel(tdata, 'Banner', tk(MON, '13:30')).lanes
    assert.deepEqual([after.right, after.sub], ['2h left', ''])
  })

  test('ticks are counted from the open and again from the break\'s end, and none sit in the gap', () => {
    const [lane] = tmodel(tdata, 'Banner', tk(MON, '12:31')).lanes
    const thick = lane.ticks.items.filter((x) => x.k === 1)
    const hours = thick.map((x) => new Date(x.at + 9 * 3600000).toISOString().slice(11, 16))
    assert.deepEqual(hours, ['10:00', '11:00', '13:30', '14:30'])
    const quarters = lane.ticks.items.filter((x) => x.k === 0).map((x) => new Date(x.at + 9 * 3600000).toISOString().slice(11, 16))
    assert.ok(!quarters.some((q) => q > '11:30' && q < '12:30'), 'no tick inside the break')
    assert.ok(quarters.includes('12:45') && quarters.includes('09:15'))
    // The marker is the next candle close, 12:45, as a share of the whole rail.
    assert.equal(lane.next, 57.69)
  })

  test('a session without breaks has no gaps and the same ticks as before', () => {
    const [lane] = model(data, 'Banner', at('2026-10-12', '11:42')).lanes
    assert.deepEqual(lane.gaps, [])
    assert.equal(lane.sub, '')
  })

  test('update() draws the gap in the track and the resume line, once, and clears them after', () => {
    const w = fakeWidget()
    w.update(tmodel(tdata, 'S', tk(MON, '12:00')), 'S')
    const gps = w.$('.gps')
    assert.match(gps.html, /<i class="gp" style="inset-inline-start:38\.462%;width:15\.385%"><\/i>/)
    assert.equal(gps.writes, 1)
    w.update(tmodel(tdata, 'S', tk(MON, '12:01')), 'S')
    assert.equal(gps.writes, 1, 'the gap is not rebuilt every second')
    assert.equal(w.$('.dot').hidden, true)
    assert.equal(w.$('.mf').textContent, 'resumes 12:30')

    const b = fakeWidget()
    b.update(tmodel(tdata, 'Banner', tk(MON, '12:00')), 'Banner')
    const lane = b.$('.lanes').lanes[0]
    assert.equal(lane.querySelector('.lr').textContent, 'Break')
    assert.equal(lane.querySelector('.lr2').hidden, false)
    assert.equal(lane.querySelector('.lr2').textContent, 'resumes 12:30')
    b.update(tmodel(tdata, 'Banner', tk(MON, '13:30')), 'Banner')
    assert.equal(lane.querySelector('.lr2').hidden, true)
    assert.equal(lane.querySelector('.lr').textContent, '2h left')
  })

  test('the styles paint the gap in the surface, and keep it edged in forced colours', () => {
    assert.match(TsSessionClock.styles, /\.gp \{[^}]*background: var\(--ts-surface\)/)
    assert.match(TsSessionClock.styles, /forced-colors: active\) \{[\s\S]*\.gp \{[^}]*border-inline: 1px solid CanvasText/)
    assert.match(TsSessionClock.template('S'), /class="gps"/)
  })
})

describe('a session that never closes', () => {
  test('S and Banner read Open 24/7 with no gap and no countdown', () => {
    const all = createCalendar({ sessions: [{ id: 'always', label: 'Always', timeZone: 'UTC', days: [1, 2, 3, 4, 5, 6, 7], open: '00:00', close: '00:00' }] })
    const now = Date.UTC(2026, 9, 14, 12)
    const s = sessionClockModel({ calendar: all, sessions: ['always'] }, 'S', { fmt: createFormatter({ locale: 'en-US', currency: 'USD' }), t, now, label: '' })
    assert.deepEqual([s.middle, s.progress, s.gaps], ['Open 24/7', 100, []])
    const b = sessionClockModel({ calendar: all, sessions: ['always'] }, 'Banner', { fmt: createFormatter({ locale: 'en-US', currency: 'USD' }), t, now, label: '' })
    assert.deepEqual([b.lanes[0].right, b.lanes[0].sub, b.lanes[0].gaps], ['Open 24/7', '', []])
  })
})

describe('the holiday coverage warning', () => {
  const NOW = Date.UTC(2026, 9, 26, 12)
  const spec = { id: 'nyse', label: 'NYSE', timeZone: 'America/New_York', days: [1, 2, 3, 4, 5], open: '09:30', close: '16:00' }
  const short = createCalendar({ sessions: [spec], holidays: { nyse: ['2026-11-10'] }, now: NOW })
  const long = createCalendar({ sessions: [spec], holidays: { nyse: ['2027-12-31'] }, now: NOW })

  const withWarnings = (run) => {
    const seen = []
    const warn = console.warn
    console.warn = (m) => seen.push(m)
    resetWarnings()
    try {
      run()
    } finally {
      console.warn = warn
      resetWarnings()
    }
    return seen
  }
  const draw = (calendar, times = 1) => {
    const w = fakeWidget()
    w._data = { calendar, sessions: ['nyse'] }
    for (let i = 0; i < times; i++) w.update(model({ calendar, sessions: ['nyse'] }, 'S', NOW), 'S')
  }

  test('warns once per calendar for a short list, with the pointer to the guide', () => {
    const seen = withWarnings(() => draw(short, 5))
    assert.deepEqual(seen, ['tickslate: The holiday list for "nyse" ends on 2026-11-10, 15 days from now. See docs/guide/sessions.md'])
  })

  test('does not warn for a list that reaches past 30 days, or for no list', () => {
    assert.deepEqual(withWarnings(() => draw(long)), [])
    assert.deepEqual(withWarnings(() => draw(createCalendar({ sessions: [spec], now: NOW }))), [])
    assert.deepEqual(withWarnings(() => draw(undefined)), [])
  })

  test('warns for each calendar once, a second one with the same text included', () => {
    const first = createCalendar({ sessions: [spec], holidays: { nyse: ['2026-11-10'] }, now: NOW })
    const again = createCalendar({ sessions: [spec], holidays: { nyse: ['2026-11-10'] }, now: NOW })
    const seen = withWarnings(() => {
      draw(first, 2)
      draw(again, 2)
    })
    assert.equal(seen.length, 2, 'once for each calendar, however often it is drawn')
  })
})

describe('the production switch for the coverage warning', () => {
  test('with __TS_DEV__ false a short holiday list warns nothing', () => {
    // A child process, because dev.js reads the switch once, when first loaded.
    const code = `
      import { FakeElement, FakeDocument } from ${JSON.stringify(new URL('./fake-dom.mjs', import.meta.url).href)}
      globalThis.__TS_DEV__ = false
      globalThis.HTMLElement = FakeElement
      globalThis.document = new FakeDocument()
      const { DEV } = await import(${JSON.stringify(new URL('../src/elements/dev.js', import.meta.url).href)})
      const { TsSessionClock } = await import(${JSON.stringify(new URL('../src/elements/session-clock.js', import.meta.url).href)})
      const { createCalendar, createFormatter, createMessages } = await import(${JSON.stringify(new URL('../src/core/index.js', import.meta.url).href)})
      const calls = []
      console.warn = (m) => calls.push(m)
      const now = Date.UTC(2026, 9, 26, 12)
      const spec = { id: 'nyse', label: 'NYSE', timeZone: 'America/New_York', days: [1, 2, 3, 4, 5], open: '09:30', close: '16:00' }
      const calendar = createCalendar({ sessions: [spec], holidays: { nyse: ['2026-11-10'] }, now })
      const vm = TsSessionClock.viewModel({ calendar, sessions: ['nyse'] }, 'S', { fmt: createFormatter({ locale: 'en-US', currency: 'USD' }), t: createMessages(), now, label: '' })
      const w = Object.create(TsSessionClock.prototype)
      w._data = { calendar, sessions: ['nyse'] }
      const node = () => ({ hidden: false, style: {}, textContent: '', setAttribute() {}, removeAttribute() {} })
      const nodes = new Map()
      w.$ = (sel) => nodes.get(sel) || (nodes.set(sel, node()), nodes.get(sel))
      w.update(vm, 'S')
      console.log(JSON.stringify({ DEV, issues: calendar.issues.length, calls }))
    `
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
    const out = JSON.parse(run.stdout)
    assert.deepEqual(out, { DEV: false, issues: 1, calls: [] })
  })
})
