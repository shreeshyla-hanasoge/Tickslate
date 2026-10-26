/**
 * <ts-session-clock>: the time in an exchange's zone, whether it is open, and
 * how long until it closes or opens (RFC 0001 §8.5 widget 8). Sizes S and
 * Banner.
 *
 * It is the one widget that ticks itself, once a second at both sizes. S only
 * shows minutes, but the open/closed flip and the countdown must be on time
 * and a tick that just sets text is cheap. `every` pauses the timer while the
 * page is hidden or the element is disconnected.
 *
 * Times are shown in the FIRST session's time zone, whatever the other lanes
 * trade in, so a row of lanes reads against a single clock.
 *
 * Banner draws tick marks only for the first TWO timeframes: a third weight
 * would be noise on a rail a few hundred pixels wide. Drawing every close
 * reads as a barcode, so:
 *   - the first (thin) timeframe shows only the closes in the next hour, on
 *     open lanes: the ones a trader is watching, around the progress point;
 *   - the second (thick) timeframe shows its closes across the whole session,
 *     but only when they would sit at least MIN_TICK_GAP px apart on the rail
 *     as it is now. Width is DOM-only, so the model returns every candidate
 *     and `visibleTicks` (pure) filters them given a width, in update().
 * Ticks sit strictly inside the session, because its start and end are the
 * rail's own ends.
 *
 * `track` is false where how far through the session is can't be known (open
 * with a close but no start), and then the rail or its fill is not drawn.
 *
 * Overnight sessions (RFC 0003 §12): a lane's window may span two dates, and
 * then each of its times names the day when it isn't today. A session that is
 * open with no close the calendar can name is `endless`: a full rail, "Open
 * 24/7", no hours and no countdown, though its candles still feed the header.
 *
 * Breaks (RFC 0004 §5.2): a session with a lunch break is drawn as its whole
 * day with the break as a gap in the rail, the fill and the ticks, and reads
 * "Break" and "resumes 12:30" while it lasts. Its candles restart after the
 * break, so ticks are laid out per stretch that trades.
 */

import { TsWidget, sk, header } from './widget.js'
import { EN, createFormatter, localDate } from '../core/index.js'
import { setHTML, setNodes } from './html.js'
import { DEV, warnOnce } from './dev.js'

const DAY = 86400000
const MINUTE = 60000
// A guard against absurd timeframes (0.001 minutes), not a design limit: what
// is drawn is decided by visibleTicks.
const MAX_TICKS = 2000
const THIN_WINDOW = 60 * MINUTE
const MIN_TICK_GAP = 6
const MAX_TIMEFRAMES = 2
const GLYPHS = ['│', '┃']

// ── Pure model ─────────────────────────────────────────────────────────────

// One Intl set per locale+zone. The model runs every second, and Intl
// constructors cost far more than format().
const envCache = new Map()

function zoneEnv(timeZone, base) {
  const key = `${base.locale}|${base.currency}|${timeZone}`
  let env = envCache.get(key)
  if (!env) {
    if (envCache.size > 20) envCache.clear()
    const fmt = createFormatter({ locale: base.locale, currency: base.currency, timeZone })
    // Read the zone back from the formatter: configure() may have supplied one.
    const nameFmt = new Intl.DateTimeFormat(fmt.locale, { timeZone: fmt.timeZone, timeZoneName: 'short' })
    const dayFmt = new Intl.DateTimeFormat(fmt.locale, { timeZone: fmt.timeZone, weekday: 'short' })
    env = {
      fmt,
      // The short name can change with daylight saving, so it is read per instant.
      name(t) {
        const part = nameFmt.formatToParts(t).find((p) => p.type === 'timeZoneName')
        return part ? part.value : ''
      },
      weekday: (t) => dayFmt.format(t),
    }
    envCache.set(key, env)
  }
  return env
}

const round = (v, places) => {
  const k = 10 ** places
  return Math.round(v * k) / k
}

// A countdown never reads negative: the calendar only reports a close ahead of now, and the clamp keeps a clock that is a tick behind from showing a minus.
const words = (env, ms) => env.fmt.duration(Math.max(0, ms), { style: 'words' })

/**
 * "17:00", or "Tue 16:00" when `at` falls on another local date than `now`:
 * an overnight session's times need the day once they are not today's.
 */
