/**
 * <ts-today-pnl>: today's profit and loss, sizes S · Wide · M (RFC 0001 §8.5).
 *
 * `todayPnlModel` is the pure view model; the class is only the template and
 * a thin update(). The headline `net` is shown exactly as the host gave it:
 * it is never recomputed from realised, unrealised and fees, so the tile can
 * never disagree with the host's own books.
 *
 * Heading: S is a narrow tile, so it says "Today" and leaves the full
 * "Today's P&L" to the wider variants. A host's own `label` replaces the
 * heading on Wide and M, and the accessible name on every variant.
 */

import { TsWidget, sk } from './widget.js'
import { linePaths } from './chart.js'
import { toNumber, toTime } from '../core/index.js'

// English strings in one place, ready for overridable messages.
export const STRINGS = Object.freeze({ empty: 'No trades today', shortLabel: 'Today' })

// Characters the headline holds per variant before fmt.fit() switches it to
// the compact form. Sized for the 34px / 48px figures in a tile that never
// resizes, so a long value shrinks its text rather than the tile.
export const HEADLINE_CHARS = Object.freeze({ S: 10, Wide: 11, M: 14 })

// The chart's drawing box. It is stretched to the tile, so only the aspect
// of the numbers matters, not their size.
export const CHART_BOX = Object.freeze({ width: 375, height: 100 })

// Inset that keeps the stroke and end marks inside the drawing box.
const PAD = 4

const DASH = '—'

const tone = (v) => {
  const n = toNumber(v)
  return n > 0 ? 'pos' : n < 0 ? 'neg' : ''
}

const count = (v, fmt) => {
  const n = toNumber(v)
  return Number.isFinite(n) && n >= 0 ? fmt.number(n, { decimals: 0 }) : null
}

/** 'a · b' from the parts that exist. */
const joined = (parts) => parts.filter(Boolean).join(' · ')

/**
 * Readings with a usable time and value, in time order, as chart points, and
 * how many rows weren't usable. Times may be seconds, ms, ISO strings or Dates.
 */
function readings(intraday) {
  if (!Array.isArray(intraday)) return { pts: [], dropped: 0 }
  const out = []
  for (const r of intraday) {
    const t = toTime(r && r.t)
    const v = toNumber(r && r.v)
    if (Number.isFinite(t) && Number.isFinite(v)) out.push({ x: t, y: v })
  }
  // Hosts append, but a merged feed may not arrive in order, and a line
  // drawn through unsorted points doubles back on itself.
  return { pts: out.sort((a, b) => a.x - b.x), dropped: intraday.length - out.length }
}

/** The curve's value at time t, between the readings either side of it. */
function valueAt(pts, t) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    if (t <= b.x) return b.x === a.x ? b.y : a.y + ((t - a.x) / (b.x - a.x)) * (b.y - a.y)
  }
  return pts[pts.length - 1].y
}

/** The x-axis span: the session window if the host gave one, else the readings. */
function domainOf(window, pts) {
  const from = toTime(window && window.from)
  const to = toTime(window && window.to)
  if (Number.isFinite(from) && Number.isFinite(to) && to >= from) return [from, to]
  return pts.length ? [pts[0].x, pts[pts.length - 1].x] : null
}

/**
 * The middle axis label: the round time nearest the window's middle, because
 * "12:27" reads as arbitrary and "12:30" as a landmark. Prefers a 30-minute
 * boundary, falls back to 15, and to the raw middle when neither fits inside
 * the window. Boundaries are found from the formatter's own clock reading,
 * so they fall on the display zone's half hours (including zones that are
 * not whole hours from UTC) without the core needing to know the zone.
 */
