/**
 * Exchange session calendars (RFC 0001 §7).
 *
 * A session is plain data: the days it trades, its local open and close,
 * and dated exceptions. Holidays are an input, because they change every
 * year and the host owns that data source. A session may close on the next
 * local day (futures, FX) or never close (crypto): `days` and holidays name
 * the day a window OPENS (RFC 0003 §12).
 */

import { DATE_RE, TIME_RE, addDays, isDaylightSaving, localDate, weekday, zonedTime } from './zone.js'

const MINUTE = 60000
const DAY = 86400000
// How far ahead to look for the next open: long enough for any run of
// weekends and holidays, short enough to stay cheap.
const LOOKAHEAD_DAYS = 31

export function createCalendar(input) {
  if (!input || !Array.isArray(input.sessions)) throw new TypeError('createCalendar needs { sessions: SessionSpec[] }')
  const specs = new Map()
  for (const spec of input.sessions) {
    checkSpec(spec)
    if (specs.has(spec.id)) throw new TypeError(`Two sessions have the id "${spec.id}"`)
    specs.set(spec.id, frozenCopy(spec))
  }
  const given = input.holidays || {}
  for (const key of Object.keys(given)) {
    if (!Array.isArray(given[key]) || !given[key].every((d) => DATE_RE.test(d))) {
      throw new TypeError(`holidays.${key} must be a list of 'YYYY-MM-DD' dates`)
    }
  }
  // Specs and holidays are read once, here: windows are cached from them, so a
  // later change to the host's objects must not reach a calendar half-way.
  const holidays = frozenCopy(given)
  const closed = new Map()
  const closedOn = (id) => {
    let set = closed.get(id)
    if (!set) closed.set(id, (set = new Set([...(holidays['*'] || []), ...(holidays[id] || [])])))
    return set
  }

  const spec = (id) => {
    const s = specs.get(id)
    if (!s) throw new RangeError(`No session called "${id}"`)
    return s
  }

  /** The session's hours on a local date, or null when it doesn't trade. */
  const hoursOn = (s, date) => {
    // A special session (a weekend or holiday session) beats everything else.
    const special = s.specialSessions && Object.prototype.hasOwnProperty.call(s.specialSessions, date) ? s.specialSessions[date] : null
    if (special) return special
    if (!s.days.includes(weekday(date)) || closedOn(s.id).has(date)) return null
    return { open: s.open, close: closeOn(s, date) }
  }

  // A session that never closes walks 60 windows to say so, once a second per
  // clock, and each costs four Intl calls. The calendar is plain data, so a
  // window never changes once computed.
  const windowCache = new Map()

  /**
   * The window that OPENS on a local date, or null. A close at or before the
   * open is on the next local day, so '17:00' to '16:00' is 23 hours and
   * '00:00' to '00:00' is 24. The date rides along so a window can be grown
   * from the neighbours on either side of it.
   */
  const windowOn = (s, date) => {
    const key = `${s.id}|${date}`
    let w = windowCache.get(key)
    if (w === undefined) {
      const h = hoursOn(s, date)
      const open = h && zonedTime(date, h.open, s.timeZone)
      const close = h && zonedTime(h.close > h.open ? date : addDays(date, 1), h.close, s.timeZone)
      // A window that is over as soon as it begins (both ends inside one spring-forward gap) never traded.
      w = h && close > open ? { date, open, close } : null
      if (windowCache.size >= 4096) windowCache.clear()
      windowCache.set(key, w)
    }
    return w
  }

  // Both walks stop at the first date that doesn't touch. A date with no
  // window can't be followed by a touching one: no window is longer than a
  // day, so a run only reaches date D+1 through the window opening on D.
  /** The latest close of the run of touching windows after the one opening on `date`; `unbounded` if it is still touching LOOKAHEAD_DAYS on. */
  const reachEnd = (s, date, close) => {
    for (let i = 1; i <= LOOKAHEAD_DAYS; i++) {
      const w = windowOn(s, addDays(date, i))
      if (!w || w.open > close) return { at: close, unbounded: false }
      close = Math.max(close, w.close)
    }
    return { at: close, unbounded: true }
  }

  /** The same walk backwards: the earliest open of the run before the window opening on `date`. */
  const reachStart = (s, date, open) => {
    for (let i = 1; i <= LOOKAHEAD_DAYS; i++) {
      const w = windowOn(s, addDays(date, -i))
      if (!w || w.close < open) return { at: open, unbounded: false }
      open = Math.min(open, w.open)
    }
    return { at: open, unbounded: true }
  }

  /** The window around `now` with its touching neighbours merged in, or null when closed. */
  const locate = (s, now) => {
    const today = localDate(now, s.timeZone)
    // Yesterday's window is the only other candidate: none runs past a day.
    for (const date of [today, addDays(today, -1)]) {
      const w = windowOn(s, date)
      if (w && w.open <= now && now < w.close) {
        const end = reachEnd(s, w.date, w.close)
        const start = reachStart(s, w.date, w.open)
        return { rawOpen: w.open, open: start.at, close: end.at, openUnbounded: start.unbounded, closeUnbounded: end.unbounded }
      }
    }
    return null
  }

  const nextOpen = (s, now) => {
    let date = localDate(now, s.timeZone)
    for (let i = 0; i <= LOOKAHEAD_DAYS; i++, date = addDays(date, 1)) {
      const w = windowOn(s, date)
      if (w && w.open > now) return w.open
    }
    return null
  }

  const calendar = {
    sessions: Object.freeze([...specs.keys()]),

    session(id) {
      return spec(id)
    },

    isTradingDay(id, date) {
      return hoursOn(spec(id), date) !== null
    },

    /** The window that opens on a date, as instants (its close is on the next day for an overnight session), or null when it doesn't trade. */
    hours(id, date) {
      const w = windowOn(spec(id), date)
      return w && { open: w.open, close: w.close }
    },

    /**
     * Windows that touch are one: a session open Sunday to Friday as daily
     * windows is open all week. When that run is still going LOOKAHEAD_DAYS
     * later the calendar can't say when it ends, so closesAt, startedAt and
     * progress are null while open is true (crypto, which never closes).
     */
    state(id, now) {
      const s = spec(id)
      const w = locate(s, now)
      if (!w) return { open: false, opensAt: nextOpen(s, now), closesAt: null, startedAt: null, progress: null }
      const closesAt = w.closeUnbounded ? null : w.close
      const startedAt = w.closeUnbounded || w.openUnbounded ? null : w.open
      const progress = startedAt === null ? null : (now - startedAt) / (closesAt - startedAt)
      return { open: true, opensAt: null, closesAt, startedAt, progress }
    },

    nextChange(id, now) {
      const st = calendar.state(id, now)
      if (st.open) return st.closesAt === null ? null : { at: st.closesAt, to: 'closed' }
      return st.opensAt === null ? null : { at: st.opensAt, to: 'open' }
    },

    /**
     * The next candle close while the session is open, aligned to its open
     * (NSE 5-minute candles close at 09:20, 09:25, …). The last candle of the
     * day closes with the session, even if it is short. A session with no
     * known start or end has nothing to align to or cut at, so it uses the
     * day's own window.
     */
    candleClose(id, now, timeframeMinutes) {
      if (!(timeframeMinutes > 0)) throw new RangeError('timeframeMinutes must be a positive number')
      const w = locate(spec(id), now)
      if (!w) return null
      const anchor = w.closeUnbounded || w.openUnbounded ? w.rawOpen : w.open
      const tf = timeframeMinutes * MINUTE
      const next = anchor + (Math.floor((now - anchor) / tf) + 1) * tf
      return w.closeUnbounded ? next : Math.min(next, w.close)
    },

    /**
     * Every session window that overlaps [from, to), in time order, with
     * touching windows merged. A run that is still touching LOOKAHEAD_DAYS
     * past the range, or before it, is cut there, which is how activeProfile
     * spots one that never closes.
     */
    windows(id, from, to) {
      const s = spec(id)
      const raw = []
      let date = addDays(localDate(from, s.timeZone), -1)
      const last = addDays(localDate(to, s.timeZone), 1)
      for (; date <= last; date = addDays(date, 1)) {
        const w = windowOn(s, date)
        if (w && w.close > from && w.open < to) raw.push(w)
      }
      return mergeWindows(raw).map((m) => ({ open: reachStart(s, m.first, m.open).at, close: reachEnd(s, m.last, m.close).at }))
    },
  }
  return Object.freeze(calendar)
}