function whenText(env, at, now, t) {
  const zone = env.fmt.timeZone
  return localDate(at, zone) === localDate(now, zone) ? env.fmt.time(at) : t('session.dayTime', { day: env.weekday(at), time: env.fmt.time(at) })
}

/**
 * The two ends of a window as text. A window inside one local date shows
 * plain times, as an exchange publishes them; one that crosses midnight
 * names the day of each end that isn't today.
 */
function windowTimes(env, win, now, t) {
  if (!win) return { from: '', to: '' }
  const zone = env.fmt.timeZone
  if (localDate(win.open, zone) === localDate(win.close, zone)) return { from: env.fmt.time(win.open), to: env.fmt.time(win.close) }
  return { from: whenText(env, win.open, now, t), to: whenText(env, win.close, now, t) }
}

function validCalendar(c) {
  return !!c && ['state', 'session', 'hours', 'candleClose'].every((m) => typeof c[m] === 'function')
}

/** { spec } for a known session, else { error } the lane can show. Only a missing name is expected; anything else is a bug and propagates. */
function lookup(calendar, id, t) {
  if (!validCalendar(calendar)) return { error: t('session.noCalendar') }
  try {
    return { spec: calendar.session(id) }
  } catch (err) {
    if (err instanceof RangeError) return { error: t('session.unknown', { session: id }) }
    throw err
  }
}

/**
 * The state of one known session: whether it is open, its window (the one it
 * is in, or the next one) and how far through it is. A session that is open
 * with no close in sight (crypto) is `endless`: it has no window to draw and
 * no countdown, and its rail is full.
 */
function laneState(calendar, id, now) {
  const base = laneBase(calendar, id, now)
  const { st, win, endless, gaps } = base
  // What moves each second is derived here from the cached boundaries; the calendar is not asked again.
  // With breaks the rail is the whole day, so the fill runs across the gap too.
  let progress = null
  if (gaps.length) progress = win && (st.open || st.onBreak) ? (now - win.open) / (win.close - win.open) : null
  else progress = st.open && st.startedAt !== null && st.closesAt !== null ? (now - st.startedAt) / (st.closesAt - st.startedAt) : null
  return {
    open: st.open,
    onBreak: st.onBreak,
    ends: st.ends,
    gaps,
    endless,
    win,
    opensAt: st.opensAt,
    closesAt: st.closesAt,
    // Open with a known close but no known start (a run that began over a month ago): there is no fraction to show.
    partial: st.open && !endless && st.startedAt === null,
    progress: endless ? 100 : (st.open || st.onBreak) && progress !== null ? round(progress * 100, 2) : 0,
    // More than a day away, a weekday says more than a duration does.
    far: !st.open && !st.onBreak && st.opensAt !== null && st.opensAt - now > DAY,
  }
}

// The calendar's answer for a session only changes when the session opens or
// closes, or when the day turns, so it is asked once for that stretch of time
// and not once a second per lane (RFC 0003 §23). Calendars are immutable, so
// a different calendar is a different key; the weak map frees the cache with it.
const laneCache = new WeakMap()
const NO_GAPS = Object.freeze([])

function cacheFor(calendar) {
  let cache = laneCache.get(calendar)
  if (!cache) laneCache.set(calendar, (cache = new Map()))
  return cache
}

/**
 * The whole window around `at` and its breaks, for a session that has them, else null. The
 * calendar's own run stops at a break, but a rail that stopped there would hide the afternoon.
 */
function breakDay(calendar, id, at) {
  const zone = calendar.session(id).timeZone
  for (const date of [localDate(at, zone), localDate(at - DAY, zone)]) {
    const h = calendar.hours(id, date)
    if (h && h.breaks && h.open <= at && at < h.close) return { win: { open: h.open, close: h.close }, gaps: h.breaks }
  }
  return null
}

