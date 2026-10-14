/**
 * <ts-chart>: line and area trends for up to four series, sizes Wide · M · L ·
 * XL (RFC 0002 §3.3). The class lives here, not in chart.js, which stays pure
 * geometry shared with the finance widgets.
 *
 * `chartModel` is the pure view model: it reads both data forms into series,
 * draws them on one shared domain, and returns strings (paths, labels, the
 * accessible name). The class is a template per size and an update() that
 * writes only `d` attributes and text, so a live feed moves the lines in
 * place. The series slots are fixed at four in every template and hidden when
 * unused, which is what lets new data never need new markup.
 */

import { TsWidget, sk, describeElement, syncedParts, header } from './widget.js'
import { areaPaths, scale, seriesDomain } from './chart.js'
import { DEV, warnOnce } from './dev.js'
import { EN, toNumber, toTime } from '../core/index.js'

export const MAX_SERIES = 4

// The drawing box. It is stretched to the tile, so only its proportions
// matter; the y axis labels are placed in percent of the plot's height, and
// PAD / BOX.height is that percentage's twin in the CSS (`inset-block: 3%`).
export const BOX = Object.freeze({ width: 400, height: 100 })
const PAD = 3
const TICK_STEPS = 3

const DASH = '—'
const MINUS = '−'
const DAY_MS = 86400000

const round = (v) => Math.round(v * 10) / 10
const isObj = (v) => v !== null && typeof v === 'object'
const str = (v) => (typeof v === 'string' ? v : '')

// ── Reading the data (pure) ───────────────────────────────────────────────

// `y` as the rows form allows it: a key, keys, or { key, name, kind } objects.
function yColumns(y) {
  const list = Array.isArray(y) ? y : y === undefined || y === null ? [] : [y]
  const out = []
  for (const item of list) {
    if (typeof item === 'string' && item) out.push({ key: item, name: item, kind: 'line' })
    else if (isObj(item) && typeof item.key === 'string' && item.key) {
      out.push({ key: item.key, name: str(item.name) || item.key, kind: item.kind === 'area' ? 'area' : 'line' })
    }
  }
  return out
}

const byX = (a, b) => a.x - b.x

/**
 * Both forms as `[{ name, kind, points: [{ x, y }] }]` with readable, x-sorted
 * points, and how many rows or points couldn't be read. Sorted because a line
 * drawn through points out of order doubles back on itself.
 */
function readSeries(d, readX, t) {
  const out = []
  let dropped = 0
  if (Array.isArray(d.series)) {
    d.series.forEach((s, i) => {
      const item = isObj(s) ? s : {}
      const points = []
      if (Array.isArray(item.points)) {
        for (const p of item.points) {
          const x = isObj(p) ? readX(p.x) : NaN
          const y = isObj(p) ? toNumber(p.y) : NaN
          if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y })
          else dropped++
        }
      }
      out.push({ name: str(item.name) || t('chart.series', { index: i + 1 }), kind: item.kind === 'area' ? 'area' : 'line', points: points.sort(byX) })
    })
  } else if (Array.isArray(d.rows)) {
    const cols = yColumns(d.y)
    const xKey = str(d.x)
    const lists = cols.map(() => [])
    for (const row of d.rows) {
      const x = isObj(row) && xKey ? readX(row[xKey]) : NaN
      if (!Number.isFinite(x)) {
        dropped++
        continue
      }
      cols.forEach((col, i) => {
        const y = toNumber(row[col.key])
        if (Number.isFinite(y)) lists[i].push({ x, y })
        else dropped++
      })
    }
    cols.forEach((col, i) => out.push({ name: col.name, kind: col.kind, points: lists[i].sort(byX) }))
  }
  return { all: out, dropped }
}

// ── Axes (pure) ───────────────────────────────────────────────────────────