/**
 * Windows sorted by open, with those that overlap or touch joined. `first`
 * and `last` are the earliest and latest opening dates in each, so a caller
 * can keep growing the run from either end.
 */
function mergeWindows(list) {
  const out = []
  for (const w of list.sort((a, b) => a.open - b.open)) {
    const m = out[out.length - 1]
    if (m && w.open <= m.close) {
      m.close = Math.max(m.close, w.close)
      if (w.date > m.last) m.last = w.date
    } else out.push({ open: w.open, close: w.close, first: w.date, last: w.date })
  }
  return out
}

/** A deep, frozen copy of plain data: arrays and objects of strings and numbers. */
function frozenCopy(v) {
  if (!v || typeof v !== 'object') return v
  return Object.freeze(Array.isArray(v) ? v.map(frozenCopy) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, frozenCopy(x)])))
}

function closeOn(s, date) {
  if (typeof s.close === 'string') return s.close
  const range = s.close.ranges.find((r) => r.from <= date && date <= r.to)
  return range ? range.close : s.close.default
}

function checkSpec(s) {
  const where = s && typeof s.id === 'string' ? `Session "${s.id}"` : 'A session'
  const fail = (msg) => {
    throw new TypeError(`${where}: ${msg}`)
  }
  if (!s || typeof s.id !== 'string' || !s.id) fail('needs a non-empty string id')
  if (typeof s.label !== 'string') fail('needs a label')
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: s.timeZone })
  } catch {
    fail(`has an unknown time zone ${JSON.stringify(s.timeZone)}`)
  }
  if (!Array.isArray(s.days) || !s.days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)) fail('days must be ISO weekdays, 1 (Monday) to 7')
  if (!TIME_RE.test(s.open)) fail(`open must be 'HH:MM', not ${JSON.stringify(s.open)}`)
  const closes = []
  if (typeof s.close === 'string') closes.push(s.close)
  else if (s.close && typeof s.close.default === 'string' && Array.isArray(s.close.ranges)) {
    closes.push(s.close.default)
    for (const r of s.close.ranges) {
      if (!DATE_RE.test(r.from) || !DATE_RE.test(r.to) || r.from > r.to) fail(`has a close range with bad dates ${JSON.stringify(r)}`)
      closes.push(r.close)
    }
  } else fail("close must be 'HH:MM' or { default, ranges }")
  for (const c of closes) {
    // '24:00' stays out: midnight is '00:00', and a close at or before the open is on the next day.
    if (!TIME_RE.test(c)) fail(`close must be 'HH:MM', not ${JSON.stringify(c)}`)
  }
  for (const [date, h] of Object.entries(s.specialSessions || {})) {
    if (!DATE_RE.test(date) || !h || !TIME_RE.test(h.open) || !TIME_RE.test(h.close)) {
      fail(`has a bad special session on ${date}`)
    }
  }
}