function midTick([from, to], fmt) {
  const mid = (from + to) / 2
  const minuteOfDay = (t) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(fmt.time(t))
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN
  }
  for (const step of [30, 15]) {
    const ms = step * 60000
    const m = minuteOfDay(mid)
    if (!Number.isFinite(m)) break
    // Back to the boundary at or before the middle, then whichever of it and the next is nearer.
    const below = mid - ((m % step) * 60000 + (((mid % 60000) + 60000) % 60000))
    const best = [below, below + ms].filter((t) => t > from && t < to).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0]
    if (best !== undefined) return best
  }
  return mid
}

/** "low −₹640 at 09:45 · high now": the day's extremes, from the readings. */
function summaryOf(pts, fmt) {
  if (!pts.length) return ''
  const last = pts[pts.length - 1]
  let lo = pts[0]
  let hi = pts[0]
  for (const p of pts) {
    if (p.y < lo.y) lo = p
    if (p.y > hi.y) hi = p
  }
  // "now" rather than a clock time when the extreme is the latest reading,
  // because that is the more useful thing to know.
  const at = (p) => (p.y === last.y ? 'now' : `at ${fmt.time(p.x)}`)
  return joined([`low ${fmt.money(lo.y, { decimals: 0 })} ${at(lo)}`, `high ${hi.y === last.y ? '' : `${fmt.money(hi.y, { decimals: 0 })} `}${at(hi)}`])
}

function chartOf(data, pts, fmt) {
  const domain = domainOf(data.window, pts)
  const mid = domain ? midTick(domain, fmt) : NaN
  const ticks = domain ? [domain[0], mid, domain[1]].map((t) => fmt.time(t)) : ['', '', '']
  // The middle label sits at its true place on the axis, held back from the
  // edges so it never collides with the end labels.
  const span = domain ? domain[1] - domain[0] : 0
  const frac = span > 0 ? (mid - domain[0]) / span : 0.5
  const midAt = Math.round(Math.min(86, Math.max(14, ((PAD + frac * (CHART_BOX.width - 2 * PAD)) / CHART_BOX.width) * 100)) * 10) / 10
  // One reading is not a curve; the chart says so instead of drawing a line
  // that implies a trend.
  if (pts.length < 2) {
    return { empty: true, message: 'No intraday data yet', ariaLabel: 'Intraday P&L: no data yet', ticks, midAt, line: '', area: '', zeroY: 0, lastX: 0, marks: [] }
  }
  const { line, area, zeroY, x, y } = linePaths(pts, { ...CHART_BOX, pad: PAD, xDomain: domain })
  const first = pts[0]
  const last = pts[pts.length - 1]
  let low = first
  for (const p of pts) if (p.y < low.y) low = p

  const marks = []
  let dropped = 0
  for (const m of Array.isArray(data.marks) ? data.marks : []) {
    const t = toTime(m && m.t)
    if (!Number.isFinite(t)) {
      dropped++
      continue
    }
    // A mark sits on the curve, so one outside the readings has nowhere to go.
    if (t < first.x || t > last.x) continue
    const kind = m.kind === 'exit' ? 'exit' : 'entry'
    const px = x(t)
    if (px < 0 || px > CHART_BOX.width) continue // outside the session window
    const name = m.label ? String(m.label) : kind === 'exit' ? 'Exit' : 'Entry'
    marks.push({
      kind,
      left: Math.round((px / CHART_BOX.width) * 1000) / 10,
      top: Math.round((y(valueAt(pts, t)) / CHART_BOX.height) * 1000) / 10,
      title: `${name} · ${fmt.time(t)}`,
    })
  }

  return {
    empty: false,
    message: '',
    ariaLabel: `Intraday P&L: low ${fmt.money(low.y, { decimals: 0 })}, now ${fmt.money(last.y)}`,
    ticks,
    midAt,
    line,
    area,
    zeroY,
    lastX: Math.round(x(last.x) * 10) / 10,
    marks,
    droppedMarks: dropped,
  }
}

/**
 * Everything the tile shows, as strings. Never throws on partial data: a
 * missing or garbled field shows as a dash or is left out.
 */