// Intl constructors are slow next to format(), and a live chart relabels its
// axis on every tick, so each locale and zone builds its formatter once.
const dayFormats = new Map()
function dayFormat(fmt, withYear) {
  const key = `${fmt.locale}|${fmt.timeZone}|${withYear}`
  let f = dayFormats.get(key)
  if (!f) {
    const opts = withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' }
    if (fmt.timeZone) opts.timeZone = fmt.timeZone
    dayFormats.set(key, (f = new Intl.DateTimeFormat(fmt.locale, opts)))
  }
  return f
}

// Spans under a day read as clock times, so "09:30 · 12:00 · 14:30" shows a
// session; longer ones as days, with the year once a span reaches a year.
function timeLabeller(fmt, x0, x1) {
  const span = x1 - x0
  if (span < DAY_MS) return (t) => fmt.time(t)
  const f = dayFormat(fmt, span >= 365 * DAY_MS)
  return (t) => f.format(t)
}

/**
 * Round bounds that cover [lo, hi] in exactly `steps` equal intervals, so the
 * gridlines are evenly spaced and every size shows the same count of labels.
 * The step is the smallest of 1, 2, 2.5, 3, 4 and 5 × a power of ten that fits.
 */
export function niceDomain(lo, hi, steps = TICK_STEPS) {
  const span = hi - lo || Math.abs(hi) || 1
  const raw = span / steps
  const clean = (v) => Number(v.toPrecision(12))
  for (let e = Math.floor(Math.log10(raw)); e < Math.floor(Math.log10(raw)) + 6; e++) {
    for (const m of [1, 2, 2.5, 3, 4, 5]) {
      const step = clean(m * 10 ** e)
      if (step < raw) continue
      const start = clean(Math.floor(lo / step + 1e-9) * step)
      if (start + steps * step >= hi - step * 1e-9) {
        const ticks = []
        for (let i = 0; i <= steps; i++) ticks.push(clean(start + i * step))
        return { lo: ticks[0], hi: ticks[steps], step, ticks }
      }
    }
  }
  // Unreachable for finite input; a plain padded range is the safe answer.
  return { lo, hi, step: raw, ticks: [lo, lo + raw, lo + 2 * raw, hi] }
}

// How many decimals a step needs so neighbouring labels differ (0.25 → 2).
function places(n) {
  const s = String(Number(n.toPrecision(12)))
  if (s.includes('e')) return 4
  const dot = s.indexOf('.')
  return dot < 0 ? 0 : Math.min(4, s.length - dot - 1)
}

/**
 * Everything the tile shows, as strings. Never throws on partial data: what
 * can't be read is dropped and counted, and a series with no points shows a
 * dash.
 */
