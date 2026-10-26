/**
 * Exchange session calendars (RFC 0001 §7).
 *
 * A session is plain data: the days it trades, its local open and close,
 * and dated exceptions. Holidays are an input, because they change every
 * year and the host owns that data source. A session may close on the next
 * local day (futures, FX) or never close (crypto): `days` and holidays name
 * the day a window OPENS (RFC 0003 §12).
 *
 * A window may have breaks (a lunch break, RFC 0004 §5). It stays one window
 * for `hours()`, but it is cut into segments: `state()` is closed between
 * them, and only the layout profile (`windows(…, { throughBreaks })`) reads a
 * window whole.
 */

import { DATE_RE, TIME_RE, addDays, isDaylightSaving, localDate, weekday, zonedTime } from './zone.js'

const MINUTE = 60000
const DAY = 86400000
// How far ahead to look for the next open: long enough for any run of
// weekends and holidays, short enough to stay cheap.
const LOOKAHEAD_DAYS = 31
const MAX_BREAKS = 4
// A holiday list that ends sooner than this after `now` is reported (RFC 0004 §5.4, Decision 54).
const COVERAGE_DAYS = 30

export function createCalendar(input) {
  if (!input || !Array.isArray(input.sessions)) throw new TypeError('createCalendar needs { sessions: SessionSpec[] }')
  const specs = new Map()
  for (const spec of input.sessions) {
    checkSpec(spec)
    if (specs.has(spec.id)) throw new TypeError(`Two sessions have the id "${spec.id}"`)
    specs.set(spec.id, frozenCopy(spec))
  }
  if (input.now !== undefined && !Number.isFinite(input.now)) throw new TypeError('createCalendar: now must be a number of milliseconds')
  // Read once (Decision 53): the one place the core asks the clock, and `now` makes it deterministic.
  const createdAt = input.now === undefined ? Date.now() : input.now
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
    if (special) return { open: special.open, close: special.close, breaks: special.breaks || NO_BREAKS }
    if (!s.days.includes(weekday(date)) || closedOn(s.id).has(date)) return null
    return { open: s.open, close: closeOn(s, date), breaks: s.breaks || NO_BREAKS }
  }

  // A session that never closes walks 60 windows to say so, once a second per
  // clock, and each costs four Intl calls. The calendar is plain data, so a
  // window never changes once computed.
  const windowCache = new Map()

  /**
   * The window that OPENS on a local date, or null. A close at or before the
   * open is on the next local day, so '17:00' to '16:00' is 23 hours and
   * '00:00' to '00:00' is 24. The date rides along so a window can be grown
   * from the neighbours on either side of it. `segs` are the stretches that
   * trade (the window less its breaks) and `gaps` the breaks that survived
   * being clamped to the window.
   */
  const windowOn = (s, date) => {
    const key = `${s.id}|${date}`
    let w = windowCache.get(key)
    if (w === undefined) {
      const h = hoursOn(s, date)
      const open = h && zonedTime(date, h.open, s.timeZone)
      const close = h && zonedTime(h.close > h.open ? date : addDays(date, 1), h.close, s.timeZone)
      // A window that is over as soon as it begins (both ends inside one spring-forward gap) never traded.
      const w2 = h && close > open ? { date, open, close, ...split(s, date, h, open, close) } : null
      w = w2 && w2.segs.length ? w2 : null
      if (windowCache.size >= 4096) windowCache.clear()
      windowCache.set(key, w)
    }
    return w
  }

  // Both walks stop at the first date that doesn't touch. A date with no
  // window can't be followed by a touching one: no window is longer than a
  // day, so a run only reaches date D+1 through the window opening on D.
  // A neighbour with a break joins the run only up to its first break (or
  // from its last one), unless `through` reads windows whole.
  /** The latest close of the run of touching windows after the one opening on `date`; `unbounded` if it is still touching LOOKAHEAD_DAYS on, `ends` says whether the run stops at a break or for the day. */
  const reachEnd = (s, date, close, through) => {
    for (let i = 1; i <= LOOKAHEAD_DAYS; i++) {
      const w = windowOn(s, addDays(date, i))
      const [first, ...more] = pieces(w, through)
      if (!w || first.open > close) return { at: close, unbounded: false, ends: 'close' }
      close = Math.max(close, first.close)
      if (more.length && first.close >= close) return { at: close, unbounded: false, ends: 'break' }
    }
    return { at: close, unbounded: true, ends: null }
  }

  /** The same walk backwards: the earliest open of the run before the window opening on `date`. */
  const reachStart = (s, date, open, through) => {
    for (let i = 1; i <= LOOKAHEAD_DAYS; i++) {
      const w = windowOn(s, addDays(date, -i))
      const ps = pieces(w, through)
      const last = ps[ps.length - 1]
      if (!w || last.close < open) return { at: open, unbounded: false }
      open = Math.min(open, last.open)
      if (ps.length > 1 && last.open <= open) return { at: open, unbounded: false }
    }
    return { at: open, unbounded: true }
  }

  /**
   * The run around `now` with its touching neighbours merged in, or null when
   * closed. `{ onBreak: true, resumes }` while inside a break.
   */
  const locate = (s, now) => {
    const today = localDate(now, s.timeZone)
    // Yesterday's window is the only other candidate: none runs past a day.
    for (const date of [today, addDays(today, -1)]) {
      const w = windowOn(s, date)
      if (!w || !(w.open <= now && now < w.close)) continue
      const i = w.segs.findIndex((g) => g.open <= now && now < g.close)
      if (i < 0) return { onBreak: true, resumes: w.segs.find((g) => g.open > now).open }
      const seg = w.segs[i]
      const end = i === w.segs.length - 1 ? reachEnd(s, w.date, w.close, false) : { at: seg.close, unbounded: false, ends: 'break' }
      const start = i === 0 ? reachStart(s, w.date, w.open, false) : { at: seg.open, unbounded: false }
      return { rawOpen: seg.open, open: start.at, close: end.at, openUnbounded: start.unbounded, closeUnbounded: end.unbounded, ends: end.ends }
    }
    return null
  }

  const nextOpen = (s, now) => {
    let date = localDate(now, s.timeZone)
    for (let i = 0; i <= LOOKAHEAD_DAYS; i++, date = addDays(date, 1)) {
      const w = windowOn(s, date)
      const seg = w && w.segs.find((g) => g.open > now)
      if (seg) return seg.open
    }
    return null
  }

  const holidaysThrough = (id) => {
    spec(id)
    const lists = [...(holidays['*'] || []), ...(holidays[id] || [])]
    return lists.length ? lists.reduce((a, b) => (b > a ? b : a)) : null
  }

  // Judged once, at creation, against the session's own local date. A session
  // with no list is left out on purpose by hosts (crypto, FX), so it is quiet.
  const issues = []
  for (const s of specs.values()) {
    const through = holidaysThrough(s.id)
    const ahead = through && dayNumber(through) - dayNumber(localDate(createdAt, s.timeZone))
    if (through && ahead < COVERAGE_DAYS) {
      const past = ahead < 0
      issues.push({ session: s.id, code: 'holiday-coverage', message: `The holiday list for "${s.id}" ${past ? 'ended' : 'ends'} on ${through}, ${plural(Math.abs(ahead))} ${past ? 'ago' : 'from now'}.` })
    }
  }

  const calendar = {
    sessions: Object.freeze([...specs.keys()]),

    session(id) {
      return spec(id)
    },

    isTradingDay(id, date) {
      return hoursOn(spec(id), date) !== null
    },

    /** The window that opens on a date, as instants (its close is on the next day for an overnight session), with its breaks when it has any, or null when it doesn't trade. */
    hours(id, date) {
      const w = windowOn(spec(id), date)
      if (!w) return null
      // `breaks` is there only when the window has one, so a session without breaks answers as it always did.
      return w.gaps.length ? { open: w.open, close: w.close, breaks: w.gaps } : { open: w.open, close: w.close }
    },

    holidaysThrough,

    issues: frozenCopy(issues),

    /**
     * Windows that touch are one: a session open Sunday to Friday as daily
     * windows is open all week. When that run is still going LOOKAHEAD_DAYS
     * later the calendar can't say when it ends, so closesAt, startedAt and
     * progress are null while open is true (crypto, which never closes).
     * A break closes the session and opens again at its end.
     */
    state(id, now) {
      const s = spec(id)
      const w = locate(s, now)
      if (!w) return { open: false, onBreak: false, opensAt: nextOpen(s, now), closesAt: null, startedAt: null, progress: null, ends: null }
      if (w.onBreak) return { open: false, onBreak: true, opensAt: w.resumes, closesAt: null, startedAt: null, progress: null, ends: null }
      const closesAt = w.closeUnbounded ? null : w.close
      const startedAt = w.closeUnbounded || w.openUnbounded ? null : w.open
      const progress = startedAt === null ? null : (now - startedAt) / (closesAt - startedAt)
      return { open: true, onBreak: false, opensAt: null, closesAt, startedAt, progress, ends: closesAt === null ? null : w.ends }
    },

    nextChange(id, now) {
      const st = calendar.state(id, now)
      if (st.open) return st.closesAt === null ? null : { at: st.closesAt, to: 'closed' }
      return st.opensAt === null ? null : { at: st.opensAt, to: 'open' }
    },

    /**
     * The next candle close while the session is open, aligned to its open
     * (NSE 5-minute candles close at 09:20, 09:25, …). The last candle of the
     * day closes with the session, even if it is short, and a candle never
     * crosses a break: the run after one is aligned to its own start. A
     * session with no known start or end has nothing to align to or cut at,
     * so it uses the day's own window.
     */
    candleClose(id, now, timeframeMinutes) {
      if (!(timeframeMinutes > 0)) throw new RangeError('timeframeMinutes must be a positive number')
      const w = locate(spec(id), now)
      if (!w || w.onBreak) return null
      const anchor = w.closeUnbounded || w.openUnbounded ? w.rawOpen : w.open
      const tf = timeframeMinutes * MINUTE
      const next = anchor + (Math.floor((now - anchor) / tf) + 1) * tf
      return w.closeUnbounded ? next : Math.min(next, w.close)
    },

    /**
     * Every session window that overlaps [from, to), in time order, with
     * touching windows merged and a break splitting its window in two. A run
     * that is still touching LOOKAHEAD_DAYS past the range, or before it, is
     * cut there, which is how activeProfile spots one that never closes.
     * `throughBreaks` returns each window whole, which is what the layout
     * profile wants (RFC 0004 §5.1).
     */
    windows(id, from, to, o) {
      const s = spec(id)
      const through = !!(o && o.throughBreaks)
      const raw = []
      let date = addDays(localDate(from, s.timeZone), -1)
      const last = addDays(localDate(to, s.timeZone), 1)
      for (; date <= last; date = addDays(date, 1)) {
        const w = windowOn(s, date)
        if (!w) continue
        const ps = pieces(w, through)
        ps.forEach((p, i) => {
          if (p.close > from && p.open < to) raw.push({ date, open: p.open, close: p.close, head: i === 0, tail: i === ps.length - 1 })
        })
      }
      return mergeWindows(raw).map((m) => ({
        open: m.head === null ? m.open : reachStart(s, m.head, m.open, through).at,
        close: m.tail === null ? m.close : reachEnd(s, m.tail, m.close, through).at,
      }))
    },
  }
  return Object.freeze(calendar)
}