function laneBase(calendar, id, now) {
  const cache = cacheFor(calendar)
  const hit = cache.get(`lane|${id}`)
  if (hit && now >= hit.from && now < hit.until) return hit
  const st = calendar.state(id, now)
  const endless = st.open && st.closesAt === null
  let win = null
  const at = st.open ? now : st.opensAt
  const day = endless || at === null ? null : breakDay(calendar, id, at)
  if (day) win = day.win
  else if (st.open) {
    if (st.closesAt !== null && st.startedAt !== null) win = { open: st.startedAt, close: st.closesAt }
  } else if (st.opensAt !== null) {
    // Ask what the session will be once open, so windows that touch read as one (an FX week) and an overnight one keeps its next-day close.
    const next = calendar.state(id, st.opensAt)
    if (next.open && next.closesAt !== null && next.startedAt !== null) win = { open: next.startedAt, close: next.closesAt }
  }
  const change = st.open ? st.closesAt : st.opensAt
  const dayEnd = (Math.floor(now / DAY) + 1) * DAY
  const entry = { st, win, endless, gaps: day ? day.gaps : NO_GAPS, from: now, until: change === null ? dayEnd : Math.min(change, dayEnd) }
  if (cache.size >= 64) cache.clear()
  cache.set(`lane|${id}`, entry)
  return entry
}

// The next candle close holds until it is reached, so it too is asked once per candle.
function candleClose(calendar, id, now, tf) {
  const cache = cacheFor(calendar)
  const key = `candle|${tf}|${id}`
  const hit = cache.get(key)
  if (hit && now >= hit.from && now < hit.until) return hit.until
  const at = calendar.candleClose(id, now, tf)
  if (at !== null && at > now) {
    if (cache.size >= 64) cache.clear()
    cache.set(key, { from: now, until: at })
  }
  return at
}

// Candidate ticks depend only on the session window and the timeframes, so
// they are computed once per day, not once per second. Each carries its
// position in % (l), its timeframe index (k) and its instant (at).
const tickCache = new Map()

function tickItems(win, tfs, gaps) {
  const key = `${win.open}|${win.close}|${tfs.join(',')}|${gaps.map((g) => `${g.from}-${g.to}`).join(',')}`
  let ticks = tickCache.get(key)
  if (!ticks) {
    if (tickCache.size > 32) tickCache.clear()
    const items = []
    const length = win.close - win.open
    // How far apart one timeframe's neighbours are, in % of the rail.
    const steps = tfs.map((tf) => round((tf * MINUTE / length) * 100, 3))
    // Each stretch that trades is counted from its own start: a candle never crosses a break.
    const stretches = []
    let from = win.open
    for (const g of gaps) {
      stretches.push({ from, to: g.from })
      from = g.to
    }
    stretches.push({ from, to: win.close })
    tfs.forEach((tf, k) => {
      const step = tf * MINUTE
      if (length / step > MAX_TICKS) return
      for (const sx of stretches) {
        for (let off = step; off < sx.to - sx.from; off += step) items.push({ l: round(((sx.from + off - win.open) / length) * 100, 3), k, at: sx.from + off })
      }
    })
    ticks = { key, items, steps }
    tickCache.set(key, ticks)
  }
  return ticks
}

/**
 * The ticks to draw for a lane at `now` on a rail `railPx` wide, with a key
 * that changes only when the drawn set does (the thin window slides every
 * candle; the thick set appears or vanishes when the rail resizes).
 * Pure: update() reads the width and calls this.
 */
export function visibleTicks(lane, now, railPx) {
  const ticks = lane.ticks
  const thickOk = ticks.steps.length > 1 && (ticks.steps[1] / 100) * railPx >= MIN_TICK_GAP
  const items = []
  let lo = -1
  let hi = -1
  ticks.items.forEach((t, i) => {
    if (t.k === 0) {
      if (lane.open && t.at > now && t.at <= now + THIN_WINDOW) {
        if (lo < 0) lo = i
        hi = i
        items.push(t)
      }
    } else if (thickOk) items.push(t)
  })
  return { key: `${ticks.key}|${lo}|${hi}|${thickOk ? 1 : 0}`, items }
}

const validTimeframe = (t) => typeof t === 'number' && Number.isFinite(t) && t > 0

function sanitiseTimeframes(list) {
  if (!Array.isArray(list)) return []
  return list.filter(validTimeframe).slice(0, MAX_TIMEFRAMES)
}

function timeframeText(tf, t) {
  return tf >= 60 && tf % 60 === 0 ? t('session.tfHours', { count: tf / 60 }) : t('session.tfMinutes', { count: tf })
}