export function chartModel(data, variant, ctx) {
  const { fmt, t } = ctx
  const d = isObj(data) && !Array.isArray(data) ? data : {}
  const format = ['money', 'percent', 'duration'].includes(d.format) ? d.format : 'number'
  const decimals = Number.isInteger(d.decimals) && d.decimals >= 0 && d.decimals <= 20 ? d.decimals : undefined
  const unit = str(d.unit)
  const timeAxis = d.xType !== 'number'

  const { all, dropped } = readSeries(d, timeAxis ? toTime : toNumber, t)
  const series = []
  for (let i = 0; i < all.length && i < MAX_SERIES; i++) series.push(all[i])

  // The last value, as the headline of each series: the formatter's own
  // decimals unless the host sets some, as in <ts-metric>.
  const show = (n) => {
    const o = { sign: 'negative', decimals }
    switch (format) {
      case 'money':
        return fmt.money(n, o)
      case 'percent':
        return fmt.percent(n, o)
      case 'duration': {
        const s = fmt.duration(Math.abs(n))
        return Number.isFinite(n) && n < 0 ? `${MINUS}${s}` : s
      }
      default:
        return unit ? fmt.unit(n, unit, { decimals }) : fmt.number(n, o)
    }
  }
  // An axis label: compact, with only the decimals the step needs.
  const tick = (n, step) => {
    const dp = (s) => (s < 1 ? places(s) : undefined)
    switch (format) {
      case 'money':
        return fmt.money(n, { sign: 'negative', compact: true, decimals: dp(step) })
      case 'percent':
        return fmt.percent(n, { sign: 'negative', decimals: Math.min(3, places(step * 100)) })
      case 'duration': {
        const s = fmt.duration(Math.abs(n))
        return n < 0 ? `${MINUS}${s}` : s
      }
      default:
        return unit
          ? fmt.unit(n, unit, { compact: true, decimals: dp(step) })
          : fmt.number(n, { sign: 'negative', compact: true, decimals: dp(step) })
    }
  }

  const hasArea = series.some((s) => s.kind === 'area')
  const dom = seriesDomain(series.map((s) => s.points), { includeZero: hasArea })
  const [x0, x1] = dom.x
  const hasPoints = series.some((s) => s.points.length > 0)
  const ticked = variant === 'M' || variant === 'L' || variant === 'XL'

  let [y0, y1] = dom.y
  let ticks = []
  let step = 0
  if (hasPoints && ticked) {
    const nice = niceDomain(y0, y1)
    y0 = nice.lo
    y1 = nice.hi
    step = nice.step
    ticks = nice.ticks
  } else if (hasPoints) {
    // Headroom above the line so the end dot and its stroke aren't clipped;
    // an area is anchored on zero, so only lines get room below as well.
    const span = y1 - y0 || 1
    y1 += span * 0.12
    if (!hasArea) y0 -= span * 0.12
  }

  const x = scale(x0, x1, PAD, BOX.width - PAD)
  const y = scale(y0, y1, BOX.height - PAD, PAD)
  const box = { width: BOX.width, height: BOX.height, pad: PAD, xDomain: [x0, x1], yDomain: [y0, y1] }
  const hasZero = hasPoints && y0 <= 0 && y1 >= 0
  const zeroY = round(Math.min(BOX.height - PAD, Math.max(PAD, y(0))))

  const outSeries = series.map((s) => {
    const pts = s.points
    const n = pts.length
    if (!n) return { name: s.name, kind: s.kind, line: '', area: '', dot: '', last: DASH, empty: true }
    const lastPt = pts[n - 1]
    const last = show(lastPt.y)
    // A lone point among longer series has no direction to draw, so it is a
    // dot where it falls. Alone on the whole chart it is a level line across,
    // as in the other widgets, so the tile isn't empty.
    if (n === 1 && x1 > x0) {
      const px = round(x(lastPt.x))
      return { name: s.name, kind: s.kind, line: '', area: '', dot: `M${px} ${round(y(lastPt.y))}h0`, last, empty: false }
    }
    const { line, area } = areaPaths(pts, box)
    const dotX = n === 1 ? round(BOX.width - PAD) : round(x(lastPt.x))
    return { name: s.name, kind: s.kind, line, area: s.kind === 'area' ? area : '', dot: `M${dotX} ${round(y(lastPt.y))}h0`, last, empty: false }
  })

  // The axis: start, middle and end of the x domain.
  const axis = { start: '', middle: '', end: '' }
  if (hasPoints) {
    const label = timeAxis ? timeLabeller(fmt, x0, x1) : (v) => fmt.number(v, { sign: 'negative' })
    axis.start = label(x0)
    axis.middle = x1 > x0 ? label(x0 + (x1 - x0) / 2) : ''
    axis.end = x1 > x0 ? label(x1) : ''
  }

  // Gridlines at every label but zero, which has the heavier line of its own.
  let grid = ''
  const labels = []
  if (ticks.length) {
    for (let i = TICK_STEPS; i >= 0; i--) {
      labels.push(tick(ticks[i], step))
      if (ticks[i] === 0) continue
      const gy = round(PAD + ((TICK_STEPS - i) * (BOX.height - 2 * PAD)) / TICK_STEPS)
      grid += `${grid ? ' ' : ''}M0 ${gy}H${BOX.width}`
    }
  }

  // The summary a listener gets instead of the picture (docs/ACCESSIBILITY.md).
  const summary = outSeries.length
    ? outSeries.map((s) => (s.empty ? t('chart.noData', { name: s.name }) : t('chart.last', { name: s.name, value: s.last }))).join('; ')
    : t('chart.noData', { name: ctx.label })

  const vm = {
    ariaLabel: summary,
    label: ctx.label,
    live: d.live === true,
    time: '',
    synced: syncedParts(t),
    series: outSeries,
    legend: outSeries.map((s, i) => ({ name: s.name, index: i + 1 })),
    axis,
    zeroY,
    zero: hasZero,
    zeroPath: hasZero ? `M0 ${zeroY}H${BOX.width}` : '',
    grid,
    ticks: labels,
    dropped,
    extra: Math.max(0, all.length - MAX_SERIES),
  }
  const asOf = toTime(d.asOf)
  if (Number.isFinite(asOf)) vm.time = fmt.time(asOf)
  return vm
}

