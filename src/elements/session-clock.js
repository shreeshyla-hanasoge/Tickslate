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
 */

import { TsWidget, sk } from './widget.js'
import { createFormatter, localDate } from '../core/index.js'

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

const words = (env, ms) => env.fmt.duration(ms, { style: 'words' })

function validCalendar(c) {
  return !!c && ['state', 'session', 'hours', 'candleClose'].every((m) => typeof c[m] === 'function')
}

/** { spec } for a known session, else { error } the lane can show. Only a missing name is expected; anything else is a bug and propagates. */
function lookup(calendar, id) {
  if (!validCalendar(calendar)) return { error: 'No calendar' }
  try {
    return { spec: calendar.session(id) }
  } catch (err) {
    if (err instanceof RangeError) return { error: `Unknown session ${id}` }
    throw err
  }
}

/** The state of one known session: whether it is open, its window (today's or the next one) and how far through it is. */
function laneState(calendar, id, spec, now) {
  const st = calendar.state(id, now)
  let win = null
  if (st.open) win = { open: st.startedAt, close: st.closesAt }
  else if (st.opensAt !== null) win = calendar.hours(id, localDate(st.opensAt, spec.timeZone))
  return {
    open: st.open,
    win,
    opensAt: st.opensAt,
    closesAt: st.closesAt,
    progress: st.open ? round(st.progress * 100, 2) : 0,
    // More than a day away, a weekday says more than a duration does.
    far: !st.open && st.opensAt !== null && st.opensAt - now > DAY,
  }
}

// Candidate ticks depend only on the session window and the timeframes, so
// they are computed once per day, not once per second. Each carries its
// position in % (l), its timeframe index (k) and its instant (at).
const tickCache = new Map()