/** "opens 09:15", or "opens Mon 09:15" when it is more than a day away. */
function opensText(env, st, withTime, t) {
  if (st.far) {
    return withTime
      ? t('session.opensOn', { day: env.weekday(st.opensAt), time: env.fmt.time(st.opensAt) })
      : t('session.opensDay', { day: env.weekday(st.opensAt) })
  }
  return t('session.opens', { time: env.fmt.time(st.opensAt) })
}

function ariaFor(name, env, st, now, t) {
  if (st.endless) return t('session.ariaOpen247', { session: name })
  if (st.onBreak) return t('session.ariaBreak', { session: name, opens: opensText(env, st, true, t) })
  // A run that ends at a break closes for the day later, which is what "closes" should say.
  if (st.open) return t('session.ariaOpen', { session: name, time: whenText(env, st.ends === 'break' && st.win ? st.win.close : st.closesAt, now, t) })
  if (st.opensAt === null) return t('session.ariaNone', { session: name })
  return t('session.ariaClosed', { session: name, opens: opensText(env, st, true, t) })
}

/**
 * Pure: data in, strings and percentages out. Never throws for a missing
 * calendar or an unknown session id; those show as a muted message.
 *
 * S: { variant, live, title, titleShort, session, time, zone, progress, gaps, track, from, to, middle, middleShort, ariaLabel }
 * Banner: { variant, live, title, clock, legend: [{ mark, text }], nextClose, lanes, ariaLabel }
 *   lane: { id, name, error, open, hours, progress, gaps: [{ l, w }], track, right, sub, ticks: { key, items: [{ l, k, at }], steps }, next }
 *   (ticks are all the candidates; visibleTicks picks what to draw. `now` is on the model for it.)
 *   (percentages are 0–100; `next` is null unless the lane is open and has timeframes)
 */
export function sessionClockModel(data, variant, ctx) {
  const d = data && typeof data === 'object' ? data : {}
  const given = Array.isArray(d.sessions) ? d.sessions : []
  const ids = given.filter((s) => typeof s === 'string')
  const now = ctx.now
  const { t } = ctx
  const first = ids.length ? lookup(d.calendar, ids[0], t) : { error: t('session.none') }
  const env = zoneEnv(first.spec ? first.spec.timeZone : ctx.fmt.timeZone, ctx.fmt)
  const vm = variant === 'Banner' ? banner(d, ids, first, env, now, ctx) : small(d, ids, first, env, now, ctx)
  // Entries that gave no session to show: ids that aren't strings, and (on
  // Banner) timeframes that aren't positive numbers. An id the calendar
  // doesn't know still shows as a lane with its error, so it isn't dropped.
  const badTimeframes = variant === 'Banner' && Array.isArray(d.timeframes) ? d.timeframes.filter((t) => !validTimeframe(t)).length : 0
  vm.dropped = given.length - ids.length + badTimeframes
  return vm
}

/** The breaks as % of the rail: where each starts and how wide it is. */
function gapsOf(st) {
  if (!st.win || !st.gaps.length) return []
  const length = st.win.close - st.win.open
  return st.gaps.map((g) => ({ l: round(((g.from - st.win.open) / length) * 100, 3), w: round(((g.to - g.from) / length) * 100, 3) }))
}