const NO_BREAKS = Object.freeze([])
// What trades in a window: its segments, or the whole of it where breaks are ignored. A missing window has one empty piece, which no run touches.
const pieces = (w, through) => (!w ? NO_PIECE : through ? [w] : w.segs)
const NO_PIECE = [{ open: Infinity, close: -Infinity }]
const plural = (n) => `${n} day${n === 1 ? '' : 's'}`
const dayNumber = (date) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / DAY

/**
 * A window cut at its breaks. A break is a local time-of-day like `open`; a
 * time earlier than the open is the next morning's. It is clamped to the
 * window, because a close range can end the day before the break, and a
 * spring-forward gap can swallow it; one that ends up empty is dropped.
 */
function split(s, date, h, open, close) {
  const at = (hhmm) => zonedTime(hhmm >= h.open ? date : addDays(date, 1), hhmm, s.timeZone)
  const gaps = []
  for (const b of h.breaks) {
    const from = Math.max(at(b.from), open)
    const to = Math.min(at(b.to), close)
    if (to > from) gaps.push({ from, to })
  }
  const segs = []
  let cursor = open
  for (const g of gaps) {
    if (g.from > cursor) segs.push({ open: cursor, close: g.from })
    cursor = g.to
  }
  if (close > cursor) segs.push({ open: cursor, close })
  return { segs, gaps: frozenCopy(gaps) }
}

