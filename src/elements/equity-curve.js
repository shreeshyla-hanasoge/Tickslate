/**
 * <ts-equity-curve>: cumulative P&L from a daily series, with the running
 * peak and the worst drawdown (RFC 0001 §8.5, widget 2).
 *
 * The widget accumulates the days itself (the core's equitySeries) and filters
 * them by `range`. Range buttons are a display control, so XL always shows
 * them; pressing one sets `range` and asks the host to know about it with
 * ts-action { action: 'range', value }.
 *
 * Everything that needs thinking about lives in equityCurveModel and
 * filterRange, which are pure; the element only writes their result into the
 * DOM its template built.
 */

import { TsWidget } from './widget.js'
import { linePath, linePaths, bandPath } from './chart.js'
import { WIDGETS, equitySeries, equityStats, toNumber } from '../core/index.js'

export const RANGES = ['1W', '1M', '3M', 'YTD', 'All']

// Characters the headline holds before fit() switches to the compact form.
export const HEADLINE_CHARS = { Wide: 10, M: 12, XL: 12 }

// viewBox size per variant. The svg is stretched to its box, so only the
// proportions matter; they match the design sheet.
const DIMS = { Wide: [400, 100], M: [600, 160], XL: [900, 220] }

const DASH = '—'
const ISO = /^\d{4}-\d{2}-\d{2}$/

// ── Range filtering (pure) ────────────────────────────────────────────────

/** A known range, matched without regard to case; anything else is 'All'. */
export function normalizeRange(range) {
  if (typeof range !== 'string') return 'All'
  const wanted = range.trim().toUpperCase()
  return RANGES.find((r) => r.toUpperCase() === wanted) || 'All'
}

const parts = (iso) => [Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10))]
const two = (n) => String(n).padStart(2, '0')

function shiftDays(iso, n) {
  const [y, m, d] = parts(iso)
  return new Date(Date.UTC(y, m - 1, d) + n * 86400000).toISOString().slice(0, 10)
}

/**
 * `n` months before `iso`, on the same day of the month. A day the earlier
 * month doesn't have (31 March back one month) clamps to that month's last
 * day (28 or 29 February) rather than spilling into the next month, so "one
 * month" never reaches less than a month back.
 */
function shiftMonths(iso, n) {
  const [y, m, d] = parts(iso)
  const t = y * 12 + (m - 1) - n
  const ny = Math.floor(t / 12)
  const nm = (t % 12) + 1
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate()
  return `${String(ny).padStart(4, '0')}-${two(nm)}-${two(Math.min(d, last))}`
}

/**
 * The first date (inclusive) a range keeps, counted back from the latest date
 * in the data, not from today's clock: a report that ends last Friday still
 * has a "last month". 1W is the 7 calendar days ending on that date.
 */
export function rangeStart(latest, range) {
  switch (normalizeRange(range)) {
    case '1W':
      return shiftDays(latest, -6)
    case '1M':
      return shiftMonths(latest, 1)
    case '3M':
      return shiftMonths(latest, 3)
    case 'YTD':
      return `${latest.slice(0, 4)}-01-01`
    default:
      return ''
  }
}

// The rows the core would use: a real date and a finite P&L. Same test as
// stats.js, so a row dropped there is never counted as "the latest date" here.
function usable(days) {
  if (!Array.isArray(days)) return []
  return days.filter((d) => d && typeof d.date === 'string' && ISO.test(d.date) && Number.isFinite(toNumber(d.pnl)))
}

/**
 * The days a range keeps, in their input order. Unusable rows are dropped
 * whatever the range. The latest date is the latest usable one.
 */
export function filterRange(days, range) {
  const rows = usable(days)
  const r = normalizeRange(range)
  if (r === 'All' || !rows.length) return rows
  let latest = rows[0].date
  for (const d of rows) if (d.date > latest) latest = d.date
  const from = rangeStart(latest, r)
  return rows.filter((d) => d.date >= from)
}

// ── View model (pure) ─────────────────────────────────────────────────────

const monthFormats = new Map()
function monthName(fmt, iso) {
  const key = String(fmt.locale)
  let f = monthFormats.get(key)
  if (!f) monthFormats.set(key, (f = new Intl.DateTimeFormat(fmt.locale, { month: 'short', timeZone: 'UTC' })))
  const [y, m, d] = parts(iso)
  return f.format(Date.UTC(y, m - 1, d))
}