function small(d, ids, first, env, now, ctx) {
  const { t } = ctx
  const zone = env.name(now)
  const time = env.fmt.time(now)
  if (first.error) {
    return {
      variant: 'S',
      live: false,
      title: ctx.label || t('widget.sessionClock.label'),
      titleShort: ctx.label || t('widget.sessionClock.label'),
      session: ids.length ? ids[0] : '',
      time,
      zone,
      progress: 0,
      gaps: [],
      track: true,
      from: '',
      to: '',
      middle: first.error,
      middleShort: first.error,
      ariaLabel: t('session.aria', { label: ctx.label, state: first.error }),
    }
  }
  const id = ids[0]
  const spec = first.spec
  const st = laneState(d.calendar, id, now)
  const times = windowTimes(env, st.win, now, t)
  // The short form is for a phone-width tile: just the duration or the day and time.
  let middle
  let middleShort
  if (st.endless) {
    middle = t('session.open247')
    middleShort = middle
  } else if (st.onBreak) {
    middle = t('session.resumes', { time: whenText(env, st.opensAt, now, t) })
    middleShort = middle
  } else if (st.open) {
    middleShort = words(env, st.closesAt - now)
    middle = t('session.toClose', { time: middleShort })
    if (st.ends === 'break') middle = t('session.toBreak', { time: middleShort })
  } else if (st.opensAt === null) {
    middle = t('session.noneScheduled')
    middleShort = t('session.noneShort')
  } else if (st.far) {
    middle = opensText(env, st, true, t)
    middleShort = t('session.dayTime', { day: env.weekday(st.opensAt), time: env.fmt.time(st.opensAt) })
  } else {
    middleShort = words(env, st.opensAt - now)
    middle = t('session.opensIn', { time: middleShort })
  }
  return {
    variant: 'S',
    live: st.open,
    title: st.onBreak ? t('session.break') : st.open ? t('session.open') : t('session.closed'),
    titleShort: st.onBreak ? t('session.break') : st.open ? t('session.openShort') : t('session.closedShort'),
    session: spec.label,
    time,
    zone,
    progress: st.progress,
    gaps: gapsOf(st),
    track: !st.partial,
    from: st.partial ? '' : times.from,
    to: st.partial ? whenText(env, st.closesAt, now, t) : times.to,
    middle,
    middleShort,
    ariaLabel: t('session.aria', { label: ctx.label, state: ariaFor(spec.label, env, st, now, t) }),
  }
}

function banner(d, ids, first, env, now, ctx) {
  const { t } = ctx
  const tfs = sanitiseTimeframes(d.timeframes)
  const lanes = []
  const spoken = []
  let nextAt = null
  ids.forEach((id, i) => {
    const found = i === 0 ? first : lookup(d.calendar, id, t)
    if (found.error) {
      lanes.push({ id, name: id, error: found.error, open: false, hours: '', progress: 0, gaps: [], track: true, right: '', sub: '', ticks: { key: '', items: [], steps: [] }, next: null })
      spoken.push(found.error)
      return
    }
    const spec = found.spec
    const st = laneState(d.calendar, id, now)
    const times = windowTimes(env, st.win, now, t)
    let next = null
    if (st.open && tfs.length) {
      const closes = tfs.map((tf) => candleClose(d.calendar, id, now, tf)).filter((t) => t !== null)
      if (closes.length) {
        // A loop rather than a spread into Math.min: no argument list grows with the data.
        let at = Infinity
        for (const t of closes) at = Math.min(at, t)
        // An endless lane has no rail to place the mark on, but its candle still counts for the header.
        if (st.win) next = round(((at - st.win.open) / (st.win.close - st.win.open)) * 100, 2)
        if (nextAt === null || at < nextAt) nextAt = at
      }
    }
    let right
    let sub = ''
    if (st.endless) right = t('session.open247')
    else if (st.onBreak) {
      right = t('session.break')
      sub = t('session.resumes', { time: whenText(env, st.opensAt, now, t) })
    } else if (st.open) right = t(st.ends === 'break' ? 'session.toBreak' : 'session.left', { time: words(env, st.closesAt - now) })
    else right = st.opensAt === null ? t('session.noneShort') : opensText(env, st, false, t)
    lanes.push({
      id,
      name: spec.label,
      error: null,
      open: st.open,
      // With no start to show, the hours are just the close, after the dash that would have followed the open.
      hours: st.win ? `${times.from}–${times.to}` : st.partial ? `–${whenText(env, st.closesAt, now, t)}` : '',
      progress: st.progress,
      gaps: gapsOf(st),
      track: !st.partial,
      right,
      sub,
      ticks: st.win ? tickItems(st.win, tfs, st.gaps) : { key: '', items: [], steps: [] },
      next,
    })
    spoken.push(ariaFor(spec.label, env, st, now, t))
  })
  const zone = env.name(now)
  return {
    variant: 'Banner',
    now,
    live: lanes.some((l) => l.open),
    title: t('session.title'),
    clock: `${env.fmt.time(now, { seconds: true })} ${zone}`.trim(),
    legend: tfs.map((tf, i) => ({ mark: GLYPHS[i], text: t(i === 0 ? 'session.legendNext' : 'session.legend', { tf: timeframeText(tf, t) }) })),
    nextClose: nextAt === null ? '' : t('session.nextClose', { time: env.fmt.duration(nextAt - now) }),
    lanes,
    ariaLabel: t('session.aria', { label: ctx.label, state: spoken.length ? spoken.join('; ') : t('session.none') }),
  }
}