// ── Markup ────────────────────────────────────────────────────────────────

const SLOTS = [1, 2, 3, 4]

// Wide names the first series up in the header, where the other sizes have a legend.
const head = (wide) =>
  header({
    dot: true,
    meta: true,
    extra: wide ? '<span class="sname sm" data-k="first" hidden><span class="sw c-1" data-k="sw1" aria-hidden="true"></span><span class="ell" data-k="n1"></span></span>' : '',
  })

const marks = (cls, prefix) => SLOTS.map((i) => `<path class="${cls} c-${i}" data-k="${prefix}${i}"></path>`).join('')

const plot = (ticked) => `<div class="prow"><div class="plot" part="chart"><svg viewBox="0 0 ${BOX.width} ${BOX.height}" preserveAspectRatio="none" role="img" data-k="svg">${
  ticked ? '<path class="gl" data-k="grid"></path>' : ''
}<path class="zl" data-k="zero"></path>${marks('sa', 'a')}${marks('sl', 'l')}${marks('sd', 'd')}</svg></div>${
  ticked ? `<div class="yax n" aria-hidden="true"><div class="yin">${[0, 1, 2, 3].map((i) => `<span data-k="y${i}"></span>`).join('')}</div></div>` : ''
}</div>`

const xax = (gutter) =>
  `<div class="xax n${gutter ? ' gut' : ''}" aria-hidden="true"><span data-k="x0"></span><span data-k="x1"></span><span data-k="x2"></span></div>`

const chart = (ticked) => `<div class="chartcol">${plot(ticked)}${xax(ticked)}</div>`

const legendItem = (i) =>
  `<span class="li" data-k="lg${i}" hidden><span class="sw c-${i}" data-k="sw${i}" aria-hidden="true"></span><span class="ell" data-k="n${i}"></span><span class="n sm" data-k="v${i}"></span></span>`

const railItem = (i) =>
  `<div class="ri" data-k="lg${i}" hidden><span class="li"><span class="sw c-${i}" data-k="sw${i}" aria-hidden="true"></span><span class="ell" data-k="n${i}"></span></span><span class="n md" data-k="v${i}"></span></div>`

// Variant markup is static; update() fills it.
const TEMPLATES = {
  Wide: `${head(true)}${chart(false)}`,
  M: `${head(false)}<div class="legend">${SLOTS.map(legendItem).join('')}</div>${chart(true)}`,
  L: `${head(false)}<div class="crow">${chart(true)}<div class="rail">${SLOTS.map(railItem).join('')}</div></div>`,
}
TEMPLATES.XL = TEMPLATES.L