/**
 * Windows sorted by open, with those that overlap or touch joined. `head`
 * and `tail` are the opening dates of the pieces the run starts and ends
 * with, or null when that piece has a break next to it, so a caller can keep
 * growing the run from either end only where it really continues.
 */
function mergeWindows(list) {
  const out = []
  for (const w of list.sort((a, b) => a.open - b.open)) {
    const m = out[out.length - 1]
    if (m && w.open <= m.close) {
      if (w.close > m.close) {
        m.close = w.close
        m.tail = w.tail ? w.date : null
      }
    } else out.push({ open: w.open, close: w.close, head: w.head ? w.date : null, tail: w.tail ? w.date : null })
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
  checkBreaks(s.breaks, s.open, closes, fail, 'breaks')
  for (const [date, h] of Object.entries(s.specialSessions || {})) {
    if (!DATE_RE.test(date) || !h || !TIME_RE.test(h.open) || !TIME_RE.test(h.close)) {
      fail(`has a bad special session on ${date}`)
    }
    checkBreaks(h.breaks, h.open, [h.close], fail, `the breaks of the special session on ${date}`)
  }
}

const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))

/**
 * Breaks are checked as minutes after the open, so an overnight window's
 * next-morning times (a break at 02:20 in a window that opens 18:10) sort
 * after its evening ones. A break must sit strictly inside the window: one at
 * its edge is a different open or close. With close ranges the longest close
 * is the bound; a shorter close clips a break per date at run time.
 */