// ── Presets ──────────────────────────────────────────────────────────────
//
// Checked on 13 Oct 2026 against:
// - NSE: equity derivatives close moved from 15:30 to 15:40 from 3 Aug 2026
//   (NSE circular of 29 May 2026); the cash market still closes at 15:30.
// - MCX circular MCX/TRD/068/2026 (9 Feb 2026): metals and energy trade
//   09:00–23:30 while the US is on daylight saving and 09:00–23:55
//   otherwise; cotton, cotton oil and kapas 09:00–21:00; other agri
//   09:00–17:00.
// Exchanges change these; a host can always pass its own SessionSpec.

const IST = 'Asia/Kolkata'
const WEEKDAYS = Object.freeze([1, 2, 3, 4, 5])

export const presets = Object.freeze({
  nse({ segment = 'equity' } = {}) {
    if (segment === 'equity') return { id: 'nse', label: 'NSE', timeZone: IST, days: WEEKDAYS, open: '09:15', close: '15:30' }
    if (segment === 'derivatives') {
      return {
        id: 'nse-fo',
        label: 'NSE F&O',
        timeZone: IST,
        days: WEEKDAYS,
        open: '09:15',
        close: { default: '15:40', ranges: [{ from: '1990-01-01', to: '2026-08-02', close: '15:30' }] },
      }
    }
    throw new RangeError(`Unknown NSE segment "${segment}"; use 'equity' or 'derivatives'`)
  },

  mcx({ segment = 'international', years } = {}) {
    if (segment === 'cotton') return { id: 'mcx-cotton', label: 'MCX cotton', timeZone: IST, days: WEEKDAYS, open: '09:00', close: '21:00' }
    if (segment === 'agri') return { id: 'mcx-agri', label: 'MCX agri', timeZone: IST, days: WEEKDAYS, open: '09:00', close: '17:00' }
    if (segment !== 'international') throw new RangeError(`Unknown MCX segment "${segment}"; use 'international', 'cotton' or 'agri'`)
    const now = new Date().getUTCFullYear()
    const list = years || [now - 1, now, now + 1]
    return {
      id: 'mcx',
      label: 'MCX',
      timeZone: IST,
      days: WEEKDAYS,
      open: '09:00',
      close: { default: '23:55', ranges: list.map((y) => ({ ...usDaylightSaving(y), close: '23:30' })) },
    }
  },
})