// Loading shapes follow each size's layout block for block.
const skAxis = '<div class="xax"><span class="sk wx h9"></span><span></span><span class="sk wx h9"></span></div>'
const skHead = header()
const skRail = SLOTS.map(() => `<div class="ri">${sk(60, 10)}${sk(40, 16)}</div>`).join('')
const SKELETONS = {
  Wide: `${skHead}<div class="chartcol"><span class="sk grow"></span>${skAxis}</div>`,
  M: `${skHead}<div class="legend">${sk(30, 10)}${sk(25, 10)}</div><div class="chartcol"><span class="sk grow"></span>${skAxis}</div>`,
  L: `${skHead}<div class="crow"><div class="chartcol"><span class="sk grow"></span>${skAxis}</div><div class="rail">${skRail}</div></div>`,
}
SKELETONS.XL = SKELETONS.L

export class TsChart extends TsWidget {
  static catalogKey = 'chart'
  static emptyText = EN['widget.chart.empty']
  // Both forms are optional here because either alone is enough; naming the
  // series items' points is what lets a wrong-shape one be explained.
  static dataShape = {
    series: { kind: 'array', optional: true, of: { name: { kind: 'string', optional: true }, points: 'array' } },
    rows: { kind: 'array', optional: true },
    x: { kind: 'string', optional: true },
    xType: { kind: 'string', optional: true },
    format: { kind: 'string', optional: true },
    decimals: { kind: 'number', optional: true },
    unit: { kind: 'string', optional: true },
    goodWhen: { kind: 'string', optional: true },
    asOf: { kind: 'time', optional: true },
    live: { kind: 'boolean', optional: true },
  }

  static styles = `
[hidden] { display: none !important; }
/* Time runs left to right in every locale, so the plot and its axes never mirror. */
.chartcol { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; gap: 6px; direction: ltr; }
.prow { flex: 1; min-height: 0; display: flex; gap: 8px; }
.plot { position: relative; flex: 1; min-width: 0; min-height: 0; }
.plot svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; direction: ltr; }
.yax { position: relative; width: 34px; flex: none; font-size: 10px; color: var(--ts-muted); }
.yin { position: absolute; inset-inline: 0; inset-block: 3%; display: flex; flex-direction: column; justify-content: space-between; }
.yin span { height: 0; display: flex; align-items: center; justify-content: flex-end; line-height: 1; white-space: nowrap; }
.xax { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; font-size: 11px; color: var(--ts-muted); min-height: 14px; }
.xax > :last-child { justify-self: end; }
.xax > * { unicode-bidi: plaintext; }
.xax.gut { padding-inline-end: 42px; }
.c-1 { --c: var(--ts-series-1); }
.c-2 { --c: var(--ts-series-2); }
.c-3 { --c: var(--ts-series-3); }
.c-4 { --c: var(--ts-series-4); }
.sl { fill: none; stroke: var(--c); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
.sa { fill: color-mix(in srgb, var(--c) var(--ts-fill, 12%), transparent); stroke: none; }
.sd { fill: none; stroke: var(--c); stroke-width: 7; stroke-linecap: round; vector-effect: non-scaling-stroke; }
.gl { fill: none; stroke: var(--ts-line); stroke-dasharray: 2 4; vector-effect: non-scaling-stroke; }
.zl { fill: none; stroke: var(--ts-axis); stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
.sw { width: 12px; height: 3px; border-radius: 2px; flex: none; background: var(--c); }
.sw.area { width: 10px; height: 10px; border-radius: 2px; background: color-mix(in srgb, var(--c) 30%, transparent); box-shadow: inset 0 2px 0 var(--c); }
.sname { display: inline-flex; align-items: center; gap: 6px; min-width: 0; color: var(--ts-muted); }
.legend { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 11px; }
.li { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.legend .n { color: var(--ts-muted); }
.crow { flex: 1; min-height: 0; display: flex; gap: 20px; }
.rail { width: 190px; flex: none; display: flex; flex-direction: column; justify-content: center; gap: 14px; border-inline-start: 1px solid var(--ts-line); padding-inline-start: 20px; }
.ri { display: flex; flex-direction: column; gap: 3px; min-width: 0; font-size: 11px; }
@container (max-width: 460px) {
  .crow { flex-direction: column; gap: 10px; }
  .rail { width: auto; flex-direction: row; flex-wrap: wrap; justify-content: flex-start; gap: 8px 16px; border-inline-start: 0; padding-inline-start: 0; }
}
/* Colours are not the host's to theme here, and backgrounds are dropped, so series differ by colour AND dash and the
   swatches become coloured blocks again. Two system colours and a dash tell four series apart. */
@media (forced-colors: active) {
  .sl, .sd { stroke: CanvasText; }
  .sl.c-2, .sd.c-2, .sl.c-4, .sd.c-4 { stroke: Highlight; }
  .sl.c-3, .sl.c-4 { stroke-dasharray: 6 3; }
  .gl, .zl { stroke: CanvasText; }
  .sw { background: CanvasText; }
  .sw.c-2, .sw.c-4 { background: Highlight; }
}
`