function checkBreaks(list, open, closes, fail, name) {
  if (list === undefined) return
  if (!Array.isArray(list) || list.length > MAX_BREAKS) fail(`${name} must be a list of at most ${MAX_BREAKS} { from, to }`)
  const after = (t) => (minutes(t) - minutes(open) + 1440) % 1440
  const length = Math.max(...closes.map((c) => after(c) || 1440))
  let end = 0
  for (const b of list) {
    if (!b || !TIME_RE.test(b.from) || !TIME_RE.test(b.to)) fail(`${name}: each break is { from: 'HH:MM', to: 'HH:MM' }, not ${JSON.stringify(b)}`)
    const from = after(b.from)
    const to = after(b.to)
    // Inside the window, from before to, and after the previous break: one test, so the message names all three.
    if (!(0 < from && from < to && to < length && from > end)) {
      fail(`${name}: the break ${b.from} to ${b.to} must start before it ends, sit strictly inside ${open} to ${closes.join(' or ')} and follow the break before it`)
    }
    end = to
  }
}

// ── Presets ──────────────────────────────────────────────────────────────
//
// Hours are read from each exchange's own page when a preset is written, never
// from memory, and the comment above each preset says which page and when.
// Exchanges change them (and early closes differ by day): a preset gives the
// regular hours, special days are the host's `specialSessions`, a host can
// always pass its own SessionSpec, and no preset bundles holidays (RFC 0004 §5.3).
//
// Not here, on purpose: CME Globex equity index futures and crypto. cmegroup.com
// answers automated requests with HTTP 403 and no exchange page for crypto
// could be read on 2026-10-26, and a preset is never written from a search
// snippet or memory.

const IST = 'Asia/Kolkata'
const NEW_YORK = 'America/New_York'
const WEEKDAYS = Object.freeze([1, 2, 3, 4, 5])

/** The US equity segments: the regular session, the extended hours either side of it, or all of them as one window. */
function usEquity(id, label, segment) {
  const timeZone = NEW_YORK
  if (segment === 'regular') return { id, label, timeZone, days: WEEKDAYS, open: '09:30', close: '16:00' }
  if (segment === 'pre') return { id: `${id}-pre`, label: `${label} pre-market`, timeZone, days: WEEKDAYS, open: '04:00', close: '09:30' }
  if (segment === 'post') return { id: `${id}-post`, label: `${label} post-market`, timeZone, days: WEEKDAYS, open: '16:00', close: '20:00' }
  if (segment === 'extended') return { id: `${id}-ext`, label: `${label} extended`, timeZone, days: WEEKDAYS, open: '04:00', close: '20:00' }
  throw new RangeError(`Unknown ${label} segment "${segment}"; use 'regular', 'pre', 'post' or 'extended'`)
}