// Sign of a running sum, ignoring float dust: 0.1 + 0.2 - 0.3 is not a gain.
const sign = (v) => (v > 1e-9 ? 1 : v < -1e-9 ? -1 : 0)
const colour = (v) => (sign(v) > 0 ? 'pos' : sign(v) < 0 ? 'neg' : '')
const plural = (n, word, shown = n) => `${shown} ${word}${n === 1 ? '' : 's'}`

/**
 * data → everything the DOM needs, as strings and numbers. `ctx` is the
 * widget context ({ fmt, label }) plus `range`.
 */
export function equityCurveModel(data, variant, ctx) {
  const { fmt } = ctx
  const label = ctx.label || WIDGETS.equityCurve.label
  const d = data && typeof data === 'object' ? data : {}
  const range = normalizeRange(ctx.range)
  const v = DIMS[variant] ? variant : 'M'
  const [width, height] = DIMS[v]

  const all = usable(d.days)
  const rows = filterRange(d.days, range)
  // The host's fees and trade count are for its whole series. They are only
  // correct for a range that kept every day; for a narrower one they would
  // describe days that aren't on screen.
  const wholeSeries = rows.length === all.length

  // The equity inside a range starts from 0 at the range start: it is the P&L
  // made over that range, not the account's running total since the first
  // day. equitySeries always starts at 0, so filtering first gives that.
  const series = equitySeries(rows)
  const stats = equityStats(rows)
  const n = series.length
  const empty = n === 0

  const givenTrades = toNumber(d.trades)
  const dayTrades = rows.some((r) => typeof r.trades === 'number' && Number.isFinite(r.trades))
  const trades = wholeSeries && Number.isFinite(givenTrades) ? givenTrades : dayTrades ? stats.trades : null
  const givenFees = toNumber(d.fees)
  const fees = wholeSeries && Number.isFinite(givenFees) ? fmt.money(givenFees, { sign: 'negative' }) : ''
  const tradesText = trades === null ? '' : plural(trades, 'trade', fmt.number(trades, { decimals: 0 }))

  const net = fmt.money(stats.net)
  const peak = fmt.money(stats.peak)
  // A drawdown is a loss, so it reads as a negative amount.
  const maxDrawdown = fmt.money(-stats.maxDrawdown)
  // A loop rather than a spread into Math.min: years of days overflow the stack.
  let lowest = n ? Infinity : 0
  for (const s of series) lowest = Math.min(lowest, s.equity)

  const dayWord = plural(n, 'day')
  const tradingDays = plural(n, 'trading day')
  const chartLabel = empty
    ? `${label}: no trading days in this range`
    : `${label}: peak ${peak}, lowest ${fmt.money(lowest)}, ends at ${net}`

  const points = series.map((s, i) => ({ x: i, y: s.equity }))
  const geo = linePaths(points, { width, height })
  let peakLine = ''
  let band = ''
  if (v === 'XL' && n > 1) {
    const peaks = series.map((s, i) => ({ x: i, y: s.peak }))
    peakLine = linePath(peaks, geo.x, geo.y)
    band = bandPath(points, peaks, geo.x, geo.y)
  }

  // Month names for the axis, by position in the series (x is the trading-day
  // index, so a weekend is not a gap). A name already shown nearby is left out.
  const names = empty
    ? []
    : [series[0], series[Math.floor((n - 1) / 2)], series[n - 1]].map((s) => monthName(fmt, s.date))
  let axis
  if (v === 'XL') {
    const [a, b, c] = empty ? ['', '', ''] : names
    const mid = b === a || b === c ? '' : b
    axis = [a, mid, c === a && !mid ? '' : c]
  } else {
    axis = empty ? ['', ''] : [names[0], names[2] === names[0] ? '' : names[2]]
  }

  return {
    variant: v,
    range,
    ranges: RANGES.map((value) => ({ value, on: value === range })),
    live: d.live === true,
    empty,
    // The short word fits Wide's 170px column; a host's own label is used as given.
    label: v === 'Wide' ? `${label === WIDGETS.equityCurve.label ? 'Equity' : label} · ${dayWord}` : label,
    headline: fmt.fit(stats.net, HEADLINE_CHARS[v]),
    net,
    netClass: colour(stats.net),
    peak,
    peakClass: colour(stats.peak),
    peakNote: `peak ${peak}`,
    maxDrawdown,
    maxDrawdownClass: colour(-stats.maxDrawdown),
    tradingDays: n,
    sub: `over ${tradingDays}`,
    daysLine: tradesText ? `${n} · ${tradesText}` : String(n),
    third: fees
      ? { label: 'Fees', value: fees }
      : { label: 'Trades', value: trades === null ? DASH : fmt.number(trades, { decimals: 0 }) },
    axis,
    chart: { width, height, line: geo.line, area: geo.area, zeroY: geo.zeroY, peakLine, band },
    chartLabel,
    ariaLabel: empty ? `${label}, no trading days in this range` : `${label}, ${net} over ${tradingDays}`,
  }
}