function tickItems(win, tfs) {
  const key = `${win.open}|${win.close}|${tfs.join(',')}`
  let ticks = tickCache.get(key)
  if (!ticks) {
    if (tickCache.size > 32) tickCache.clear()
    const items = []
    const length = win.close - win.open
    // How far apart one timeframe's neighbours are, in % of the rail.
    const steps = tfs.map((tf) => round((tf * MINUTE / length) * 100, 3))
    tfs.forEach((tf, k) => {
      const step = tf * MINUTE
      if (length / step > MAX_TICKS) return
      for (let off = step; off < length; off += step) items.push({ l: round((off / length) * 100, 3), k, at: win.open + off })
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

function timeframeText(tf) {
  return tf >= 60 && tf % 60 === 0 ? `${tf / 60}h` : `${tf}m`
}

/** "opens 09:15", or "opens Mon 09:15" when it is more than a day away. */
function opensText(env, st, withTime) {
  if (st.far) return withTime ? `opens ${env.weekday(st.opensAt)} ${env.fmt.time(st.opensAt)}` : `opens ${env.weekday(st.opensAt)}`
  return `opens ${env.fmt.time(st.opensAt)}`
}

function ariaFor(name, env, st) {
  if (st.open) return `${name} open, closes ${env.fmt.time(st.closesAt)}`
  if (st.opensAt === null) return `${name} closed, no session scheduled`
  return `${name} closed, ${opensText(env, st, true)}`
}

/**
 * Pure: data in, strings and percentages out. Never throws for a missing
 * calendar or an unknown session id; those show as a muted message.
 *
 * S: { variant, live, title, titleShort, session, time, zone, progress, from, to, middle, middleShort, ariaLabel }
 * Banner: { variant, live, title, clock, legend: [{ mark, text }], nextClose, lanes, ariaLabel }
 *   lane: { id, name, error, open, hours, progress, right, ticks: { key, items: [{ l, k, at }], steps }, next }
 *   (ticks are all the candidates; visibleTicks picks what to draw. `now` is on the model for it.)
 *   (percentages are 0–100; `next` is null unless the lane is open and has timeframes)
 */
export function sessionClockModel(data, variant, ctx) {
  const d = data && typeof data === 'object' ? data : {}
  const given = Array.isArray(d.sessions) ? d.sessions : []
  const ids = given.filter((s) => typeof s === 'string')
  const now = ctx.now
  const first = ids.length ? lookup(d.calendar, ids[0]) : { error: 'No sessions' }
  const env = zoneEnv(first.spec ? first.spec.timeZone : ctx.fmt.timeZone, ctx.fmt)
  const vm = variant === 'Banner' ? banner(d, ids, first, env, now) : small(d, ids, first, env, now, ctx)
  // Entries that gave no session to show: ids that aren't strings, and (on
  // Banner) timeframes that aren't positive numbers. An id the calendar
  // doesn't know still shows as a lane with its error, so it isn't dropped.
  const badTimeframes = variant === 'Banner' && Array.isArray(d.timeframes) ? d.timeframes.filter((t) => !validTimeframe(t)).length : 0
  vm.dropped = given.length - ids.length + badTimeframes
  return vm
}

function small(d, ids, first, env, now, ctx) {
  const zone = env.name(now)
  const time = env.fmt.time(now)
  if (first.error) {
    return {
      variant: 'S',
      live: false,
      title: ctx.label || 'Session clock',
      titleShort: ctx.label || 'Session clock',
      session: ids.length ? ids[0] : '',
      time,
      zone,
      progress: 0,
      from: '',
      to: '',
      middle: first.error,
      middleShort: first.error,
      ariaLabel: `Session clock: ${first.error}`,
    }
  }
  const id = ids[0]
  const spec = first.spec
  const st = laneState(d.calendar, id, spec, now)
  // The short form is for a phone-width tile: just the duration or the day and time.
  let middle
  let middleShort
  if (st.open) {
    middleShort = words(env, st.closesAt - now)
    middle = `${middleShort} to close`
  } else if (st.opensAt === null) {
    middle = 'no session scheduled'
    middleShort = 'no session'
  } else if (st.far) {
    middle = opensText(env, st, true)
    middleShort = `${env.weekday(st.opensAt)} ${env.fmt.time(st.opensAt)}`
  } else {
    middleShort = words(env, st.opensAt - now)
    middle = `opens in ${middleShort}`
  }
  return {
    variant: 'S',
    live: st.open,
    title: st.open ? 'Market open' : 'Market closed',
    titleShort: st.open ? 'Open' : 'Closed',
    session: spec.label,
    time,
    zone,
    progress: st.progress,
    from: st.win ? env.fmt.time(st.win.open) : '',
    to: st.win ? env.fmt.time(st.win.close) : '',
    middle,
    middleShort,
    ariaLabel: `Session clock: ${ariaFor(spec.label, env, st)}`,
  }
}

function banner(d, ids, first, env, now) {
  const tfs = sanitiseTimeframes(d.timeframes)
  const lanes = []
  const spoken = []
  let nextAt = null
  ids.forEach((id, i) => {
    const found = i === 0 ? first : lookup(d.calendar, id)
    if (found.error) {
      lanes.push({ id, name: id, error: found.error, open: false, hours: '', progress: 0, right: '', ticks: { key: '', items: [], steps: [] }, next: null })
      spoken.push(found.error)
      return
    }
    const spec = found.spec
    const st = laneState(d.calendar, id, spec, now)
    let next = null
    if (st.open && tfs.length) {
      const closes = tfs.map((tf) => d.calendar.candleClose(id, now, tf)).filter((t) => t !== null)
      if (closes.length) {
        // A loop rather than a spread into Math.min: no argument list grows with the data.
        let at = Infinity
        for (const t of closes) at = Math.min(at, t)
        next = round(((at - st.win.open) / (st.win.close - st.win.open)) * 100, 2)
        if (nextAt === null || at < nextAt) nextAt = at
      }
    }
    let right
    if (st.open) right = `${words(env, st.closesAt - now)} left`
    else right = st.opensAt === null ? 'no session' : opensText(env, st, false)
    lanes.push({
      id,
      name: spec.label,
      error: null,
      open: st.open,
      hours: st.win ? `${env.fmt.time(st.win.open)}–${env.fmt.time(st.win.close)}` : '',
      progress: st.progress,
      right,
      ticks: st.win ? tickItems(st.win, tfs) : { key: '', items: [], steps: [] },
      next,
    })
    spoken.push(ariaFor(spec.label, env, st))
  })
  const zone = env.name(now)
  return {
    variant: 'Banner',
    now,
    live: lanes.some((l) => l.open),
    title: 'Sessions',
    clock: `${env.fmt.time(now, { seconds: true })} ${zone}`.trim(),
    legend: tfs.map((tf, i) => ({ mark: GLYPHS[i], text: `${timeframeText(tf)} close${i === 0 ? ', next hour' : ''}` })),
    nextClose: nextAt === null ? '' : `next close in ${env.fmt.duration(nextAt - now)}`,
    lanes,
    ariaLabel: `Session clock: ${spoken.length ? spoken.join('; ') : 'No sessions'}`,
  }
}

// ── Element ────────────────────────────────────────────────────────────────

const setText = (el, value) => {
  if (el && el.textContent !== value) el.textContent = value
}

const LANE_HTML =
  '<div class="lane"><div class="lcol"><span class="lname sm ell"></span><span class="lhours xs mut n ell"></span></div>' +
  '<div class="lt"><div class="rail"></div><div class="lf"></div><div class="tks"></div><div class="mk"></div><span class="msg xs mut ell" hidden></span></div>' +
  '<span class="lr n sm mut"></span></div>'

// English strings in one place, ready for overridable messages.
export const STRINGS = Object.freeze({ empty: 'No sessions set up' })

// Loading shapes follow each variant's layout. A Banner can't know how many
// sessions it will show, so it draws two lanes.
const LABEL_HEAD = '<div class="hd"><span class="lb title" data-k="label"></span>'
const SKELETON_LANE = `<div class="lane"><div class="lcol">${sk(80, 11)}${sk(60, 9)}</div><div class="f1">${sk(100, 4)}</div><div class="lr">${sk(70, 10)}</div></div>`
const SKELETONS = {
  S: `${LABEL_HEAD}</div><div class="rowb">${sk(45, 30)}${sk(25, 11)}</div><span class="f1"></span>${sk(100, 6)}<div class="row">${sk(15, 9)}<span class="f1"></span>${sk(15, 9)}</div>`,
  Banner: `${LABEL_HEAD}<span class="f1"></span>${sk(20, 9)}</div><div class="lanes">${SKELETON_LANE.repeat(2)}</div>`,
}

export class TsSessionClock extends TsWidget {
  static catalogKey = 'sessionClock'
  static emptyText = STRINGS.empty
  static dataShape = {
    calendar: 'object',
    sessions: { kind: 'array', of: 'string' },
    timeframes: { kind: 'array', optional: true, of: 'number' },
  }

  static styles = `
[hidden] { display: none !important; }
.trk { position: relative; height: 6px; border-radius: 99px; background: var(--ts-surface-2); overflow: hidden; flex: none; }
.fill, .lf { position: absolute; left: 0; width: 0; background: var(--ts-accent); border-radius: 99px; }
.fill { top: 0; bottom: 0; }
.ft { gap: 6px; }
.ft .n { flex: none; }
.mid { text-align: center; }
.title { white-space: nowrap; flex: none; }
.ts, .ms { display: none; }
.legend { display: flex; gap: 10px; white-space: nowrap; }
.nx { font-weight: 600; white-space: nowrap; }
.lanes { display: flex; flex-direction: column; gap: 6px; flex: 1; min-height: 0; justify-content: center; }
.lane { display: flex; align-items: center; gap: 14px; }
.lcol { width: 110px; flex: none; display: flex; flex-direction: column; gap: 1px; }
.lname { font-weight: 600; }
.lt { position: relative; flex: 1; min-width: 0; height: 26px; }
.rail, .lf { position: absolute; top: 11px; height: 4px; border-radius: 99px; }
.rail { left: 0; right: 0; background: var(--ts-surface-2); }
.tks { position: absolute; inset: 0; pointer-events: none; }
.tk { position: absolute; top: 8px; width: 1px; height: 10px; background: var(--ts-muted); }
.tk.b { top: 5px; height: 16px; background: var(--ts-ink); }
.mk { position: absolute; top: 2px; left: 0; width: 6px; height: 22px; margin-left: -3px; border-radius: 2px; box-shadow: inset 0 0 0 2px var(--ts-ink); }
.msg { position: absolute; left: 0; right: 0; top: 0; bottom: 0; display: flex; align-items: center; }
.lr { width: 90px; flex: none; text-align: right; white-space: nowrap; }
@container (max-width: 480px) { .legend { display: none; } }
@container (max-width: 400px) { .lane { gap: 10px; } .lcol { width: 84px; } .lr { width: 72px; } }
/* A phone-width S (~170px): short words so nothing wraps or truncates. */
@container (max-width: 220px) { .tf, .mf { display: none; } .ts, .ms { display: inline; } }
`

  static template(variant) {
    if (variant === 'Banner') {
      return (
        '<div class="hd"><span class="dot live"></span><span class="lb title"></span><span class="n sm clock ell"></span>' +
        '<span class="f1"></span><span class="legend xs mut"><span class="lg0"></span><span class="lg1"></span></span>' +
        '<span class="nx xs"></span></div><div class="lanes"></div>'
      )
    }
    return (
      '<div class="hd"><span class="dot live"></span><span class="lb title"><span class="tf"></span><span class="ts"></span></span><span class="f1"></span><span class="xs mut sess ell"></span></div>' +
      '<div class="rowb"><span class="big time"></span><span class="sm mut zone"></span></div>' +
      '<span class="f1"></span>' +
      '<div class="trk"><div class="fill"></div></div>' +
      '<div class="row xs mut ft"><span class="n from"></span><span class="f1"></span><span class="mid ell"><span class="mf"></span><span class="ms"></span></span><span class="f1"></span><span class="n to"></span></div>'
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
    setText(this.$('.from'), vm.from)
    setText(this.$('.mf'), vm.middle)
    setText(this.$('.ms'), vm.middleShort)
    // The full sentence stays reachable when the short form is showing.
    const mid = this.$('.mid')
    if (mid.title !== vm.middle) mid.title = vm.middle
    setText(this.$('.to'), vm.to)
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
      setText(el, item ? `${item.mark} ${item.text}` : '')
    }
    const nx = this.$('.nx')
    nx.hidden = !vm.nextClose
    setText(nx, vm.nextClose ? `▮ ${vm.nextClose}` : '')

    const rows = this._laneRows(vm.lanes)
    // Read every width before any write below, so the browser lays out once.
    const widths = rows.map((row) => row.track.clientWidth)
    vm.lanes.forEach((lane, i) => {
      const row = rows[i]
      setText(row.name, lane.name)
      setText(row.hours, lane.error ? '' : lane.hours)
      setText(row.right, lane.right)
      row.msg.hidden = !lane.error
      setText(row.msg, lane.error || '')
      row.rail.hidden = !!lane.error
      row.fill.hidden = !!lane.error
      row.fill.style.width = `${lane.progress}%`
      // The tick container is rebuilt only when the drawn set changes (a
      // candle passes, the day changes, the rail resizes); every other
      // second only the fill and marker move.
      const ticks = visibleTicks(lane, vm.now, widths[i])
      if (row.tickKey !== ticks.key) {
        row.ticks.innerHTML = ticks.items.map((t) => `<i class="tk${t.k ? ' b' : ''}" style="left:${t.l}%"></i>`).join('')
        row.tickKey = ticks.key
      }
      row.mark.hidden = lane.next === null
      if (lane.next !== null) row.mark.style.left = `${lane.next}%`
    })
  }

  /** The lane rows, rebuilt only when the list of sessions or the container they live in changes. */
  _laneRows(lanes) {
    const host = this.$('.lanes')
    const key = lanes.map((l) => l.id).join('\n')
    const cur = this._lanes
    if (cur && cur.host === host && cur.key === key) return cur.rows
    host.innerHTML = lanes.map(() => LANE_HTML).join('')
    const rows = Array.from(host.querySelectorAll('.lane')).map((el) => ({
      name: el.querySelector('.lname'),
      hours: el.querySelector('.lhours'),
      right: el.querySelector('.lr'),
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