// ── Element ────────────────────────────────────────────────────────────────

// Calendars already checked: the issues are frozen at creation, so once is enough.
let warnedCalendars = 0
const coverageChecked = new WeakMap()

/** Development only: says once per calendar that a holiday list is about to run out (RFC 0004 §5.4). It changes nothing on screen. */
function warnCoverage(data) {
  const calendar = data && data.calendar
  if (!calendar || typeof calendar !== 'object' || coverageChecked.has(calendar)) return
  // Keyed per calendar, so a second calendar with the same problem is reported too.
  coverageChecked.set(calendar, (warnedCalendars += 1))
  for (const issue of Array.isArray(calendar.issues) ? calendar.issues : []) {
    if (DEV && issue && issue.code === 'holiday-coverage') warnOnce(`holiday-coverage|${coverageChecked.get(calendar)}|${issue.session}|${issue.message}`, `${issue.message} See docs/guide/sessions.md`)
  }
}

const setText = (el, value) => {
  if (el && el.textContent !== value) el.textContent = value
}

const LANE_HTML =
  '<div class="lane"><div class="lcol"><span class="lname sm ell"></span><span class="lhours xs mut n ell"></span></div>' +
  '<div class="lt"><div class="rail"></div><div class="lf"></div><div class="gps"></div><div class="tks"></div><div class="mk"></div><span class="msg xs mut ell" hidden></span></div>' +
  '<div class="lrw"><span class="lr n sm mut"></span><span class="lr2 xs mut" hidden></span></div></div>'

// Loading shapes follow each variant's layout. A Banner can't know how many
// sessions it will show, so it draws two lanes.
const SKELETON_LANE = `<div class="lane"><div class="lcol">${sk(80, 11)}${sk(60, 9)}</div><div class="f1">${sk(100, 4)}</div><div class="lr">${sk(70, 10)}</div></div>`
const SKELETONS = {
  S: `${header({ labelClass: 'title' })}<div class="rowb">${sk(45, 30)}${sk(25, 11)}</div><span class="f1"></span>${sk(100, 6)}<div class="row">${sk(15, 9)}<span class="f1"></span>${sk(15, 9)}</div>`,
  Banner: `${header({ labelClass: 'title', meta: sk(20, 9) })}<div class="lanes">${SKELETON_LANE.repeat(2)}</div>`,
}

export class TsSessionClock extends TsWidget {
  static catalogKey = 'sessionClock'
  static emptyText = EN['widget.sessionClock.empty']
  static dataShape = {
    calendar: 'object',
    sessions: { kind: 'array', of: 'string' },
    timeframes: { kind: 'array', optional: true, of: 'number' },
  }