  static template(variant) {
    return TEMPLATES[variant] || TEMPLATES.M
  }

  static skeleton(variant) {
    return SKELETONS[variant] || SKELETONS.M
  }

  static chartModel(data, variant, ctx) {
    return chartModel(data, variant, ctx)
  }

  // The result is spoken once, as docs/ACCESSIBILITY.md asks of a chart: the
  // region is named by its label alone and the svg's role=img carries the
  // summary. Folding the summary into the region name too made a screen reader
  // read it twice.
  static viewModel(data, variant, ctx) {
    const vm = chartModel(data, variant, ctx)
    return { ...vm, chartLabel: vm.ariaLabel, ariaLabel: ctx.label }
  }

  update(vm, variant) {
    // Each write is skipped when it would change nothing, so a tick that moves
    // the last point touches the paths and figures it moved, and nothing else.
    const text = (k, s) => {
      const el = this.$(`[data-k="${k}"]`)
      if (el && el.textContent !== s) el.textContent = s
    }
    const attr = (k, name, v) => {
      const el = this.$(`[data-k="${k}"]`)
      if (el && el.getAttribute(name) !== v) el.setAttribute(name, v)
    }
    const hide = (k, on) => {
      const el = this.$(`[data-k="${k}"]`)
      if (el) el.toggleAttribute('hidden', on)
    }
    if (DEV && vm.extra > 0) warnOnce(`series-cap:${this._uid}`, `${describeElement(this)} draws at most ${MAX_SERIES} series; ${MAX_SERIES + vm.extra} were given.`)

    hide('dot', !vm.live)
    text('label', vm.label)
    hide('meta', !vm.time)
    text('pre', vm.synced.pre)
    text('time', vm.time)
    text('post', vm.synced.post)
    attr('svg', 'aria-label', vm.chartLabel === undefined ? vm.ariaLabel : vm.chartLabel)

    for (const i of SLOTS) {
      const s = vm.series[i - 1]
      attr(`a${i}`, 'd', s ? s.area : '')
      attr(`l${i}`, 'd', s ? s.line : '')
      attr(`d${i}`, 'd', s ? s.dot : '')
      // Wide's header holds series 1 alone; the others hold every slot.
      hide(`lg${i}`, !s)
      if (variant === 'Wide' && i === 1) hide('first', !s)
      if (!s) continue
      attr(`sw${i}`, 'class', `sw c-${i}${s.kind === 'area' ? ' area' : ''}`)
      text(`n${i}`, s.name)
      text(`v${i}`, s.last)
    }
    attr('zero', 'd', vm.zeroPath)
    attr('grid', 'd', vm.grid)
    for (let i = 0; i < 4; i++) text(`y${i}`, vm.ticks[i] || '')
    text('x0', vm.axis.start)
    text('x1', vm.axis.middle)
    text('x2', vm.axis.end)
  }
}
