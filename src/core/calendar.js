/**
 * Exchange session calendars (RFC 0001 §7).
 *
 * A session is plain data: the days it trades, its local open and close,
 * and dated exceptions. Holidays are an input, because they change every
 * year and the host owns that data source. Sessions open and close on the
 * same local day; none of the v1 exchanges trade across midnight.
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
    specs.set(spec.id, spec)
  }
  const holidays = input.holidays || {}
  for (const key of Object.keys(holidays)) {
    if (!Array.isArray(holidays[key]) || !holidays[key].every((d) => DATE_RE.test(d))) {
      throw new TypeError(`holidays.${key} must be a list of 'YYYY-MM-DD' dates`)
    }
  }
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

  const windowOn = (s, date) => {
    const h = hoursOn(s, date)
    return h ? { open: zonedTime(date, h.open, s.timeZone), close: zonedTime(date, h.close, s.timeZone) } : null
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

    /** The session's hours on a date as instants, or null when it doesn't trade. */
    hours(id, date) {
      return windowOn(spec(id), date)
    },

    state(id, now) {
      const s = spec(id)
      const w = windowOn(s, localDate(now, s.timeZone))
      if (w && now >= w.open && now < w.close) {
        return { open: true, opensAt: null, closesAt: w.close, startedAt: w.open, progress: (now - w.open) / (w.close - w.open) }
      }
      return { open: false, opensAt: nextOpen(s, now), closesAt: null, startedAt: null, progress: null }
    },

    nextChange(id, now) {
      const st = calendar.state(id, now)
      if (st.open) return { at: st.closesAt, to: 'closed' }
      return st.opensAt === null ? null : { at: st.opensAt, to: 'open' }
    },

    /**
     * The next candle close while the session is open, aligned to its open
     * (NSE 5-minute candles close at 09:20, 09:25, …). The last candle of the
     * day closes with the session, even if it is short.
     */
    candleClose(id, now, timeframeMinutes) {
      if (!(timeframeMinutes > 0)) throw new RangeError('timeframeMinutes must be a positive number')
      const st = calendar.state(id, now)
      if (!st.open) return null
      const tf = timeframeMinutes * MINUTE
      const next = st.startedAt + (Math.floor((now - st.startedAt) / tf) + 1) * tf
      return Math.min(next, st.closesAt)
    },

    /** Every session window that overlaps [from, to), in time order. */
    windows(id, from, to) {
      const s = spec(id)
      const out = []
      let date = addDays(localDate(from, s.timeZone), -1)
      const last = addDays(localDate(to, s.timeZone), 1)
      for (; date <= last; date = addDays(date, 1)) {
        const w = windowOn(s, date)
        if (w && w.close > from && w.open < to) out.push(w)
      }
      return out
    },
  }
  return Object.freeze(calendar)
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
    if (!TIME_RE.test(c)) fail(`close must be 'HH:MM', not ${JSON.stringify(c)}`)
    if (c <= s.open) fail(`closes at ${c}, not after it opens at ${s.open}; sessions can't cross midnight`)
  }
  for (const [date, h] of Object.entries(s.specialSessions || {})) {
    if (!DATE_RE.test(date) || !h || !TIME_RE.test(h.open) || !TIME_RE.test(h.close) || h.close <= h.open) {
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
    if (now < s.to) return s.to
  }
  return null
}

function spans(calendar, schedule, now) {
  const m = schedule && schedule.market
  if (!m || !Array.isArray(m.sessions)) throw new TypeError('A schedule needs { market: { sessions: string[] } }')
  const lead = (m.leadMinutes || 0) * MINUTE
  const lag = (m.lagMinutes || 0) * MINUTE
  const raw = []
  for (const id of m.sessions) {
    for (const w of calendar.windows(id, now - DAY, now + LOOKAHEAD_DAYS * DAY)) raw.push({ from: w.open - lead, to: w.close + lag })
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