export function todayPnlModel(data, variant, ctx) {
  const fmt = ctx.fmt
  const d = data || {}
  const net = toNumber(d.net)
  const asOf = toTime(d.asOf)
  const time = Number.isFinite(asOf) ? fmt.time(asOf) : ''
  const closed = count(d.closedCount, fmt)
  const open = count(d.openCount, fmt)
  const counts = joined([closed !== null && `${closed} closed`, open !== null && `${open} open`])

  // Fees reduce P&L, so they read as a deduction whichever way the host
  // signs them.
  const fees = toNumber(d.fees)
  const feesText = Number.isFinite(fees) ? fmt.money(-Math.abs(fees)) : DASH
  const feesPlain = Number.isFinite(fees) ? fmt.money(Math.abs(fees), { sign: 'negative' }) : null

  const vm = {
    ariaLabel: Number.isFinite(net) ? `${ctx.label}, ${fmt.money(net)}` : ctx.label,
    live: d.live === true,
    label: variant === 'S' ? 'Today' : ctx.label,
    time,
    net: fmt.fit(d.net, HEADLINE_CHARS[variant] || HEADLINE_CHARS.Wide),
    netTone: tone(d.net),
    realized: fmt.money(d.realized),
    realizedTone: tone(d.realized),
    unrealized: fmt.money(d.unrealized),
    unrealizedTone: tone(d.unrealized),
    fees: feesText,
    // Rows the tile couldn't read. Only the M variant draws the series, so
    // only it can say; the others have nothing to drop.
    dropped: 0,
  }

  if (variant === 'S') {
    vm.footer = joined([counts, feesPlain && `fees ${feesPlain}`])
  } else if (variant === 'Wide') {
    vm.note = joined(['net of fees', time])
  } else if (variant === 'M') {
    const { pts, dropped } = readings(d.intraday)
    vm.counts = counts
    vm.summary = summaryOf(pts, fmt)
    vm.chart = chartOf(d, pts, fmt)
    vm.dropped = dropped + (vm.chart.droppedMarks || 0)
  }
  return vm
}

const dot = '<span class="dot live" data-k="dot" hidden></span>'

// Variant markup is static; update() fills it. Ids are scoped to the shadow
// root, so the clip-path ids can be fixed.
const TEMPLATES = {
  S: `
<div class="hd">${dot}<span class="lb ell" data-k="label"></span><span class="f1"></span><span class="sm mut n" data-k="time"></span></div>
<span class="big nv" data-k="net"></span>
<span class="f1"></span>
<span class="sm mut ell" data-k="footer"></span>`,
  Wide: `
<div class="cols">
  <div class="col lhs">
    <div class="hd">${dot}<span class="lb ell" data-k="label"></span></div>
    <span class="xbig nv" data-k="net"></span>
    <span class="sm mut" data-k="note"></span>
  </div>
  <div class="col rhs">
    <div class="rowb"><span class="lb f1">Realised</span><span class="n" data-k="realized"></span></div>
    <div class="rowb"><span class="lb f1">Unrealised</span><span class="n" data-k="unrealized"></span></div>
    <div class="rowb"><span class="lb f1">Fees</span><span class="n mut" data-k="fees"></span></div>
  </div>
</div>`,
  M: `
<div class="hd">${dot}<span class="lb ell" data-k="label"></span><span class="f1"></span><span class="sm mut" data-k="counts"></span></div>
<div class="rowb base"><span class="xbig nv" data-k="net"></span><span class="sm mut" data-k="summary"></span></div>
<div class="chart" part="chart">
  <svg viewBox="0 0 ${CHART_BOX.width} ${CHART_BOX.height}" preserveAspectRatio="none" role="img" data-k="svg">
    <defs>
      <clipPath id="up"><rect x="0" y="0" width="${CHART_BOX.width}" data-k="clip-up"></rect></clipPath>
      <clipPath id="dn"><rect x="0" width="${CHART_BOX.width}" data-k="clip-dn"></rect></clipPath>
    </defs>
    <line class="lz" x1="0" x2="${CHART_BOX.width}" data-k="zero"></line>
    <line class="lz" y1="0" y2="${CHART_BOX.height}" data-k="now"></line>
    <path class="ap" clip-path="url(#up)" data-k="area-up"></path>
    <path class="an" clip-path="url(#dn)" data-k="area-dn"></path>
    <path class="lp" clip-path="url(#up)" data-k="line-up"></path>
    <path class="ln" clip-path="url(#dn)" data-k="line-dn"></path>
  </svg>
  <div class="marks" data-k="marks"></div>
  <div class="nodata sm" data-k="nodata" hidden></div>
</div>
<div class="axis sm mut n"><span data-k="t0"></span><span class="mid" data-k="t1"></span><span data-k="t2"></span></div>
<div class="g3 sep trio">
  <div class="col"><span class="lb">Realised</span><span class="n md" data-k="realized"></span></div>
  <div class="col"><span class="lb">Unrealised</span><span class="n md" data-k="unrealized"></span></div>
  <div class="col"><span class="lb">Fees</span><span class="n md mut" data-k="fees"></span></div>
</div>`,
}

