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

import { TsWidget, sk, header, arrowFor, figure, FIGURE_CSS } from './widget.js'
import { linePath, linePaths, bandPath } from './chart.js'
import { Scrubber, SCRUB_CSS, lineScrub, scrubMarkup } from './scrub.js'
import { EN, equitySeries, equityStats, toDay, toNumber } from '../core/index.js'

export const RANGES = ['1W', '1M', '3M', 'YTD', 'All']

// Characters the headline holds before fit() switches to the compact form.
export const HEADLINE_CHARS = { Wide: 10, M: 12, XL: 12 }

// viewBox size per variant. The svg is stretched to its box, so only the
// proportions matter; they match the design sheet.
const DIMS = { Wide: [400, 100], M: [600, 160], XL: [900, 220] }

const DASH = '—'

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

// The rows the core would use: a readable date and a finite P&L. Same test as
// stats.js, so a row dropped there is never counted as "the latest date" here.
// A date that isn't 'YYYY-MM-DD' (an ISO instant) is replaced by its day in
// `timeZone`, so everything after this compares plain days.
function usable(days, timeZone) {
  if (!Array.isArray(days)) return []
  const out = []
  for (const d of days) {
    if (!d || !Number.isFinite(toNumber(d.pnl))) continue
    const date = toDay(d.date, timeZone)
    if (date !== null) out.push(date === d.date ? d : { ...d, date })
  }
  return out
}

/**
 * The days a range keeps, in their input order. Unusable rows are dropped
 * whatever the range. The latest date is the latest usable one.
 */
export function filterRange(days, range, timeZone = 'UTC') {
  const rows = usable(days, timeZone)
  const r = normalizeRange(range)
  if (r === 'All' || !rows.length) return rows
  let latest = rows[0].date
  for (const d of rows) if (d.date > latest) latest = d.date
  const from = rangeStart(latest, r)
  return rows.filter((d) => d.date >= from)
}

// ── View model (pure) ─────────────────────────────────────────────────────

function monthName(fmt, iso) {
  return fmt.date(iso, { style: 'month' })
}

// Sign of a running sum, ignoring float dust: 0.1 + 0.2 - 0.3 is not a gain.
const sign = (v) => (v > 1e-9 ? 1 : v < -1e-9 ? -1 : 0)
const colour = (v) => (sign(v) > 0 ? 'pos' : sign(v) < 0 ? 'neg' : '')

/**
 * data → everything the DOM needs, as strings and numbers. `ctx` is the
 * widget context ({ fmt, label }) plus `range`.
 */
