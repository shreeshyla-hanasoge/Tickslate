/**
 * <ts-chart>: line, area and bar series, up to six, sizes Wide · M · L · XL
 * (RFC 0002 §3.3, RFC 0003 §15). The class lives here, not in chart.js, which stays pure
 * geometry shared with the finance widgets.
 *
 * `chartModel` is the pure view model: it reads both data forms into series,
 * draws them on one shared domain, and returns strings (paths, labels, the
 * accessible name). The class is a template per size and an update() that
 * writes only `d` attributes and text, so a live feed moves the lines in
 * place. The series slots are fixed at six in every template and hidden when
 * unused, which is what lets new data never need new markup.
 */

import { TsWidget, sk, describeElement, syncedParts, header, escapeHtml } from './widget.js'
import { areaPaths, bandGeometry, barPaths, scale, seriesDomain } from './chart.js'
import { DEV, warnOnce } from './dev.js'
import { EN, toNumber, toTime } from '../core/index.js'

export const MAX_SERIES = 6

// The drawing box. It is stretched to the tile, so only its proportions
// matter; the y axis labels are placed in percent of the plot's height, and
// PAD / BOX.height is that percentage's twin in the CSS (`inset-block: 3%`).
export const BOX = Object.freeze({ width: 400, height: 100 })
const PAD = 3
const TICK_STEPS = 3

const DASH = '—'
const MINUS = '−'
const DAY_MS = 86400000
const ACTION_SELECT = 'select'
const BAND_PADDING = 0.2
// Fewest pixels a category label gets before neighbours are skipped, so a crowded axis shows every nth.
const CAT_MIN_PX = 56

/**
 * Where an arrow key moves the focused point (index `from` of `count`), or -1
 * when the key is not one of ours. Left and right swap in a right-to-left page,
 * because the points are laid out from the inline start.
 */
export function stepPoint(from, count, key, rtl) {
  if (from < 0 || count < 1) return -1
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  const step = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : key === 'ArrowRight' ? (rtl ? -1 : 1) : key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0
  return step ? Math.min(count - 1, Math.max(0, from + step)) : -1
}

const round = (v) => Math.round(v * 10) / 10
const isObj = (v) => v !== null && typeof v === 'object'
const str = (v) => (typeof v === 'string' ? v : '')

// ── Reading the data (pure) ───────────────────────────────────────────────

const kindOf = (k) => (k === 'area' || k === 'bar' ? k : 'line')

// A category is read as text: strings as given, numbers by their digits; null, empty and anything else has none.
function catLabel(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  return typeof v === 'string' && v.trim() ? v : ''
}