export const presets = Object.freeze({
  // NSE: the cash market is 09:15 to 15:30 and equity derivatives close at
  // 15:40 (from 3 Aug 2026, NSE circular of 29 May 2026). The page also lists
  // a closing session after 15:30 for illiquid securities, which is not part of
  // the continuous session drawn here.
  // Source: https://www.nseindia.com/static/market-data/market-timings
  // Checked: 2026-10-26
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

  // MCX circular MCX/TRD/068/2026 (9 Feb 2026): metals and energy trade
  // 09:00–23:30 while the US is on daylight saving and 09:00–23:55 otherwise;
  // cotton, cotton oil and kapas 09:00–21:00; other agri 09:00–17:00.
  // NOT re-read on 2026-10-26: mcxindia.com refused every automated request
  // (HTTP 403), so these hours are the ones checked on the date below. A search
  // summary of the circular suggested a 23:45 figure that the circular's own
  // table could not be opened to settle; confirm before relying on 23:55.
  // Source: https://www.mcxindia.com/docs/default-source/circulars/english/2026/february/circular---068---2026.pdf
  // Checked: 2026-10-13
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

  // NYSE: the core session is 09:30 to 16:00 ET. NYSE (Tape A) itself has no
  // early or late trading session; the page lists NYSE Arca Equities with an
  // early session 04:00 to 09:30 and a late one 16:00 to 20:00, and the
  // 'pre', 'post' and 'extended' segments follow those. Early closes are the
  // host's specialSessions.
  // Source: https://www.nyse.com/markets/hours-calendars
  // Checked: 2026-10-26
  nyse({ segment = 'regular' } = {}) {
    return usEquity('nyse', 'NYSE', segment)
  },

  // Nasdaq: 09:30 to 16:00 ET, pre-market 04:00 to 09:30, after hours 16:00 to 20:00.
  // Source: https://www.nasdaq.com/market-activity/stock-market-holiday-schedule
  // Checked: 2026-10-26
  nasdaq({ segment = 'regular' } = {}) {
    return usEquity('nasdaq', 'Nasdaq', segment)
  },

  // London Stock Exchange: "trading hours are from 8:00 to 16:30", London time.
  // The opening auction before 08:00 and the closing auction after 16:30 are
  // not drawn: the exchange's own page does not give them, its Millennium
  // business parameters document does.
  // Source: https://www.londonstockexchange.com/personal-investing/faqs
  // Checked: 2026-10-26
  lse() {
    return { id: 'lse', label: 'LSE', timeZone: 'Europe/London', days: WEEKDAYS, open: '08:00', close: '16:30' }
  },

  // The spot FX week has no exchange of its own. Cboe FX Spot trades from
  // Sunday 17:00 ET to Friday 17:00 ET, which is written as five 24-hour
  // windows (Sunday to Thursday) that touch, so the week reads as one run.
  // Source: https://www.cboe.com/about/hours/fx/
  // Checked: 2026-10-26
  fx() {
    return { id: 'fx', label: 'FX', timeZone: NEW_YORK, days: [7, 1, 2, 3, 4], open: '17:00', close: '17:00' }
  },

  // Tokyo Stock Exchange: morning session 09:00 to 11:30, afternoon session
  // 12:30 to 15:30 (orders are accepted from 08:00 and 12:05), JST. The lunch
  // break is the one market here with a break.
  // Source: https://www.jpx.co.jp/english/equities/trading/domestic/01.html
  // Checked: 2026-10-26
  tse() {
    return { id: 'tse', label: 'TSE', timeZone: 'Asia/Tokyo', days: WEEKDAYS, open: '09:00', close: '15:30', breaks: [{ from: '11:30', to: '12:30' }] }
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
  // A lunch break doesn't change the layout unless the host asks (RFC 0004 §5.1, Decision 52).
  if (m.duringBreaks !== undefined && m.duringBreaks !== 'market' && m.duringBreaks !== 'closed') throw new TypeError("duringBreaks must be 'market' or 'closed'")
  const throughBreaks = m.duringBreaks !== 'closed'
  const raw = []
  const horizon = now + LOOKAHEAD_DAYS * DAY
  for (const id of m.sessions) {
    // windows() cuts a run that is still going at the horizon a few days past it, so a close beyond the horizon is one the month never reaches.
    for (const w of calendar.windows(id, now - DAY, horizon, { throughBreaks })) raw.push({ from: w.open - lead, to: w.close > horizon ? Infinity : w.close + lag })
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