export function equityCurveModel(data, variant, ctx) {
  const { fmt, t } = ctx
  const label = ctx.label || t('widget.equityCurve.label')
  const d = data && typeof data === 'object' ? data : {}
  const range = normalizeRange(ctx.range)
  const v = DIMS[variant] ? variant : 'M'
  const [width, height] = DIMS[v]

  const timeZone = fmt.timeZone || 'UTC'
  const all = usable(d.days, timeZone)
  const rows = filterRange(all, range, timeZone)
  // The host's fees and trade count are for its whole series. They are only
  // correct for a range that kept every day; for a narrower one they would
  // describe days that aren't on screen.
  const wholeSeries = rows.length === all.length

  // The equity inside a range starts from 0 at the range start: it is the P&L
  // made over that range, not the account's running total since the first
  // day. equitySeries always starts at 0, so filtering first gives that.
  const series = equitySeries(rows, { timeZone })
  const stats = equityStats(rows, { timeZone })
  const n = series.length
  const empty = n === 0

  const givenTrades = toNumber(d.trades)
  const dayTrades = rows.some((r) => typeof r.trades === 'number' && Number.isFinite(r.trades))
  const trades = wholeSeries && Number.isFinite(givenTrades) ? givenTrades : dayTrades ? stats.trades : null
  const givenFees = toNumber(d.fees)
  const fees = wholeSeries && Number.isFinite(givenFees) ? fmt.money(givenFees, { sign: 'negative' }) : ''
  const tradesText = trades === null ? '' : t('equity.tradeCount', { count: fmt.number(trades, { decimals: 0 }) }, trades)

  const net = fmt.money(stats.net)
  const headline = fmt.fit(stats.net, HEADLINE_CHARS[v])
  const peak = fmt.money(stats.peak)
  // A drawdown is a loss, so it reads as a negative amount.
  const maxDrawdown = fmt.money(-stats.maxDrawdown)
  // A loop rather than a spread into Math.min: years of days overflow the stack.
  let lowest = n ? Infinity : 0
  for (const s of series) lowest = Math.min(lowest, s.equity)

  const dayWord = t('equity.dayCount', {}, n)
  const tradingDays = t('equity.tradingDayCount', {}, n)
  const chartLabel = empty
    ? t('equity.chartEmpty', { label })
    : t('equity.chartLabel', { label, peak, lowest: fmt.money(lowest), net })

  const points = series.map((s, i) => ({ x: i, y: s.equity }))
  const geo = linePaths(points, { width, height })
  // What the scrubber reads (RFC 0004 §1.2): the drawn points as numbers. x is the trading-day index, so a day's own
  // result is its equity less the day before's, whichever points the drawing thinned out.
  let scrub = null
  if (n > 1) {
    const labels = geo.drawn.map((p) => series[p.x].date)
    scrub = lineScrub(
      'day',
      { width, height, pad: 4 },
      geo.drawn,
      geo.x,
      geo.y,
      [
        { name: t('chart.scrubEquity'), ys: (p) => p.y, mark: true },
        { name: t('chart.scrubDay'), ys: (p) => p.y - (p.x > 0 ? series[p.x - 1].equity : 0) },
      ],
      { labels },
    )
  }
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
    // Rows the series couldn't use: no readable date or no finite P&L.
    dropped: Array.isArray(d.days) ? d.days.length - all.length : 0,
    // `long` is spoken after the short name, so "1W" is heard as "1W, 1 week" (a visually hidden expansion).
    // Only XL draws the buttons, so the other variants build none of these strings.
    ranges: v !== 'XL' ? [] : RANGES.map((value) => ({ value, on: value === range, text: t(`equity.range${value}`), long: t('equity.rangeExpand', { long: t(`equity.range${value}.long`) }) })),
    live: d.live === true,
    empty,
    // The short word fits Wide's 170px column; a host's own label is used as given.
    label: v === 'Wide' ? t('equity.wide', { label: label === t('widget.equityCurve.label') ? t('equity.short') : label, days: dayWord }) : label,
    headline,
    // The full figure, for the pointer, when fit() made the headline compact (RFC 0004 §1.5).
    headlineTitle: headline !== net ? net : '',
    // ▲ or ▼ beside each coloured figure, read from the sign the reader sees (RFC 0003 §5.5).
    headlineArrow: arrowFor(headline),
    net,
    netClass: colour(stats.net),
    peak,
    peakArrow: arrowFor(peak),
    peakClass: colour(stats.peak),
    peakNote: t('equity.peakNote', { peak }),
    maxDrawdown,
    maxDrawdownArrow: arrowFor(maxDrawdown),
    maxDrawdownClass: colour(-stats.maxDrawdown),
    tradingDays: n,
    sub: t('equity.over', { days: tradingDays }),
    daysLine: tradesText ? `${n} · ${tradesText}` : String(n),
    netOfFees: fees !== '',
    third: fees
      ? { label: t('equity.fees'), value: fees }
      : { label: t('equity.trades'), value: trades === null ? DASH : fmt.number(trades, { decimals: 0 }) },
    axis,
    chart: { width, height, line: geo.line, area: geo.area, zeroY: geo.zeroY, peakLine, band },
    chartLabel,
    scrub,
    netNum: stats.net,
    ariaLabel: empty ? t('equity.ariaEmpty', { label }) : t('equity.aria', { label, net, days: tradingDays }),
  }
}

// ── Element ───────────────────────────────────────────────────────────────

const k = (name) => `[data-k="${name}"]`

function chartMarkup(v) {
  const [w, h] = DIMS[v]
  const xl = v === 'XL'
  return `<div class="plot sc lift" part="chart" data-k="plot">
<svg data-k="svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="">
<defs><clipPath id="cu"><rect data-k="clipUp" x="0" y="0" width="${w}" height="0"></rect></clipPath><clipPath id="cd"><rect data-k="clipDn" x="0" y="0" width="${w}" height="0"></rect></clipPath></defs>
${xl ? '<path class="dd" data-k="band" d=""></path>' : ''}
<line class="lz" data-k="zero" x1="0" x2="${w}" y1="0" y2="0"></line>
${xl ? '<path class="lz" data-k="peakLine" fill="none" d=""></path>' : '<path class="ap" data-k="areaUp" d="" clip-path="url(#cu)"></path><path class="an" data-k="areaDn" d="" clip-path="url(#cd)"></path>'}
<path class="lp" data-k="lineUp" d="" clip-path="url(#cu)"></path><path class="ln" data-k="lineDn" d="" clip-path="url(#cd)"></path>
</svg>
<div class="empty" part="empty" data-k="empty" hidden></div>
${scrubMarkup(1, 2)}
</div>`
}