/**
 * The dates New York is on daylight saving in `year`, found with Intl so no
 * DST rule is hard-coded. MCX moves its close on the Monday after US clocks
 * change, which is the first trading day on the new time, so the dates
 * themselves are the rule.
 */
export function usDaylightSaving(year) {
  const tz = 'America/New_York'
  const first = (from, to, want) => {
    for (let d = from; d <= to; d = addDays(d, 1)) if (isDaylightSaving(d, tz) === want) return d
    return null
  }
  const start = first(`${year}-03-01`, `${year}-04-30`, true)
  const end = first(`${year}-10-01`, `${year}-11-30`, false)
  return { from: start, to: addDays(end, -1) }
}

// ── Choosing the layout profile (RFC 0001 §7.1) ─────────────────────────

/** 'market' while any session in the schedule is open, widened by its lead and lag; else 'closed'. */
export function activeProfile(calendar, schedule, now) {
  return spans(calendar, schedule, now).some((s) => now >= s.from && now < s.to) ? 'market' : 'closed'
}

/** The next instant activeProfile changes, or null if it won't within a month. */
export function nextProfileChange(calendar, schedule, now) {
  for (const s of spans(calendar, schedule, now)) {
    if (now < s.from) return s.from
    // A span that never ends (crypto) changes nothing, so there is nothing to report.
    if (now < s.to) return Number.isFinite(s.to) ? s.to : null
  }
  return null
}

function spans(calendar, schedule, now) {
  const m = schedule && schedule.market
  if (!m || !Array.isArray(m.sessions)) throw new TypeError('A schedule needs { market: { sessions: string[] } }')
  const lead = (m.leadMinutes || 0) * MINUTE
  const lag = (m.lagMinutes || 0) * MINUTE
  const raw = []
  const horizon = now + LOOKAHEAD_DAYS * DAY
  for (const id of m.sessions) {
    // windows() cuts a run that is still going at the horizon a few days past it, so a close beyond the horizon is one the month never reaches.
    for (const w of calendar.windows(id, now - DAY, horizon)) raw.push({ from: w.open - lead, to: w.close > horizon ? Infinity : w.close + lag })
  }
  raw.sort((a, b) => a.from - b.from)
  // Overlapping windows (NSE inside MCX's day) count as one stretch of market hours.
  const merged = []
  for (const s of raw) {
    const last = merged[merged.length - 1]
    if (last && s.from <= last.to) last.to = Math.max(last.to, s.to)
    else merged.push({ ...s })
  }
  return merged
}