  static styles = `
[hidden] { display: none !important; }
.trk { position: relative; height: 6px; border-radius: 99px; background: var(--ts-surface-2); overflow: hidden; flex: none; }
/* Time runs left to right in every locale, so a progress track never mirrors, and the times under it stay under its ends. */
.trk, .lt, .ft { direction: ltr; }
.fill, .lf { position: absolute; inset-inline-start: 0; width: 0; background: var(--ts-accent); border-radius: 99px; }
.fill { top: 0; bottom: 0; }
.ft { gap: 6px; }
.ft .n { flex: none; }
.mid { text-align: center; unicode-bidi: plaintext; }
.title { white-space: nowrap; flex: none; }
.ts, .ms { display: none; }
.legend { display: flex; gap: 10px; white-space: nowrap; }
/* When the header is short the next close gives way (an ellipsis), never the clock beside it. */
.nx { font-weight: 600; white-space: nowrap; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.clock { flex: none; }
.lanes { display: flex; flex-direction: column; gap: 6px; flex: 1; min-height: 0; justify-content: center; }
.lane { display: flex; align-items: center; gap: 14px; }
.lcol { width: 110px; flex: none; display: flex; flex-direction: column; gap: 1px; }
.lname { font-weight: 600; }
.lt { position: relative; flex: 1; min-width: 0; height: 26px; }
.rail, .lf { position: absolute; top: 11px; height: 4px; border-radius: 99px; }
.rail { inset-inline: 0; background: var(--ts-surface-2); }
.tks { position: absolute; inset: 0; pointer-events: none; }
.tk { position: absolute; top: 8px; width: 1px; height: 10px; background: var(--ts-muted); }
.tk.b { top: 5px; height: 16px; background: var(--ts-ink); }
.mk { position: absolute; top: 2px; inset-inline-start: 0; width: 6px; height: 22px; margin-inline-start: -3px; border-radius: 2px; box-shadow: inset 0 0 0 2px var(--ts-ink); }
.msg { position: absolute; inset: 0; display: flex; align-items: center; unicode-bidi: plaintext; }
.lr, .lrw { width: 90px; flex: none; text-align: end; white-space: nowrap; }
.lrw { display: flex; flex-direction: column; align-items: flex-end; }
/* A break is a hole in the rail, fill and ticks: it is painted in the tile's own surface, so it needs no colour of its own. */
.gps { position: absolute; inset: 0; pointer-events: none; }
.gp { position: absolute; top: 0; bottom: 0; background: var(--ts-surface); }
.lt .gp { top: 11px; bottom: auto; height: 4px; }
/* Box-shadows, and the backgrounds that tell a track from its fill, are gone in forced colours. Outlines and the fill stay. */
@media (forced-colors: active) {
  .trk, .rail { box-sizing: border-box; border: 1px solid CanvasText; background: ButtonFace; }
  .fill, .lf { background: Highlight; }
  /* The gap keeps the track's face and is edged in text colour, so it still reads as a break. */
  .gp { box-sizing: border-box; background: ButtonFace; border-inline: 1px solid CanvasText; }
  .tk, .tk.b { background: CanvasText; }
  .mk { box-sizing: border-box; border: 2px solid CanvasText; box-shadow: none; }
}
@container (max-width: 480px) { .legend { display: none; } }
@container (max-width: 400px) { .lane { gap: 10px; } .lcol { width: 84px; } .lr, .lrw { width: auto; min-width: 72px; } }
/* A phone-width S (~170px): short words so nothing wraps or truncates. */
@container (max-width: 220px) { .tf, .mf { display: none; } .ts, .ms { display: inline; } }
`

  static template(variant) {
    if (variant === 'Banner') {
      return (
        header({
          dot: true,
          labelClass: 'title',
          extra: '<span class="n sm clock ell"></span>',
          // The tick glyphs are decoration: the words beside them say what each tick means.
          meta:
            '<span class="legend xs mut"><span class="lg0"><span class="lgm" aria-hidden="true"></span> <span class="lgt"></span></span>' +
            '<span class="lg1"><span class="lgm" aria-hidden="true"></span> <span class="lgt"></span></span></span>' +
            '<span class="nx xs"><span aria-hidden="true">▮ </span><span class="nxt"></span></span>',
        }) +
        '<div class="lanes"></div>'
      )
    }
    return (
      header({ dot: true, labelClass: 'title', inner: '<span class="tf"></span><span class="ts"></span>', meta: '<span class="xs mut sess ell"></span>' }) +
      '<div class="rowb"><span class="big time" part="value"></span><span class="sm mut zone"></span></div>' +
      '<span class="f1"></span>' +
      '<div class="trk"><div class="fill"></div><div class="gps"></div></div>' +
      '<div class="row xs mut ft sec"><span class="n from"></span><span class="f1"></span><span class="mid ell"><span class="mf"></span><span class="ms"></span></span><span class="f1"></span><span class="n to"></span></div>'
    )
  }

  static skeleton(variant) {
    return SKELETONS[variant] || SKELETONS.S
  }

  static viewModel(data, variant, ctx) {
    return sessionClockModel(data, variant, ctx)
  }

  connectedCallback() {
    super.connectedCallback()
    this.every(1000)
  }

  update(vm, variant) {
    if (DEV) warnCoverage(this.data)
    if (variant === 'Banner') this._updateBanner(vm)
    else this._updateSmall(vm)
  }