// ── Element ───────────────────────────────────────────────────────────────

const k = (name) => `[data-k="${name}"]`

function chartMarkup(v) {
  const [w, h] = DIMS[v]
  const xl = v === 'XL'
  return `<div class="plot">
<svg data-k="svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="">
<defs><clipPath id="cu"><rect data-k="clipUp" x="0" y="0" width="${w}" height="0"></rect></clipPath><clipPath id="cd"><rect data-k="clipDn" x="0" y="0" width="${w}" height="0"></rect></clipPath></defs>
${xl ? '<path class="dd" data-k="band" d=""></path>' : ''}
<line class="lz" data-k="zero" x1="0" x2="${w}" y1="0" y2="0"></line>
${xl ? '<path class="lz" data-k="peakLine" fill="none" d=""></path>' : '<path class="ap" data-k="areaUp" d="" clip-path="url(#cu)"></path><path class="an" data-k="areaDn" d="" clip-path="url(#cd)"></path>'}
<path class="lp" data-k="lineUp" d="" clip-path="url(#cu)"></path><path class="ln" data-k="lineDn" d="" clip-path="url(#cd)"></path>
</svg>
<div class="empty" data-k="empty" hidden>No trading days in this range</div>
</div>`
}

function rangeButtons() {
  const buttons = RANGES.map((r) => `<button type="button" class="btn" data-range="${r}" aria-pressed="false">${r}</button>`).join('')
  return `<div role="group" aria-label="Range" class="row rng">${buttons}</div>`
}

export class TsEquityCurve extends TsWidget {
  static catalogKey = 'equityCurve'

  static styles = `
[hidden] { display: none !important; }
.rowl { flex: 1; min-height: 0; display: flex; flex-direction: row; align-items: stretch; gap: 20px; }
.rowl.xl { gap: 24px; }
.plot { position: relative; flex: 1; min-height: 0; min-width: 0; }
.plot svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.plot .empty { position: absolute; inset: 0; font-size: 12px; }
.dd { fill: color-mix(in srgb, var(--ts-loss) 22%, transparent); }
.side { width: 170px; flex: none; justify-content: space-between; }
.chartcol { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.rng { gap: 4px; }
.rail { width: 220px; flex: none; gap: 16px; }
.rail.sep { border-top: 0; border-left: 1px solid var(--ts-line); padding-left: 24px; }
.stats { padding-top: 10px; }
`

  static get observedAttributes() {
    return [...super.observedAttributes, 'range']
  }

  static template(variant) {
    if (variant === 'Wide') {
      return `<div class="rowl">
<div class="col side"><span class="lb" data-k="label"></span><span class="big" data-k="net"></span><span class="sm mut" data-k="peakNote"></span></div>
${chartMarkup('Wide')}
</div>`
    }
    if (variant === 'XL') {
      return `<div class="rowl xl">
<div class="chartcol">
<div class="hd"><span class="lb" data-k="label"></span><span class="f1"></span>${rangeButtons()}</div>
${chartMarkup('XL')}
<div class="row sm mut"><span data-k="ax0"></span><span class="f1"></span><span data-k="ax1"></span><span class="f1"></span><span data-k="ax2"></span></div>
</div>
<div class="col sep rail">
<div class="col"><span class="lb">Net</span><span class="big" data-k="net"></span></div>
<div class="col"><span class="lb">Peak</span><span class="n md" data-k="peak"></span></div>
<div class="col"><span class="lb">Max drawdown</span><span class="n md" data-k="maxDrawdown"></span><span class="sm mut">shaded on the chart</span></div>
<div class="col"><span class="lb">Trading days</span><span class="n md" data-k="daysLine"></span></div>
</div>
</div>`
    }
    return `<div class="hd"><span class="lb" data-k="label"></span><span class="dot live" data-k="live" hidden></span><span class="f1"></span><span class="sm mut">net of fees</span></div>
<div class="rowb"><span class="big" data-k="net"></span><span class="sm mut" data-k="sub"></span></div>
${chartMarkup('M')}
<div class="row sm mut"><span data-k="ax0"></span><span class="f1"></span><span data-k="ax1"></span></div>
<div class="g3 sep stats">
<div class="col"><span class="lb">Peak</span><span class="n md" data-k="peak"></span></div>
<div class="col"><span class="lb">Max drawdown</span><span class="n md" data-k="maxDrawdown"></span></div>
<div class="col"><span class="lb" data-k="thirdLabel"></span><span class="n md" data-k="thirdValue"></span></div>
</div>`
  }