function rangeButtons() {
  // The short name is what a sighted user sees; the hidden expansion is what a listener also hears.
  const buttons = RANGES.map((r) => `<button type="button" class="btn" data-range="${r}" aria-pressed="false"><span data-k="rt${r}"></span><span class="visually-hidden" data-k="rl${r}"></span></button>`).join('')
  return `<div role="group" class="row rng" data-k="rangeGroup">${buttons}</div>`
}

// Loading shapes follow each variant's layout, so the figures land where the
// blocks were. The plot is one block filling the chart's box.
const plotBlock = '<div class="plot"><span class="sk"></span></div>'
const stat = (a = 60, b = 75) => `<div class="col">${sk(a, 9)}${sk(b, 16)}</div>`
const head = header()
const SKELETONS = {
  Wide: `<div class="rowl"><div class="col side">${head}${sk(70, 30)}${sk(80, 11)}</div>${plotBlock}</div>`,
  M: `${head}<div class="rowb">${sk(40, 30)}${sk(25, 11)}</div>${plotBlock}<div class="row">${sk('x', 9)}<span class="f1"></span>${sk('x', 9)}</div><div class="g3 sep stats">${stat()}${stat()}${stat()}</div>`,
  XL: `<div class="rowl xl"><div class="chartcol">${head}${plotBlock}<div class="row">${sk('x', 9)}<span class="f1"></span>${sk('x', 9)}<span class="f1"></span>${sk('x', 9)}</div></div><div class="col sep rail">${stat(50, 70).repeat(4)}</div></div>`,
}

export class TsEquityCurve extends TsWidget {
  static catalogKey = 'equityCurve'
  static emptyText = EN['widget.equityCurve.empty']
  static dataShape = {
    days: { kind: 'array', of: { date: 'time', pnl: 'numeric' } },
    fees: { kind: 'numeric', optional: true },
    trades: { kind: 'number', optional: true },
    asOf: { kind: 'time', optional: true },
    live: { kind: 'boolean', optional: true },
  }

  // Density and text size (RFC 0004 §2), kept out of the stylesheet because a comment in it ships to every page:
  // - The side column and the rail have a min-width, not a width, so a figure that grows (letter spacing, a larger root font
  //   size) widens its column instead of running into the chart or past the tile. The side's header and note are inline-size
  //   contained, so only the figure counts and a long label still ellipsizes.
  // - A compact two-row tile is 14rem of content, 3rem short of a comfortable one (17rem), so at 15rem and below the rail's
  //   four stats give up their note and tighten before the last one is cut.
  static styles = `${FIGURE_CSS}${SCRUB_CSS}
[hidden] { display: none !important; }
.rowl { flex: 1; min-height: 0; display: flex; flex-direction: row; align-items: stretch; gap: 20px; }
.rowl.xl { gap: 24px; }
/* Time runs left to right in every locale, so the drawing box and its axis never mirror. */
.plot, .ax { direction: ltr; }
.ax > span { unicode-bidi: plaintext; }
.plot { position: relative; flex: 1; min-height: 0; min-width: 0; }
.plot svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.plot .empty { position: absolute; inset: 0; font-size: var(--ts-text-md, max(12px, .75rem)); unicode-bidi: plaintext; }
.plot .sk { position: absolute; inset: 0; width: auto; }
.dd { fill: color-mix(in srgb, var(--ts-loss) 22%, transparent); }
.side { min-width: 170px; flex: none; justify-content: space-between; }
.side > .hd, .side > .sec { contain: inline-size; }
.chartcol { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.rng { gap: 4px; }
.rail { min-width: 220px; flex: none; gap: 16px; }
.rail.sep { border-top: 0; border-inline-start: 1px solid var(--ts-line); padding-inline-start: 24px; }
.stats { padding-block-start: 10px; }
/* The net figure and its arrow fill the Wide side column: 10 characters of a monospace face (0.6em each) and the arrow
   (0.4em) are 6.4em. A narrow tile keeps the 170px column and sizes the figure to it; a roomy one widens the column and
   keeps the 34px headline. The column is a minimum, so a larger figure widens it, and the figure never wraps or clips. */
.side .big { font-size: var(--ts-text-3xl, max(26px, 1.625rem)); }
@container ts-tile (max-height: 15rem) { .rail { gap: 6px; } .shd { display: none; } }
@container (min-width: 420px) { .side { min-width: 220px; } .side .big { font-size: var(--ts-text-big, max(34px, 2.125rem)); } }
`

  static get observedAttributes() {
    return [...super.observedAttributes, 'range']
  }