// `y` as the rows form allows it: a key, keys, or { key, name, kind } objects.
function yColumns(y) {
  const list = Array.isArray(y) ? y : y === undefined || y === null ? [] : [y]
  const out = []
  for (const item of list) {
    if (typeof item === 'string' && item) out.push({ key: item, name: item, kind: 'line' })
    else if (isObj(item) && typeof item.key === 'string' && item.key) {
      out.push({
        key: item.key,
        id: item.id != null ? String(item.id) : undefined,
        name: str(item.name) || item.key,
        kind: kindOf(item.kind),
      })
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
function readSeries(d, readX, t, cats) {
  const out = []
  let dropped = 0
  // On a category axis x is a band index, handed out in order of first appearance across every series.
  const read = cats
    ? (v) => {
        const label = catLabel(v)
        if (!label) return NaN
        if (!cats.has(label)) cats.set(label, cats.size)
        return cats.get(label)
      }
    : readX
  if (Array.isArray(d.series)) {
    d.series.forEach((s, i) => {
      const item = isObj(s) ? s : {}
      const points = []
      if (Array.isArray(item.points)) {
        for (let ptIdx = 0; ptIdx < item.points.length; ptIdx++) {
          const p = item.points[ptIdx]
          const x = isObj(p) ? read(p.x) : NaN
          const y = isObj(p) ? toNumber(p.y) : NaN
          if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y, rawX: isObj(p) ? p.x : undefined, index: ptIdx })
          else dropped++
        }
      }
      out.push({
        id: item.id != null ? String(item.id) : undefined,
        name: str(item.name) || t('chart.series', { index: i + 1 }),
        kind: kindOf(item.kind),
        points: points.sort(byX),
      })
    })
  } else if (Array.isArray(d.rows)) {
    const cols = yColumns(d.y)
    const xKey = str(d.x)
    const lists = cols.map(() => [])
    for (let rowIdx = 0; rowIdx < d.rows.length; rowIdx++) {
      const row = d.rows[rowIdx]
      const rawX = isObj(row) && xKey ? row[xKey] : undefined
      const x = isObj(row) && xKey ? read(rawX) : NaN
      if (!Number.isFinite(x)) {
        dropped++
        continue
      }
      cols.forEach((col, i) => {
        const y = toNumber(row[col.key])
        if (Number.isFinite(y)) lists[i].push({ x, y, rawX, index: rowIdx })
        else dropped++
      })
    }
    cols.forEach((col, i) => out.push({
      id: col.id != null ? String(col.id) : undefined,
      name: col.name,
      kind: col.kind,
      points: lists[i].sort(byX),
    }))
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
  const catAxis = d.xType === 'category'
  const timeAxis = d.xType !== 'number' && !catAxis
  const cats = catAxis ? new Map() : undefined

  const { all, dropped } = readSeries(d, timeAxis ? toTime : toNumber, t, cats)
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
  const barSeries = series.filter((s) => s.kind === 'bar')
  const hasBar = barSeries.length > 0
  // Areas and bars stand on the zero line, so the domain always reaches it.
  const anchored = hasArea || hasBar
  const dom = seriesDomain(series.map((s) => s.points), { includeZero: anchored })
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
    // an area or a bar is anchored on zero, so only lines get room below as well.
    const span = y1 - y0 || 1
    y1 += span * 0.12
    if (!anchored) y0 -= span * 0.12
  }

  // Bars take a band each. On a category axis the bands are the categories; on a time or number axis they are slots
  // as wide as the smallest gap between bars, so a bar sits at the x it was given. Lines and marks use the band
  // centres, so every kind lines up on one axis.
  const categories = cats ? [...cats.keys()] : []
  let slots = 0
  let slotOf = (v) => v
  if (catAxis) slots = categories.length
  else if (hasBar) {
    const xs = []
    for (const s of barSeries) for (const p of s.points) xs.push(p.x)
    xs.sort((a, b) => a - b)
    let gap = Infinity
    for (let i = 1; i < xs.length; i++) if (xs[i] > xs[i - 1]) gap = Math.min(gap, xs[i] - xs[i - 1])
    // One distinct x has no neighbour to size against: it takes half the span beside other series, or the whole plot alone.
    if (gap === Infinity) gap = x1 - x0
    slots = gap ? (x1 - x0) / gap + 1 : 1
    slotOf = (v) => (gap ? (v - x0) / gap : 0)
  }
  const banded = slots > 0
  const band = bandGeometry(slots, PAD, BOX.width - PAD, BAND_PADDING)
  const linear = scale(x0, x1, PAD, BOX.width - PAD)
  const x = banded ? (v) => band.centre(slotOf(v)) : linear
  const y = scale(y0, y1, BOX.height - PAD, PAD)
  const box = { width: BOX.width, height: BOX.height, pad: PAD, xDomain: [x0, x1], yDomain: [y0, y1] }
  // On bands the points are placed already, in drawing units, so the line takes them through an identity x.
  const lineBox = banded ? { ...box, xDomain: [PAD, BOX.width - PAD] } : box
  const barDraw = hasBar
    ? barPaths(barSeries.map((s) => s.points.map((p) => ({ x: slotOf(p.x), y: p.y }))), { width: BOX.width, height: BOX.height, pad: PAD, categories: slots, yDomain: [y0, y1], padding: BAND_PADDING })
    : { paths: [] }
  // Where a bar's own middle falls inside its band, for the mark that makes it selectable.
  const barX = (s, p) => {
    const g = barSeries.indexOf(s)
    return band.start(slotOf(p.x)) + ((g + 0.5) * band.inner) / barSeries.length
  }
  const hasZero = hasPoints && y0 <= 0 && y1 >= 0
  const zeroY = round(Math.min(BOX.height - PAD, Math.max(PAD, y(0))))

  const outSeries = series.map((s) => {
    const pts = s.points
    const n = pts.length
    if (!n) return { name: s.name, kind: s.kind, line: '', area: '', bars: '', dot: '', last: DASH, lastNum: NaN, empty: true }
    const lastPt = pts[n - 1]
    const last = show(lastPt.y)
    if (s.kind === 'bar') return { name: s.name, kind: 'bar', line: '', area: '', bars: barDraw.paths[barSeries.indexOf(s)], dot: '', last, lastNum: lastPt.y, empty: false }
    // A lone point among longer series has no direction to draw, so it is a
    // dot where it falls. Alone on the whole chart it is a level line across,
    // as in the other widgets, so the tile isn't empty.
    // On bands it is a dot at its band's centre however many bands there are.
    if (n === 1 && (x1 > x0 || banded)) {
      const px = round(x(lastPt.x))
      return { name: s.name, kind: s.kind, line: '', area: '', bars: '', dot: `M${px} ${round(y(lastPt.y))}h0`, last, lastNum: lastPt.y, empty: false }
    }
    const { line, area } = areaPaths(banded ? pts.map((p) => ({ x: x(p.x), y: p.y })) : pts, lineBox)
    const dotX = n === 1 ? round(BOX.width - PAD) : round(x(lastPt.x))
    return { name: s.name, kind: s.kind, line, area: s.kind === 'area' ? area : '', bars: '', dot: `M${dotX} ${round(y(lastPt.y))}h0`, last, lastNum: lastPt.y, empty: false }
  })

  // The axis: start, middle and end of the x domain.
  const axis = { start: '', middle: '', end: '' }
  if (hasPoints && !catAxis) {
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

  const outPoints = []
  // Each bar's value in words, for a reader who cannot see its length.
  const barLabels = []
  if (hasPoints) {
    // A point's name reads its x as the axis does: a date, or a clock time inside a day, never the raw timestamp.
    const xName = catAxis ? (v) => categories[v] : !timeAxis ? (v) => fmt.number(v, { sign: 'negative' }) : x1 - x0 < DAY_MS ? (v) => fmt.time(v) : (v) => fmt.date(v)
    for (const s of series) {
      const sKey = s.id != null && s.id !== '' ? s.id : s.name
      for (const p of s.points) {
        const px = s.kind === 'bar' ? round(barX(s, p)) : s.points.length === 1 && x1 === x0 && !banded ? round(BOX.width - PAD) : round(x(p.x))
        const py = round(y(p.y))
        outPoints.push({
          series: sKey,
          value: p.rawX !== undefined ? p.rawX : p.x,
          y: p.y,
          index: p.index,
          xPct: round(px / 4),
          yPct: round(py),
          label: `${s.name}: ${xName(p.x)}, ${show(p.y)}`,
        })
        if (s.kind === 'bar') barLabels.push(`${s.name}: ${xName(p.x)}, ${show(p.y)}`)
      }
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
    points: outPoints,
    legend: outSeries.map((s, i) => ({ name: s.name, index: i + 1 })),
    axis,
    categories,
    barLabels,
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

const SLOTS = [1, 2, 3, 4, 5, 6]

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
}<path class="zl" data-k="zero"></path>${marks('sa', 'a')}${marks('sb', 'b')}${marks('sl', 'l')}${marks('sd', 'd')}</svg><ul class="pts" data-k="pts" hidden></ul><ul class="visually-hidden" data-k="vals" hidden></ul></div>${
  ticked ? `<div class="yax n" aria-hidden="true"><div class="yin">${[0, 1, 2, 3].map((i) => `<span data-k="y${i}"></span>`).join('')}</div></div>` : ''
}</div>`

const xax = (gutter) =>
  `<div class="xax n${gutter ? ' gut' : ''}" aria-hidden="true"><div class="cats" data-k="cats" hidden></div><span data-k="x0"></span><span data-k="x1"></span><span data-k="x2"></span></div>`

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
.c-5 { --c: var(--ts-series-5); }
.c-6 { --c: var(--ts-series-6); }
.sb { fill: var(--c); stroke: none; }
/* One label per band, centred under it. The width is set in update(), so a label never reaches into its neighbour or past the plot. */
.xax > .cats { grid-column: 1 / -1; justify-self: stretch; position: relative; block-size: 14px; }
.cats span { position: absolute; transform: translateX(-50%); text-align: center; }
.sl { fill: none; stroke: var(--c); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
.sa { fill: color-mix(in srgb, var(--c) var(--ts-fill, 12%), transparent); stroke: none; }
.sd { fill: none; stroke: var(--c); stroke-width: 7; stroke-linecap: round; vector-effect: non-scaling-stroke; }
.gl { fill: none; stroke: var(--ts-line); stroke-dasharray: 2 4; vector-effect: non-scaling-stroke; }
.zl { fill: none; stroke: var(--ts-axis); stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
.sw { width: 12px; height: 3px; border-radius: 2px; flex: none; background: var(--c); }
.sw.bar { width: 10px; height: 10px; }
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
.pts, .pts li { list-style: none; margin: 0; padding: 0; position: absolute; }
.pts { inset: 0; pointer-events: none; }
.pt { display: block; width: 16px; height: 16px; transform: translate(-50%, -50%); background: transparent; border: 0; padding: 0; margin: 0; cursor: pointer; border-radius: 50%; pointer-events: auto; outline: none; }
.pt:focus-visible { outline: 2px solid var(--ts-focus, var(--ts-accent)); outline-offset: 2px; }
/* Colours are not the host's to theme here, and backgrounds are dropped, so series differ by colour AND dash and the
   swatches become coloured blocks again. Two system colours and two dash patterns tell six series apart; bars take the colour alone, as a block has no stroke to dash. */
@media (forced-colors: active) {
  .sl, .sd { stroke: CanvasText; }
  .sb { fill: CanvasText; stroke: ButtonFace; stroke-width: 1px; vector-effect: non-scaling-stroke; }
  .sl.c-2, .sd.c-2, .sl.c-4, .sd.c-4, .sl.c-6, .sd.c-6 { stroke: Highlight; }
  .sb.c-2, .sb.c-4, .sb.c-6 { fill: Highlight; }
  .sl.c-3, .sl.c-4 { stroke-dasharray: 6 3; }
  .sl.c-5, .sl.c-6 { stroke-dasharray: 2 3; }
  .gl, .zl { stroke: CanvasText; }
  .sw { background: CanvasText; }
  .sw.c-2, .sw.c-4, .sw.c-6 { background: Highlight; }
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

  constructor() {
    super()
    const onActivate = (e) => {
      const btn = e.target?.closest?.('.pt')
      if (!btn) return
      if (this._isEditing()) {
        e.preventDefault?.()
        e.stopPropagation?.()
        return
      }
      if (!this.actionEnabled(ACTION_SELECT)) return
      const idx = Number(btn.getAttribute('data-index'))
      const sKey = btn.getAttribute('data-series')
      const pt = this._points?.find((p) => p.series === sKey && p.index === idx)
      if (pt) {
        e.preventDefault?.()
        this.emit(ACTION_SELECT, { value: pt.value, series: pt.series, y: pt.y, index: pt.index })
      }
    }
    this._section.addEventListener('click', onActivate)
    this._section.addEventListener('keydown', (e) => {
      const btn = e.target?.closest?.('.pt')
      if (!btn) return
      if (this._isEditing()) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault?.()
          e.stopPropagation?.()
        }
        return
      }
      // Enter and Space reach onActivate as a click on the native button; only the arrows are ours.
      if (!/^(Arrow(Left|Right|Up|Down)|Home|End)$/.test(e.key)) return
      const btns = [...this.$('[data-k="pts"]').querySelectorAll('.pt')]
      const from = btns.indexOf(btn)
      const to = stepPoint(from, btns.length, e.key, getComputedStyle(this).direction === 'rtl')
      if (to < 0) return
      e.preventDefault()
      this._rove(btns, to)
      btns[to].focus()
    })
    // Pointer focus moves the tab stop too, so Tab leaves from where the user last was.
    this._section.addEventListener('focusin', (e) => {
      const btn = e.target?.closest?.('.pt')
      if (btn) this._rove([...this.$('[data-k="pts"]').querySelectorAll('.pt')], undefined, btn)
    })
  }

  // One tab stop for the whole group of points: the rest are reached with the arrow keys.
  _rove(btns, to, btn) {
    const next = to === undefined ? btns.indexOf(btn) : to
    if (next < 0 || next === this._active) return
    btns[this._active]?.setAttribute('tabindex', '-1')
    btns[next].setAttribute('tabindex', '0')
    this._active = next
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

    this._points = vm.points
    const ptsEl = this.$('[data-k="pts"]')
    if (ptsEl !== this._ptsEl) {
      this._ptsEl = ptsEl
      this._ptsKey = ''
    }
    if (ptsEl) {
      const selectable = this.actionEnabled('select') && Array.isArray(vm.points) && vm.points.length > 0
      ptsEl.toggleAttribute('hidden', !selectable)
      if (selectable) {
        // Arrow keys move the tab stop in place, so the markup is only rewritten when the points change, never to follow focus.
        const active = Math.min(this._active || 0, vm.points.length - 1)
        let html = ''
        let key = ''
        vm.points.forEach((pt, i) => {
          const item = (tab) => `<li style="inset-inline-start: ${pt.xPct}%; inset-block-start: ${pt.yPct}%;"><button type="button" class="pt" tabindex="${tab}" aria-label="${escapeHtml(pt.label)}" data-series="${escapeHtml(pt.series)}" data-index="${pt.index}"></button></li>`
          html += item(i === active ? 0 : -1)
          key += item(-1)
        })
        if (this._ptsKey !== key) {
          this._ptsKey = key
          this._active = active
          ptsEl.innerHTML = html
        }
      } else if (ptsEl.innerHTML) {
        this._ptsKey = ''
        ptsEl.innerHTML = ''
      }
    }

    for (const i of SLOTS) {
      const s = vm.series[i - 1]
      attr(`a${i}`, 'd', s ? s.area : '')
      attr(`b${i}`, 'd', s ? s.bars : '')
      attr(`l${i}`, 'd', s ? s.line : '')
      attr(`d${i}`, 'd', s ? s.dot : '')
      // Wide's header holds series 1 alone; the others hold every slot.
      hide(`lg${i}`, !s)
      if (variant === 'Wide' && i === 1) hide('first', !s)
      if (!s) continue
      attr(`sw${i}`, 'class', `sw c-${i}${s.kind === 'area' || s.kind === 'bar' ? ` ${s.kind}` : ''}`)
      text(`n${i}`, s.name)
      text(`v${i}`, s.last)
    }
    const s1 = vm.series && vm.series[0]
    if (s1 && Number.isFinite(s1.lastNum)) this.flash('v1', s1.lastNum, { goodWhen: this.data && this.data.goodWhen })
    attr('zero', 'd', vm.zeroPath)
    attr('grid', 'd', vm.grid)
    for (let i = 0; i < 4; i++) text(`y${i}`, vm.ticks[i] || '')
    text('x0', vm.axis.start)
    text('x1', vm.axis.middle)
    text('x2', vm.axis.end)
    this._drawCategories(vm)
    this._drawBarValues(vm, this.actionEnabled('select') && Array.isArray(vm.points) && vm.points.length > 0)
  }

  // Bars say their values in words, so colour and length are not the only way to read them. With selection on, every
  // point is a button named with its value; without it the same sentences sit in a list a screen reader can walk.
  _drawBarValues(vm, selectable) {
    const lines = selectable || !vm.barLabels ? [] : vm.barLabels
    const key = lines.join('\n')
    const el = this.$('[data-k="vals"]')
    // A new size is new markup, so what was written to the old list is gone with it.
    if (el !== this._valsEl) {
      this._valsEl = el
      this._valsKey = ''
    }
    if (!el || key === this._valsKey) return
    el.toggleAttribute('hidden', !lines.length)
    this._valsKey = key
    el.replaceChildren(...lines.map((text) => Object.assign(document.createElement('li'), { textContent: text })))
  }

  // One label per category, centred under its band. As many show as the width allows, always the first and the
  // last; the rest are skipped evenly, and a shown label is as wide as the bands it stands for, then ellipsised.
  _drawCategories(vm) {
    const labels = vm.categories || []
    if (!labels.length && !this._cats?.length) return
    const el = this.$('[data-k="cats"]')
    if (!el) return
    if (el !== this._catsEl) {
      this._catsEl = el
      this._catsKey = ''
    }
    for (const k of ['x0', 'x1', 'x2']) this.$(`[data-k="${k}"]`)?.toggleAttribute('hidden', labels.length > 0)
    el.toggleAttribute('hidden', !labels.length)
    this._cats = labels
    if (!labels.length) {
      this._catsKey = ''
      this._catsWatch?.disconnect()
      this._catsWatch = null
      return
    }
    const svg = this.$('[data-k="svg"]')
    if (typeof ResizeObserver !== 'undefined' && svg && svg !== this._catsSvg) {
      this._catsWatch?.disconnect()
      this._catsSvg = svg
      this._catsWatch = new ResizeObserver(() => this._layoutCategories())
      this._catsWatch.observe(svg)
    }
    this._layoutCategories()
  }

  _layoutCategories() {
    const el = this.$('[data-k="cats"]')
    const labels = this._cats || []
    if (!el || !labels.length) return
    const px = this.$('[data-k="svg"]')?.getBoundingClientRect?.().width || 0
    const n = labels.length
        // Until the plot has a width, every label is offered and the ellipsis does the fitting.
    const stride = px > 0 ? Math.max(1, Math.ceil(CAT_MIN_PX / (px / n))) : 1
    const shown = []
    for (let i = 0; i < n; i += stride) shown.push(i)
    // The last band always has its label; it displaces the one before it when they would touch.
    if (shown[shown.length - 1] !== n - 1) {
      if (n - 1 - shown[shown.length - 1] < stride && shown.length > 1) shown.pop()
      shown.push(n - 1)
    }
    const key = `${n}|${stride}|${labels.join('\n')}`
    if (key === this._catsKey) return
    this._catsKey = key
    // BOX padding keeps the bands off the plot's edges: the same fraction here as in the drawing.
    const inset = (PAD / BOX.width) * 100
    const span = 100 - 2 * inset
    const kids = shown.map((i) => {
      const centre = inset + ((i + 0.5) * span) / n
      const width = Math.min(stride * (span / n) * 0.9, 2 * centre, 2 * (100 - centre))
      const node = document.createElement('span')
      node.className = 'ell'
      node.textContent = labels[i]
      node.style.insetInlineStart = `${round(centre)}%`
      node.style.maxInlineSize = `${round(width)}%`
      return node
    })
    el.replaceChildren(...kids)
  }
}