  // The range is the one thing the pure model needs beyond the data and formatter.
  viewContext() {
    return { range: this.range }
  }

  static viewModel(data, variant, ctx) {
    return equityCurveModel(data, variant, ctx)
  }

  get range() {
    return normalizeRange(this.getAttribute('range'))
  }

  set range(value) {
    if (value === null || value === undefined || value === '') this.removeAttribute('range')
    else this.setAttribute('range', value)
    this.requestRender()
  }

  constructor() {
    super()
    // One listener on the tile: the buttons are rebuilt when the variant changes.
    this._section.addEventListener('click', (e) => {
      const button = e.target && e.target.closest ? e.target.closest('button[data-range]') : null
      if (!button) return
      const value = button.getAttribute('data-range')
      if (value === this.range) return
      this.range = value
      this.emit('range', { value })
    })
  }

  connectedCallback() {
    this.upgrade('range')
    super.connectedCallback()
  }

  update(vm, variant) {
    const text = (key, value) => {
      const el = this.$(k(key))
      if (el && el.textContent !== value) el.textContent = value
    }
    const attr = (key, name, value) => {
      const el = this.$(k(key))
      if (el) el.setAttribute(name, value)
    }
    const cls = (key, base, extra) => attr(key, 'class', extra ? `${base} ${extra}` : base)

    text('label', vm.label)
    text('net', vm.headline)
    cls('net', 'big', vm.netClass)

    if (variant === 'Wide') text('peakNote', vm.peakNote)
    if (variant !== 'Wide') {
      text('peak', vm.peak)
      cls('peak', 'n md', vm.peakClass)
      text('maxDrawdown', vm.maxDrawdown)
      cls('maxDrawdown', 'n md', vm.maxDrawdownClass)
    }
    if (variant === 'M') {
      text('sub', vm.sub)
      text('thirdLabel', vm.third.label)
      text('thirdValue', vm.third.value)
      const live = this.$(k('live'))
      if (live) live.toggleAttribute('hidden', !vm.live)
    }
    if (variant === 'XL') {
      text('daysLine', vm.daysLine)
      for (const r of vm.ranges) {
        const button = this.$(`button[data-range="${r.value}"]`)
        if (!button) continue
        button.setAttribute('class', r.on ? 'btn on' : 'btn')
        button.setAttribute('aria-pressed', r.on ? 'true' : 'false')
      }
    }
    vm.axis.forEach((name, i) => text(`ax${i}`, name))

    const c = vm.chart
    attr('svg', 'aria-label', vm.chartLabel)
    this.$(k('svg')).toggleAttribute('hidden', vm.empty)
    this.$(k('empty')).toggleAttribute('hidden', !vm.empty)
    attr('zero', 'y1', c.zeroY)
    attr('zero', 'y2', c.zeroY)
    // The profit colour is clipped to above zero and the loss colour below it.
    attr('clipUp', 'height', c.zeroY)
    attr('clipDn', 'y', c.zeroY)
    attr('clipDn', 'height', c.height - c.zeroY)
    attr('lineUp', 'd', c.line)
    attr('lineDn', 'd', c.line)
    if (variant === 'XL') {
      attr('band', 'd', c.band)
      attr('peakLine', 'd', c.peakLine)
    } else {
      attr('areaUp', 'd', c.area)
      attr('areaDn', 'd', c.area)
    }
  }
}