  static template(variant) {
    if (variant === 'Wide') {
      return `<div class="rowl">
<div class="col side">${header({ dot: true, meta: true })}${figure('big', 'net', 'value')}<span class="sm mut sec" data-k="peakNote"></span></div>
${chartMarkup('Wide')}
</div>`
    }
    if (variant === 'XL') {
      return `<div class="rowl xl">
<div class="chartcol">
${header({ dot: true, meta: true, extra: rangeButtons() })}
${chartMarkup('XL')}
<div class="row sm mut ax ter"><span data-k="ax0"></span><span class="f1"></span><span data-k="ax1"></span><span class="f1"></span><span data-k="ax2"></span></div>
</div>
<div class="col sep rail">
<div class="col"><span class="lb" data-k="lbNet"></span>${figure('big', 'net', 'value')}</div>
<div class="col cell"><span class="lb" data-k="lbPeak"></span>${figure('n md', 'peak')}</div>
<div class="col cell"><span class="lb" data-k="lbDrawdown"></span>${figure('n md', 'maxDrawdown')}<span class="sm mut shd" data-k="shaded"></span></div>
<div class="col"><span class="lb" data-k="lbDays"></span><span class="n md" data-k="daysLine"></span></div>
</div>
</div>`
    }
    return `${header({ dot: true, meta: true, extra: '<span class="sm mut" data-k="fees" hidden></span>' })}
<div class="rowb">${figure('big', 'net', 'value')}<span class="sm mut sec" data-k="sub"></span></div>
${chartMarkup('M')}
<div class="row sm mut ax ter"><span data-k="ax0"></span><span class="f1"></span><span data-k="ax1"></span></div>
<div class="g3 sep stats">
<div class="col cell"><span class="lb" data-k="lbPeak"></span>${figure('n md', 'peak')}</div>
<div class="col cell"><span class="lb" data-k="lbDrawdown"></span>${figure('n md', 'maxDrawdown')}</div>
<div class="col cell"><span class="lb" data-k="thirdLabel"></span><span class="n md" data-k="thirdValue"></span></div>
</div>`
  }

  static skeleton(variant) {
    return SKELETONS[variant] || SKELETONS.M
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
    this._scrubber = new Scrubber(this)
    // One listener on the tile: the buttons are rebuilt when the variant changes.
    this._section.addEventListener('click', (e) => {
      const button = e.target && e.target.closest ? e.target.closest('button[data-range]') : null
      if (!button) return
      const value = button.getAttribute('data-range')
      if (value === this.range) return
      const previous = this.range
      this.range = value
      // A host that cancels the action keeps the range it had.
      if (!this.emit('range', { value })) this.range = previous
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

    const t = this.t
    // The arrow and the figure are their own nodes inside the tone-coloured figure.
    const fig = (key, base, value, arrow, tone) => {
      text(`${key}Ar`, arrow)
      text(`${key}V`, value)
      cls(key, base, tone)
      const el = this.$(k(key))
      if (el) el.style.setProperty('--fc', String(value.length))
    }
    text('label', vm.label)
    fig('net', 'big', vm.headline, vm.headlineArrow, vm.netClass)
    // The title goes on the headline value (part="value"), so the tooltip is over the number alone (RFC 0004 §1.5).
    this._setAttr(this.$(k('net')), 'title', vm.headlineTitle || null)
    this.flash('net', vm.netNum)
    text('empty', t('equity.noDays'))

    if (variant === 'Wide') text('peakNote', vm.peakNote)
    if (variant !== 'Wide') {
      text('lbPeak', t('equity.peak'))
      text('lbDrawdown', t('equity.maxDrawdown'))
      fig('peak', 'n md', vm.peak, vm.peakArrow, vm.peakClass)
      fig('maxDrawdown', 'n md', vm.maxDrawdown, vm.maxDrawdownArrow, vm.maxDrawdownClass)
    }
    if (variant === 'M') {
      text('sub', vm.sub)
      // Only when the host gave fees: otherwise the figure isn't net of anything.
      const net = this.$(k('fees'))
      if (net) net.toggleAttribute('hidden', !vm.netOfFees)
      text('fees', t('equity.netOfFees'))
      text('thirdLabel', vm.third.label)
      text('thirdValue', vm.third.value)
      const live = this.$(k('dot'))
      if (live) live.toggleAttribute('hidden', !vm.live)
    }
    if (variant === 'XL') {
      text('lbNet', t('equity.net'))
      text('lbDays', t('equity.tradingDays'))
      text('shaded', t('equity.shaded'))
      text('daysLine', vm.daysLine)
      const group = this.$(k('rangeGroup'))
      if (group) group.setAttribute('aria-label', t('equity.rangeLabel'))
      for (const r of vm.ranges) {
        const button = this.$(`button[data-range="${r.value}"]`)
        if (!button) continue
        text(`rt${r.value}`, r.text)
        text(`rl${r.value}`, r.long)
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
    this._scrubber?.sync(vm.scrub, vm.ariaLabel)
  }
}