// Loading shapes follow each variant's layout block for block, so the figures
// land where the blocks were. S says "Today" as its content does.
const SKELETONS = {
  S: `<div class="hd"><span class="lb ell">${STRINGS.shortLabel}</span></div>${sk(65, 30)}<span class="f1"></span>${sk(80, 11)}`,
  Wide: `<div class="cols">
  <div class="col lhs"><div class="hd"><span class="lb ell" data-k="label"></span></div>${sk(75, 44)}${sk(60, 11)}</div>
  <div class="col rhs">${`<div class="rowb">${sk(40, 9)}<span class="f1"></span>${sk(35, 13)}</div>`.repeat(3)}</div>
</div>`,
  M: `<div class="hd"><span class="lb ell" data-k="label"></span></div>
<div class="rowb base">${sk(40, 44)}${sk(30, 11)}</div>
<span class="sk grow"></span>
<div class="axis">${sk('x', 9)}${sk('x', 9)}${sk('x', 9)}</div>
<div class="g3 sep trio">${`<div class="col">${sk(60, 9)}${sk(75, 16)}</div>`.repeat(3)}</div>`,
}

export class TsTodayPnl extends TsWidget {
  static catalogKey = 'todayPnl'
  static emptyText = STRINGS.empty

  static styles = `
[hidden] { display: none; }
/* Clip rather than overflow: a headline too wide for its slot must never
   run into the column beside it. fit() and the tile's scaled type make
   that rare; this makes it harmless. */
.nv { white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: clip; }
.cols { flex: 1; display: flex; gap: 24px; align-items: stretch; min-height: 0; }
.lhs { flex: 1.1; min-width: 0; justify-content: space-between; }
.rhs { flex: 1; min-width: 0; justify-content: center; gap: 10px; }
/* Narrow tile (a 2-column phone): the three figures stack label over value
   and shrink to their content, so the headline gets the rest of the width.
   The note under the headline stays; it sits below the number, not beside it. */
@container (max-width: 420px) {
  .cols { gap: 12px; }
  .lhs { flex: 1 1 0; }
  .rhs { flex: 0 0 auto; gap: 6px; }
  .rhs .rowb { flex-direction: column; align-items: flex-end; gap: 0; }
}
.base { gap: 2px 20px; flex-wrap: wrap; }
.chart { position: relative; flex: 1; min-height: 0; }
.chart svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.marks { position: absolute; inset: 0; pointer-events: none; }
.mk {
  position: absolute; box-sizing: content-box; width: 8px; height: 8px; margin: -4px 0 0 -4px;
  border-radius: 50%; border: 2px solid var(--ts-surface); pointer-events: auto;
}
.mk.entry { background: var(--ts-accent); }
.mk.exit { background: var(--ts-ink); }
.nodata { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--ts-muted); }
.nodata[hidden] { display: none; }
.axis { position: relative; display: flex; justify-content: space-between; min-height: 1.4em; }
.axis .mid { position: absolute; top: 0; transform: translateX(-50%); }
.trio { padding-top: 10px; }
`