  _updateSmall(vm) {
    this.$('.dot').hidden = !vm.live
    setText(this.$('.tf'), vm.title)
    setText(this.$('.ts'), vm.titleShort)
    setText(this.$('.sess'), vm.session)
    setText(this.$('.time'), vm.time)
    setText(this.$('.zone'), vm.zone)
    this.$('.fill').style.width = `${vm.progress}%`
    this._gaps(this.$('.gps'), vm.gaps)
    this.$('.trk').hidden = !vm.track
    this.$('.from').hidden = !vm.track
    setText(this.$('.from'), vm.from)
    setText(this.$('.mf'), vm.middle)
    setText(this.$('.ms'), vm.middleShort)
    // The full sentence stays reachable when the short form is showing.
    const mid = this.$('.mid')
    if (mid.title !== vm.middle) mid.title = vm.middle
    setText(this.$('.to'), vm.to)
  }

  /** The break gaps, rebuilt only when they move (once a day, as the lane's day turns). */
  _gaps(host, gaps) {
    const key = gaps.map((g) => `${g.l}:${g.w}`).join('|')
    if (host._gapKey === key) return
    host._gapKey = key
    setNodes(host, gaps.map((g) => ({ tag: 'i', attrs: { class: 'gp' }, css: { 'inset-inline-start': `${g.l}%`, width: `${g.w}%` } })))
  }

  _updateBanner(vm) {
    this.$('.dot').hidden = !vm.live
    setText(this.$('.title'), vm.title)
    setText(this.$('.clock'), vm.clock)
    this.$('.legend').hidden = vm.legend.length === 0
    for (let i = 0; i < 2; i++) {
      const item = vm.legend[i]
      const el = this.$(`.lg${i}`)
      el.hidden = !item
      setText(this.$(`.lg${i} .lgm`), item ? item.mark : '')
      setText(this.$(`.lg${i} .lgt`), item ? item.text : '')
    }
    const nx = this.$('.nx')
    nx.hidden = !vm.nextClose
    setText(this.$('.nxt'), vm.nextClose)

    const rows = this._laneRows(vm.lanes)
    // Read every width before any write below, so the browser lays out once.
    const widths = rows.map((row) => row.track.clientWidth)
    vm.lanes.forEach((lane, i) => {
      const row = rows[i]
      setText(row.name, lane.name)
      setText(row.hours, lane.error ? '' : lane.hours)
      setText(row.right, lane.right)
      row.sub.hidden = !lane.sub
      setText(row.sub, lane.sub)
      row.msg.hidden = !lane.error
      setText(row.msg, lane.error || '')
      row.rail.hidden = !!lane.error
      row.fill.hidden = !!lane.error || !lane.track
      row.fill.style.width = `${lane.progress}%`
      this._gaps(row.gaps, lane.gaps)
      // The tick container is rebuilt only when the drawn set changes (a
      // candle passes, the day changes, the rail resizes); every other
      // second only the fill and marker move.
      const ticks = visibleTicks(lane, vm.now, widths[i])
      if (row.tickKey !== ticks.key) {
        // DOM-built, each tick placed through element.style: a style attribute in markup is blocked by a strict style-src.
        setNodes(row.ticks, ticks.items.map((t) => ({ tag: 'i', attrs: { class: t.k ? 'tk b' : 'tk' }, css: { 'inset-inline-start': `${t.l}%` } })))
        row.tickKey = ticks.key
      }
      row.mark.hidden = lane.next === null
      if (lane.next !== null) row.mark.style.insetInlineStart = `${lane.next}%`
    })
  }

  /** The lane rows, rebuilt only when the list of sessions or the container they live in changes. */
  _laneRows(lanes) {
    const host = this.$('.lanes')
    const key = lanes.map((l) => l.id).join('\n')
    const cur = this._lanes
    if (cur && cur.host === host && cur.key === key) return cur.rows
    setHTML(host, LANE_HTML, lanes.length)
    const rows = Array.from(host.querySelectorAll('.lane')).map((el) => ({
      name: el.querySelector('.lname'),
      hours: el.querySelector('.lhours'),
      right: el.querySelector('.lr'),
      sub: el.querySelector('.lr2'),
      gaps: el.querySelector('.gps'),
      rail: el.querySelector('.rail'),
      fill: el.querySelector('.lf'),
      track: el.querySelector('.lt'),
      ticks: el.querySelector('.tks'),
      mark: el.querySelector('.mk'),
      msg: el.querySelector('.msg'),
      tickKey: null,
    }))
    this._lanes = { host, key, rows }
    return rows
  }
}