  static template(variant) {
    return TEMPLATES[variant] || TEMPLATES.Wide
  }

  static skeleton(variant) {
    return SKELETONS[variant] || SKELETONS.Wide
  }

  static viewModel(data, variant, ctx) {
    return todayPnlModel(data, variant, ctx)
  }

  update(vm, variant) {
    const text = (k, s) => {
      const el = this.$(`[data-k="${k}"]`)
      if (el && el.textContent !== s) el.textContent = s
      return el
    }
    // Only the sign colour changes between renders; the size class stays.
    const toned = (k, base, s, t) => {
      const el = text(k, s)
      if (el) el.className = t ? `${base} ${t}` : base
    }
    this.$('[data-k="dot"]').toggleAttribute('hidden', !vm.live)
    text('label', vm.label)

    if (variant === 'S') {
      text('time', vm.time)
      toned('net', 'big nv', vm.net, vm.netTone)
      text('footer', vm.footer)
      return
    }

    toned('net', 'xbig nv', vm.net, vm.netTone)
    toned('realized', variant === 'M' ? 'n md' : 'n', vm.realized, vm.realizedTone)
    toned('unrealized', variant === 'M' ? 'n md' : 'n', vm.unrealized, vm.unrealizedTone)
    text('fees', vm.fees)

    if (variant === 'Wide') {
      text('note', vm.note)
      return
    }

    text('counts', vm.counts)
    text('summary', vm.summary)
    this._updateChart(vm.chart)
    text('t0', vm.chart.ticks[0])
    text('t1', vm.chart.ticks[1]).style.left = `${vm.chart.midAt}%`
    text('t2', vm.chart.ticks[2])
  }

  _updateChart(c) {
    const svg = this.$('[data-k="svg"]')
    svg.setAttribute('aria-label', c.ariaLabel)
    svg.toggleAttribute('hidden', c.empty)
    const nodata = this.$('[data-k="nodata"]')
    nodata.textContent = c.message
    nodata.toggleAttribute('hidden', !c.empty)

    const set = (k, attrs) => {
      const el = this.$(`[data-k="${k}"]`)
      for (const name in attrs) el.setAttribute(name, attrs[name])
    }
    // The zero line splits the two colours: profit is drawn above it and
    // loss below, from the same path clipped twice.
    set('clip-up', { height: c.zeroY })
    set('clip-dn', { y: c.zeroY, height: CHART_BOX.height - c.zeroY })
    set('zero', { y1: c.zeroY, y2: c.zeroY })
    set('now', { x1: c.lastX, x2: c.lastX })
    set('area-up', { d: c.area })
    set('area-dn', { d: c.area })
    set('line-up', { d: c.line })
    set('line-dn', { d: c.line })
    this.$('[data-k="now"]').toggleAttribute('hidden', c.empty)
    this.$('[data-k="zero"]').toggleAttribute('hidden', c.empty)

    // Marks are the one list whose length changes, so this container alone is
    // rebuilt, and only when they changed. The key lives on the container so
    // a rebuilt template (variant change) starts clean.
    const box = this.$('[data-k="marks"]')
    const key = JSON.stringify(c.marks)
    if (box._key === key) return
    box._key = key
    box.replaceChildren(
      ...c.marks.map((m) => {
        const el = document.createElement('span')
        el.className = `mk ${m.kind}`
        el.style.left = `${m.left}%`
        el.style.top = `${m.top}%`
        el.title = m.title
        el.setAttribute('role', 'img')
        el.setAttribute('aria-label', m.title)
        return el
      }),
    )
  }
}
